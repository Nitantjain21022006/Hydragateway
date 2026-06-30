/**
 * gateway/src/middleware/rateLimiter.js  (Phase 7)
 *
 * Redis-backed Fixed Window Rate Limiter
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Algorithm: Fixed Window Counter
 * ──────────────────────────────────────────────────────────────────────────
 * Within each time window of RATE_LIMIT_WINDOW_MS milliseconds we maintain
 * two independent counters in Redis:
 *
 *   rl:ip:<normalised_ip>:<windowStart>   ← per-IP counter
 *   rl:user:<userId>:<windowStart>         ← per-user counter (if authed)
 *
 * windowStart = Math.floor(Date.now() / windowMs) * windowMs
 *
 * On each request:
 *   1. Compute the current windowStart.
 *   2. INCR the appropriate key(s).
 *   3. If the key was just created (INCR returns 1), set EXPIRE = window seconds.
 *   4. If the counter exceeds the limit, return 429 with Retry-After.
 *   5. Otherwise, inject rate-limit headers and call next().
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Distributed correctness (Phase 7 requirement)
 * ──────────────────────────────────────────────────────────────────────────
 * Because Redis is external and shared, all Gateway instances see the same
 * counters. INCR is atomic in Redis so there are no race conditions between
 * instances.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Failure scenarios
 * ──────────────────────────────────────────────────────────────────────────
 * - Redis unavailable → Fail-open: allow request, log warning.
 *   Rationale: a rate limiter outage should not cause a site-wide outage.
 *   In high-security deployments flip RATE_LIMIT_FAIL_OPEN=false to fail-closed.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Redis data model
 * ──────────────────────────────────────────────────────────────────────────
 * Key type   : STRING (integer counter)
 * Key schema : rl:<scope>:<identifier>:<windowStart>
 *   scope      : "ip" | "user"
 *   identifier : client IP or userId
 *   windowStart: epoch ms rounded down to window boundary
 * TTL        : ceil(windowMs / 1000) seconds (auto-expires each window)
 *
 * Example keys (60 s window, window started at epoch 1700000000000):
 *   rl:ip:127.0.0.1:1700000000000         value="7"  ttl=53s
 *   rl:user:64abc123def456:1700000000000  value="3"  ttl=53s
 */

'use strict';

const { getRedisClient } = require('../../../../shared/config/redisClient');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-ratelimit');

// ── Config ────────────────────────────────────────────────────────────────────
const WINDOW_MS  = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);  // 60 s
const MAX        = parseInt(process.env.RATE_LIMIT_MAX       || '100',   10);  // 100 req/window
const FAIL_OPEN  = process.env.RATE_LIMIT_FAIL_OPEN !== 'false'; // default: fail-open
const WINDOW_SEC = Math.ceil(WINDOW_MS / 1000);

// ── Rate-limit exempt paths ───────────────────────────────────────────────────
// Monitoring and internal dashboard routes must never be blocked by rate limiting.
// If /analytics is rate-limited an IP burst test could lock out the dashboard.
// /health is the LB and orchestrator's liveness probe — blocking it causes
// false-positive service-down events in the health poller.
const RATE_LIMIT_EXEMPT_PREFIXES = [
  '/health',
  '/analytics',
];

/**
 * isRateLimitExempt – returns true for monitoring/dashboard paths that
 * should bypass the IP counter entirely.
 * @param {string} path
 * @returns {boolean}
 */
function isRateLimitExempt(path) {
  return RATE_LIMIT_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * windowStart – returns the epoch ms of the current fixed window's start.
 * All instances computing this for the same clock second will agree.
 */
function windowStart() {
  return Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
}

/**
 * buildKey – constructs a namespaced Redis key.
 * @param {'ip'|'user'} scope
 * @param {string} identifier
 * @returns {string}
 */
function buildKey(scope, identifier) {
  const win = windowStart();
  return `rl:${scope}:${identifier}:${win}`;
}

/**
 * incrementAndCheck – atomically increment a Redis counter and return
 * the new value.  Sets an EXPIRE on first increment.
 *
 * Uses a pipeline so INCR + EXPIRE is sent in a single round-trip.
 * @param {Redis} redis
 * @param {string} key
 * @returns {Promise<number>} new counter value
 */
async function incrementAndCheck(redis, key) {
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, WINDOW_SEC);
  const results = await pipeline.exec();
  // results[0] = [err, incrResult]
  return results[0][1];
}

/**
 * normaliseIp – strips IPv6-mapped IPv4 prefix (::ffff:) so keys are compact.
 * @param {string} ip
 * @returns {string}
 */
function normaliseIp(ip) {
  if (!ip) return 'unknown';
  return ip.replace(/^::ffff:/, '');
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * rateLimiter – Express middleware.
 *
 * Checks BOTH per-IP and per-User (if authenticated) limits.
 * A request is blocked if EITHER limit is exceeded.
 *
 * Response headers (RFC 6585 convention):
 *   X-RateLimit-Limit     : max allowed requests per window
 *   X-RateLimit-Remaining : requests left in current window (pessimistic)
 *   X-RateLimit-Reset     : epoch seconds when the current window resets
 *   Retry-After           : seconds until window resets (only on 429)
 */
async function rateLimiter(req, res, next) {
  // Skip rate limiting for exempt monitoring / dashboard paths
  if (isRateLimitExempt(req.path)) {
    return next();
  }

  let redis;

  try {
    redis = getRedisClient();
  } catch (err) {
    // Redis client failed to initialise (e.g. module not installed)
    logger.warn('[RateLimit] Could not get Redis client – failing open', {
      correlationId: req.correlationId,
      error: err.message,
    });
    return next();
  }

  const clientIp  = normaliseIp(req.ip || req.connection.remoteAddress);
  const userId    = req.user ? req.user.userId : null;

  // Window metadata for response headers
  const win       = windowStart();
  const resetEpochSec = Math.ceil((win + WINDOW_MS) / 1000);
  const retryAfter    = Math.ceil((win + WINDOW_MS - Date.now()) / 1000);

  // Shared header setter
  function setRateLimitHeaders(remaining) {
    res.setHeader('X-RateLimit-Limit',     MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset',     resetEpochSec);
  }

  try {
    // ── 1. Per-IP check ──────────────────────────────────────────────────────
    const ipKey   = buildKey('ip', clientIp);
    const ipCount = await incrementAndCheck(redis, ipKey);

    if (ipCount > MAX) {
      logger.warn(`[RateLimit] IP ${clientIp} exceeded limit (${ipCount}/${MAX})`, {
        correlationId: req.correlationId,
        key: ipKey,
      });
      setRateLimitHeaders(0);
      res.setHeader('Retry-After', retryAfter);
      return next(
        new AppError(
          `Rate limit exceeded. Try again in ${retryAfter}s.`,
          429,
          'RATE_LIMIT_EXCEEDED',
          { limit: MAX, window: `${WINDOW_SEC}s`, retryAfter }
        )
      );
    }

    // ── 2. Per-User check (authenticated requests only) ───────────────────────
    if (userId) {
      const userKey   = buildKey('user', userId);
      const userCount = await incrementAndCheck(redis, userKey);

      if (userCount > MAX) {
        logger.warn(`[RateLimit] User ${userId} exceeded limit (${userCount}/${MAX})`, {
          correlationId: req.correlationId,
          key: userKey,
        });
        setRateLimitHeaders(0);
        res.setHeader('Retry-After', retryAfter);
        return next(
          new AppError(
            `User rate limit exceeded. Try again in ${retryAfter}s.`,
            429,
            'RATE_LIMIT_EXCEEDED',
            { limit: MAX, window: `${WINDOW_SEC}s`, retryAfter }
          )
        );
      }

      // Both limits OK — use the more restrictive remaining count
      const remaining = Math.min(MAX - ipCount, MAX - userCount);
      setRateLimitHeaders(remaining);
    } else {
      // Unauthenticated — only IP limit applies
      setRateLimitHeaders(MAX - ipCount);
    }

    return next();
  } catch (err) {
    // Redis operation failed mid-flight
    logger.warn('[RateLimit] Redis error during rate limit check', {
      correlationId: req.correlationId,
      error: err.message,
    });

    if (FAIL_OPEN) {
      // Graceful degradation — allow request through
      return next();
    }

    // Fail-closed — reject request
    return next(new AppError('Rate limiter unavailable', 503, 'RATE_LIMITER_ERROR'));
  }
}

module.exports = { rateLimiter };

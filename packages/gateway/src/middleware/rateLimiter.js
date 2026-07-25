/**
 * Redis-backed fixed window rate limiter middleware for API Gateway.
 * Enforces per-IP and per-user request limits with fail-open capability.
 * Exports rateLimiter middleware function.
 */

'use strict';

const { getRedisClient } = require('../../../../shared/config/redisClient');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-ratelimit');

const WINDOW_MS  = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const MAX        = parseInt(process.env.RATE_LIMIT_MAX       || '100',   10);
const FAIL_OPEN  = process.env.RATE_LIMIT_FAIL_OPEN !== 'false';
const WINDOW_SEC = Math.ceil(WINDOW_MS / 1000);

const RATE_LIMIT_EXEMPT_PREFIXES = [
  '/health',
  '/analytics',
];

function isRateLimitExempt(path) {
  return RATE_LIMIT_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function windowStart() {
  return Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
}

function buildKey(scope, identifier) {
  const win = windowStart();
  return `rl:${scope}:${identifier}:${win}`;
}

async function incrementAndCheck(redis, key) {
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, WINDOW_SEC);
  const results = await pipeline.exec();
  return results[0][1];
}

function normaliseIp(ip) {
  if (!ip) return 'unknown';
  return ip.replace(/^::ffff:/, '');
}

async function rateLimiter(req, res, next) {
  if (isRateLimitExempt(req.path)) {
    return next();
  }

  let redis;

  try {
    redis = getRedisClient();
  } catch (err) {
    logger.warn('[RateLimit] Could not get Redis client – failing open', {
      correlationId: req.correlationId,
      error: err.message,
    });
    return next();
  }

  const clientIp  = normaliseIp(req.ip || req.connection.remoteAddress);
  const userId    = req.user ? req.user.userId : null;

  const win       = windowStart();
  const resetEpochSec = Math.ceil((win + WINDOW_MS) / 1000);
  const retryAfter    = Math.ceil((win + WINDOW_MS - Date.now()) / 1000);

  function setRateLimitHeaders(remaining) {
    res.setHeader('X-RateLimit-Limit',     MAX);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset',     resetEpochSec);
  }

  try {
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

      const remaining = Math.min(MAX - ipCount, MAX - userCount);
      setRateLimitHeaders(remaining);
    } else {
      setRateLimitHeaders(MAX - ipCount);
    }

    return next();
  } catch (err) {
    logger.warn('[RateLimit] Redis error during rate limit check', {
      correlationId: req.correlationId,
      error: err.message,
    });

    if (FAIL_OPEN) {
      return next();
    }

    return next(new AppError('Rate limiter unavailable', 503, 'RATE_LIMITER_ERROR'));
  }
}

module.exports = { rateLimiter };

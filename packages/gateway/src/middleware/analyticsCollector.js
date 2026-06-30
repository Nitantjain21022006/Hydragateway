/**
 * gateway/src/middleware/analyticsCollector.js  (Phase 10)
 *
 * Analytics Collection Middleware – Redis-backed request metrics pipeline.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * What we track:
 * ──────────────────────────────────────────────────────────────────────────
 *  1. Total Requests            – global counter, incremented on every request
 *  2. Failed Requests           – incremented when the response status >= 400
 *  3. Per-Service Request Count – which downstream service was hit
 *  4. Per-Gateway-Instance count – how many requests each gateway handled
 *  5. Average Response Time     – stored via a running sum + count pair
 *  6. Status Code Buckets       – 2xx / 3xx / 4xx / 5xx breakdown
 *  7. Per-Endpoint hit counter  – "METHOD /path" granularity
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Redis Data Structures:
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  analytics:total_requests          STRING  (INCR)
 *  analytics:failed_requests         STRING  (INCR, on 4xx/5xx)
 *
 *  analytics:gateway:<instanceId>    STRING  (INCR per gateway instance)
 *
 *  analytics:service:<name>          STRING  (INCR per matched service)
 *
 *  analytics:status:<bucket>         STRING  (INCR, bucket = 2xx/3xx/4xx/5xx)
 *
 *  analytics:latency:total_ms        STRING  (INCRBY with response time in ms)
 *  analytics:latency:count           STRING  (INCR on each measured request)
 *
 *  analytics:endpoint:<method>:<path> STRING (INCR, top 100 paths stored)
 *
 *  analytics:timeline:<YYYY-MM-DD>   HASH    (requests per minute HH:MM → count)
 *    ↳ expires after 7 days (TTL = 604800 s)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Design decisions:
 * ──────────────────────────────────────────────────────────────────────────
 *  - Fire-and-forget via pipeline + .exec() without awaiting in the request
 *    path so latency overhead is < 1ms (single async pipeline dispatch).
 *  - Uses `res.on('finish')` hook to capture the *actual* status code and
 *    elapsed time after the response is fully sent.
 *  - Fail-open: if Redis is unavailable we skip metric recording without
 *    affecting the request. A warning is emitted at most once per minute
 *    to avoid log spam.
 *  - All keys are namespaced under `analytics:` to avoid collision with
 *    rate-limiter (`rl:`) and cache (`cache:`) key spaces.
 */

'use strict';

const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');
const { getRegistry } = require('../config/serviceRegistry');

const logger = createServiceLogger('gateway-analytics');

// ── Build a quick lookup: pathPrefix → service name ──────────────────────────
const registry = getRegistry();
const prefixToService = {};
registry.forEach((svc) => {
  prefixToService[svc.pathPrefix] = svc.name;
});

// Throttle Redis-unavailable warnings (emit at most once per 60 s)
let lastRedisWarnAt = 0;
const REDIS_WARN_INTERVAL_MS = 60_000;

const GATEWAY_INSTANCE = process.env.GATEWAY_INSTANCE_ID || 'gateway-1';

/**
 * resolveServiceName – attempts to match the request path against the
 * service registry path prefixes, returning the service name or 'unknown'.
 * @param {string} reqPath
 * @returns {string}
 */
function resolveServiceName(reqPath) {
  for (const prefix of Object.keys(prefixToService)) {
    if (reqPath.startsWith(prefix)) {
      return prefixToService[prefix];
    }
  }
  return 'gateway'; // /health or unmatched
}

/**
 * getStatusBucket – maps an HTTP status code to a 2xx/3xx/4xx/5xx string.
 * @param {number} status
 * @returns {string}
 */
function getStatusBucket(status) {
  if (status < 300) return '2xx';
  if (status < 400) return '3xx';
  if (status < 500) return '4xx';
  return '5xx';
}

/**
 * getTimelineKey – returns the Redis HASH key for today's timeline.
 * @returns {string}
 */
function getTimelineKey() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm   = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(now.getUTCDate()).padStart(2, '0');
  return `analytics:timeline:${yyyy}-${mm}-${dd}`;
}

/**
 * getMinuteField – returns the current HH:MM string for timeline bucketing.
 * @returns {string}
 */
function getMinuteField() {
  const now = new Date();
  const hh  = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

/**
 * sanitisePath – reduces dynamic URL segments to a pattern for grouping.
 *   /v1/products/64abc123  → /v1/products/:id
 * This keeps the cardinality of `analytics:endpoint:*` keys manageable.
 * @param {string} reqPath
 * @returns {string}
 */
function sanitisePath(reqPath) {
  // Replace MongoDB-style ObjectIds (24 hex chars) with :id
  let s = reqPath.replace(/\/[a-f0-9]{24}/gi, '/:id');
  // Replace numeric segments
  s = s.replace(/\/\d+/g, '/:n');
  // Replace UUIDs (8-4-4-4-12)
  s = s.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid');
  return s;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * analyticsCollector – Express middleware.
 *
 * Attaches a `finish` listener to `res` so metrics are recorded AFTER the
 * response is fully sent (status code is final, latency is measured).
 * No async awaiting in the request path — this is fully non-blocking.
 */
function analyticsCollector(req, res, next) {
  const startAt = process.hrtime.bigint(); // nanosecond precision

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - startAt;
    const elapsedMs = Number(elapsedNs / 1_000_000n); // convert ns → ms

    const status      = res.statusCode;
    const method      = req.method;
    const path        = sanitisePath(req.path || '/');
    const service     = resolveServiceName(req.path || '/');
    const bucket      = getStatusBucket(status);
    const isFailed    = status >= 400;
    const timelineKey = getTimelineKey();
    const minuteField = getMinuteField();

    let redis;
    try {
      redis = getRedisClient();
    } catch (err) {
      const now = Date.now();
      if (now - lastRedisWarnAt > REDIS_WARN_INTERVAL_MS) {
        logger.warn('[Analytics] Redis unavailable – skipping metrics recording', {
          error: err.message,
        });
        lastRedisWarnAt = now;
      }
      return;
    }

    // ── Build Redis pipeline ───────────────────────────────────────────────
    try {
      const pipe = redis.pipeline();

      // 1. Total requests
      pipe.incr('analytics:total_requests');

      // 2. Failed requests (4xx + 5xx)
      if (isFailed) {
        pipe.incr('analytics:failed_requests');
      }

      // 3. Per-gateway-instance count
      pipe.incr(`analytics:gateway:${GATEWAY_INSTANCE}`);

      // 4. Per-service count
      pipe.incr(`analytics:service:${service}`);

      // 5. Status code bucket
      pipe.incr(`analytics:status:${bucket}`);

      // 6. Latency aggregation (sum of ms + count)
      pipe.incrby('analytics:latency:total_ms', Math.round(elapsedMs));
      pipe.incr('analytics:latency:count');

      // 7. Per-endpoint hit counter (keep key expiry at 7 days)
      const endpointKey = `analytics:endpoint:${method}:${path}`;
      pipe.incr(endpointKey);
      pipe.expire(endpointKey, 604800); // 7 days

      // 8. Timeline (per-minute traffic)  – HASH field
      pipe.hincrby(timelineKey, minuteField, 1);
      pipe.expire(timelineKey, 604800); // 7 days

      // Fire-and-forget — do NOT await so we never block the response loop
      pipe.exec().catch((err) => {
        logger.warn('[Analytics] Pipeline error during metrics write', {
          error: err.message,
        });
      });
    } catch (err) {
      logger.warn('[Analytics] Failed to build pipeline', { error: err.message });
    }
  });

  next();
}

module.exports = { analyticsCollector };

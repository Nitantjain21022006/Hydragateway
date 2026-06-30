/**
 * gateway/src/routes/analyticsRoutes.js  (Phase 10)
 *
 * Analytics Dashboard API – reads collected metrics from Redis and
 * returns them in a structured format suitable for a monitoring dashboard.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Endpoints:
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  GET /analytics/summary
 *    Returns an aggregated snapshot:
 *      - total_requests, failed_requests, success_rate
 *      - avg_response_time_ms
 *      - status_code_breakdown  (2xx/3xx/4xx/5xx counts)
 *      - per_service_breakdown  (requests per service)
 *      - per_gateway_breakdown  (requests per gateway instance)
 *
 *  GET /analytics/timeline?date=YYYY-MM-DD
 *    Returns per-minute traffic counts for the given date (today by default).
 *    Useful for rendering a time-series chart on the dashboard.
 *
 *  GET /analytics/endpoints?limit=20
 *    Returns the top N most-hit endpoints sorted by hit count descending.
 *    `limit` is capped at 100.
 *
 *  DELETE /analytics/reset
 *    Resets ALL analytics keys in Redis.
 *    Intended for testing/dev only – protect with admin auth in production.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Design decisions:
 * ──────────────────────────────────────────────────────────────────────────
 *  - All reads use pipeline GET/KEYS so they fit in a single round-trip.
 *  - The `/analytics/*` routes are public (no JWT required) to make it easy
 *    to embed in a dashboard. Lock these down in production via IP allowlist
 *    or a dedicated admin JWT scope.
 *  - We intentionally avoid SCAN on hot paths; timeline and endpoint keys
 *    have bounded cardinality (1 per minute/endpoint per day).
 */

'use strict';

const express   = require('express');
const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');
const { getRegistry } = require('../config/serviceRegistry');

const logger = createServiceLogger('gateway-analytics-api');
const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * safeGet – fetches a Redis string key and returns it as an integer.
 * Returns 0 if the key doesn't exist or Redis fails.
 */
async function safeGet(redis, key) {
  try {
    const val = await redis.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * safeMget – fetches multiple Redis keys in one round-trip.
 * Returns an array of integers (0 for missing/error).
 */
async function safeMget(redis, keys) {
  if (!keys.length) return [];
  try {
    const vals = await redis.mget(...keys);
    return vals.map((v) => (v ? parseInt(v, 10) : 0));
  } catch {
    return keys.map(() => 0);
  }
}

/**
 * scanKeys – uses SCAN to find all keys matching a pattern.
 * Returns an array of matching key strings.
 * Safe for production (cursor-based, never blocks).
 */
async function scanKeys(redis, pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const [newCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = newCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

// ── Route: GET /analytics/summary ────────────────────────────────────────────

router.get('/summary', async (req, res) => {
  let redis;
  try {
    redis = getRedisClient();
  } catch (err) {
    logger.error('[AnalyticsAPI] Redis unavailable', { error: err.message });
    return res.status(503).json({
      success: false,
      error: { code: 'REDIS_UNAVAILABLE', message: 'Analytics store is unreachable.' },
    });
  }

  try {
    // ── 1. Core counters ─────────────────────────────────────────────────────
    const [totalRequests, failedRequests, latencyTotalMs, latencyCount] = await safeMget(
      redis,
      [
        'analytics:total_requests',
        'analytics:failed_requests',
        'analytics:latency:total_ms',
        'analytics:latency:count',
      ]
    );

    const successRate       = totalRequests > 0
      ? (((totalRequests - failedRequests) / totalRequests) * 100).toFixed(2)
      : '100.00';
    const avgResponseTimeMs = latencyCount > 0
      ? Math.round(latencyTotalMs / latencyCount)
      : 0;

    // ── 2. Status code breakdown ─────────────────────────────────────────────
    const [s2xx, s3xx, s4xx, s5xx] = await safeMget(redis, [
      'analytics:status:2xx',
      'analytics:status:3xx',
      'analytics:status:4xx',
      'analytics:status:5xx',
    ]);

    const statusCodeBreakdown = { '2xx': s2xx, '3xx': s3xx, '4xx': s4xx, '5xx': s5xx };

    // ── 3. Per-service breakdown ──────────────────────────────────────────────
    const registry = getRegistry();
    const serviceNames = [...registry.map((s) => s.name), 'gateway'];
    const serviceKeys  = serviceNames.map((n) => `analytics:service:${n}`);
    const serviceCounts = await safeMget(redis, serviceKeys);

    const perServiceBreakdown = {};
    serviceNames.forEach((name, i) => {
      perServiceBreakdown[name] = serviceCounts[i];
    });

    // ── 4. Per-gateway-instance breakdown ────────────────────────────────────
    const gatewayKeys = await scanKeys(redis, 'analytics:gateway:*');
    const gatewayCounts = await safeMget(redis, gatewayKeys);
    const perGatewayBreakdown = {};
    gatewayKeys.forEach((key, i) => {
      const instanceId = key.replace('analytics:gateway:', '');
      perGatewayBreakdown[instanceId] = gatewayCounts[i];
    });

    // ── Response ─────────────────────────────────────────────────────────────
    return res.json({
      success: true,
      data: {
        total_requests:       totalRequests,
        failed_requests:      failedRequests,
        success_rate:         `${successRate}%`,
        avg_response_time_ms: avgResponseTimeMs,
        status_code_breakdown: statusCodeBreakdown,
        per_service_breakdown: perServiceBreakdown,
        per_gateway_breakdown: perGatewayBreakdown,
        collected_at:         new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('[AnalyticsAPI] Error building summary', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_ERROR', message: 'Failed to retrieve analytics summary.' },
    });
  }
});

// ── Route: GET /analytics/timeline ───────────────────────────────────────────

router.get('/timeline', async (req, res) => {
  let redis;
  try {
    redis = getRedisClient();
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: { code: 'REDIS_UNAVAILABLE', message: 'Analytics store is unreachable.' },
    });
  }

  // Validate / default date parameter
  const dateParam = req.query.date;
  let date;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    date = dateParam;
  } else {
    const now = new Date();
    date = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  try {
    const timelineKey = `analytics:timeline:${date}`;
    const raw = await redis.hgetall(timelineKey);

    // Build a sorted, gapless minute-by-minute array for charting
    const timeline = [];
    if (raw) {
      const sortedMinutes = Object.keys(raw).sort();
      sortedMinutes.forEach((minute) => {
        timeline.push({ minute, requests: parseInt(raw[minute], 10) });
      });
    }

    return res.json({
      success: true,
      data: {
        date,
        total_requests: timeline.reduce((sum, t) => sum + t.requests, 0),
        timeline,
      },
    });
  } catch (err) {
    logger.error('[AnalyticsAPI] Error fetching timeline', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_ERROR', message: 'Failed to retrieve timeline data.' },
    });
  }
});

// ── Route: GET /analytics/endpoints ──────────────────────────────────────────

router.get('/endpoints', async (req, res) => {
  let redis;
  try {
    redis = getRedisClient();
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: { code: 'REDIS_UNAVAILABLE', message: 'Analytics store is unreachable.' },
    });
  }

  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

  try {
    const endpointKeys = await scanKeys(redis, 'analytics:endpoint:*');

    if (!endpointKeys.length) {
      return res.json({ success: true, data: { endpoints: [] } });
    }

    const counts = await safeMget(redis, endpointKeys);

    // Pair and sort descending
    const paired = endpointKeys.map((key, i) => {
      // key format: analytics:endpoint:METHOD:/path
      const withoutPrefix = key.replace('analytics:endpoint:', '');
      const colonIdx      = withoutPrefix.indexOf(':');
      const method        = withoutPrefix.substring(0, colonIdx);
      const path          = withoutPrefix.substring(colonIdx + 1);
      return { method, path, requests: counts[i] };
    });

    paired.sort((a, b) => b.requests - a.requests);
    const top = paired.slice(0, limit);

    return res.json({
      success: true,
      data: {
        limit,
        total_unique_endpoints: endpointKeys.length,
        endpoints: top,
      },
    });
  } catch (err) {
    logger.error('[AnalyticsAPI] Error fetching endpoints', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_ERROR', message: 'Failed to retrieve endpoint data.' },
    });
  }
});

// ── Route: DELETE /analytics/reset ───────────────────────────────────────────
//  ⚠ This deletes ALL analytics keys. Use only in dev/test.

router.delete('/reset', async (req, res) => {
  let redis;
  try {
    redis = getRedisClient();
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: { code: 'REDIS_UNAVAILABLE', message: 'Analytics store is unreachable.' },
    });
  }

  // Safety gate: refuse in production unless explicitly overridden
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ANALYTICS_RESET !== 'true') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Analytics reset is disabled in production. Set ALLOW_ANALYTICS_RESET=true to override.',
      },
    });
  }

  try {
    // Use SCAN to find and delete all analytics:* keys safely
    const keys = await scanKeys(redis, 'analytics:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    logger.warn(`[AnalyticsAPI] Analytics reset: ${keys.length} keys deleted`, {
      correlationId: req.correlationId,
    });

    return res.json({
      success: true,
      data: {
        message: `Analytics reset complete. ${keys.length} keys deleted.`,
        deleted_count: keys.length,
        reset_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error('[AnalyticsAPI] Error during reset', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_ERROR', message: 'Failed to reset analytics.' },
    });
  }
});

module.exports = router;

/**
 * gateway/src/routes/analyticsRoutes.js  (Phase 10 + Phase 14 SSE)
 *
 * Analytics Dashboard API – reads collected metrics from Redis and
 * returns them in a structured format suitable for a monitoring dashboard.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Existing Endpoints (Phase 10, unchanged):
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  GET /analytics/summary
 *  GET /analytics/timeline?date=YYYY-MM-DD
 *  GET /analytics/endpoints?limit=20
 *  DELETE /analytics/reset
 *
 * ──────────────────────────────────────────────────────────────────────────
 * New Endpoints (Phase 14 – SSE / Real-time Dashboard):
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  GET /analytics/circuit-breakers
 *    Returns a snapshot of all circuit breaker states.
 *    Polling fallback for the CB visualization page.
 *
 *  GET /analytics/requests/live
 *    Returns the last N request records from the in-memory ring buffer.
 *    Used for initial page load of the Live Requests page.
 *
 *  GET /analytics/stream
 *    Server-Sent Events endpoint. Streams real-time events:
 *      event: request         – every completed HTTP request
 *      event: circuit_breaker – circuit breaker state transitions
 *      event: heartbeat       – every 15s to prevent proxy timeouts
 *
 *  GET /analytics/logs
 *    Server-Sent Events endpoint. Tails the gateway combined log file.
 *    Accepts ?level=error|warn|info query param for filtering.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Design decisions (Phase 14):
 * ──────────────────────────────────────────────────────────────────────────
 *  - SSE uses plain HTTP/1.1 – no WebSocket library needed. The browser's
 *    native EventSource API handles reconnection automatically.
 *  - A single /analytics/stream endpoint multiplexes all event types using
 *    the SSE `event:` field. This avoids multiple connections per browser tab.
 *  - Max SSE_MAX_CLIENTS concurrent SSE connections are allowed. New
 *    connections beyond the limit receive 503.
 *  - Each SSE client adds a listener to requestEventBus. It MUST be removed
 *    on disconnect to prevent memory/listener leaks.
 *  - Heartbeats every SSE_HEARTBEAT_MS prevent proxy idle-timeout disconnects.
 *  - CORS headers are set on all /analytics/* routes to allow the dashboard
 *    (localhost:5173) to call the gateway directly.
 */

'use strict';

const express   = require('express');
const fs        = require('fs');
const path      = require('path');
const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');
const { getRegistry } = require('../config/serviceRegistry');
const { requestEventBus, getRecentRequests } = require('../middleware/analyticsCollector');
const { getCircuitBreakerSnapshot } = require('./gatewayRoutes');

const logger = createServiceLogger('gateway-analytics-api');
const router = express.Router();

// ── Phase 14: SSE Config ──────────────────────────────────────────────────────
const SSE_MAX_CLIENTS      = parseInt(process.env.SSE_MAX_CLIENTS      || '20',    10);
const SSE_HEARTBEAT_MS     = parseInt(process.env.SSE_HEARTBEAT_MS     || '15000', 10);
let   sseClientCount       = 0;

// ── CORS headers for all analytics routes ─────────────────────────────────────
// This allows the Vite dev server (port 5173) to call the gateway (port 3000)
// directly. In production, restrict ALLOWED_ORIGIN to the actual dashboard URL.
const ALLOWED_ORIGIN = process.env.DASHBOARD_ORIGIN || 'http://localhost:5173';

router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});

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

// ── Phase 14: GET /analytics/circuit-breakers ─────────────────────────────────
//  Returns a live snapshot of all circuit breaker states.
//  Used by the CB visualization page for initial load and polling fallback.

router.get('/circuit-breakers', (req, res) => {
  try {
    const snapshot = getCircuitBreakerSnapshot();
    return res.json({
      success: true,
      data: snapshot,
      collected_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[AnalyticsAPI] Error fetching circuit breaker snapshot', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: 'CB_ERROR', message: 'Failed to retrieve circuit breaker states.' },
    });
  }
});

// ── Phase 14: GET /analytics/requests/live ───────────────────────────────────
//  Returns the last N request records from the in-memory ring buffer.
//  Used for initial page load of the Live Requests page before SSE connects.

router.get('/requests/live', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit || '50', 10), 500);
  const recent = getRecentRequests();
  const sliced = recent.slice(-limit).reverse(); // Newest first

  return res.json({
    success: true,
    data: {
      requests: sliced,
      total:    recent.length,
      limit,
    },
  });
});

// ── Phase 14: GET /analytics/stream ──────────────────────────────────────────
//  Server-Sent Events endpoint. Streams:
//    event: request         → every completed HTTP request
//    event: circuit_breaker → CB state transitions
//    event: heartbeat       → every SSE_HEARTBEAT_MS to prevent timeout
//
//  Protocol: text/event-stream (SSE)
//  Browser API: new EventSource('/analytics/stream')

router.get('/stream', (req, res) => {
  // Check max client limit
  if (sseClientCount >= SSE_MAX_CLIENTS) {
    logger.warn('[SSE] Max client limit reached, rejecting new SSE connection', {
      count: sseClientCount,
      max:   SSE_MAX_CLIENTS,
    });
    return res.status(503).json({
      success: false,
      error: { code: 'SSE_CAPACITY', message: 'Too many active SSE connections. Try again later.' },
    });
  }

  // ── SSE Headers ──────────────────────────────────────────────────────────
  res.setHeader('Content-Type',                'text/event-stream');
  res.setHeader('Cache-Control',               'no-cache, no-transform');
  res.setHeader('Connection',                  'keep-alive');
  res.setHeader('X-Accel-Buffering',           'no'); // Disable nginx buffering
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.flushHeaders(); // Flush headers immediately so the browser opens the stream

  sseClientCount++;
  const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  logger.info(`[SSE] Client connected: ${clientId} (total: ${sseClientCount})`);

  // ── SSE Helper: send a named event ───────────────────────────────────────
  const sendEvent = (eventName, data) => {
    if (res.writableEnded) return;
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      logger.warn(`[SSE] Write error for ${clientId}: ${err.message}`);
    }
  };

  // ── Send initial connection confirmation ──────────────────────────────────
  sendEvent('connected', { clientId, timestamp: new Date().toISOString() });

  // ── Event Listeners ──────────────────────────────────────────────────────
  const onRequest = (record) => sendEvent('request', record);
  const onCB      = (cbData)  => sendEvent('circuit_breaker', cbData);

  requestEventBus.on('request',         onRequest);
  requestEventBus.on('circuit_breaker', onCB);

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  const heartbeatTimer = setInterval(() => {
    sendEvent('heartbeat', { ts: Date.now() });
  }, SSE_HEARTBEAT_MS);

  // ── Cleanup on disconnect ─────────────────────────────────────────────────
  const cleanup = () => {
    clearInterval(heartbeatTimer);
    requestEventBus.off('request',         onRequest);
    requestEventBus.off('circuit_breaker', onCB);
    sseClientCount = Math.max(0, sseClientCount - 1);
    logger.info(`[SSE] Client disconnected: ${clientId} (total: ${sseClientCount})`);
  };

  req.on('close',   cleanup);
  req.on('aborted', cleanup);
});

// ── Phase 14: GET /analytics/logs ─────────────────────────────────────────────
//  Server-Sent Events endpoint that tails the gateway's combined log file.
//  Accepts:
//    ?level=error|warn|info  (filter by log level, default: all)
//    ?service=<serviceName>  (filter by service tag, default: all)
//
//  Implementation: Uses fs.watch to detect new writes, then reads the new
//  bytes using a file position tracker (simple log-tailing approach).

router.get('/logs', (req, res) => {
  const levelFilter   = req.query.level   || null;
  const serviceFilter = req.query.service || null;

  // Resolve the gateway combined log file path.
  // Winston (shared/utils/logger.js) writes logs relative to shared/utils/logger.js:
  //   path.join(__dirname, '..', '..', 'logs') → ProjectSec/shared/../../logs → ProjectSec/logs  (wrong)
  // But because each service runs with its own CWD, Winston falls back to the service-local logs/.
  // The gateway process writes to: packages/gateway/logs/gateway-combined.log
  const logDir  = process.env.LOG_DIR || path.join(__dirname, '../../logs');
  const logFile = path.join(logDir, 'gateway-combined.log');

  // ── SSE Headers ──────────────────────────────────────────────────────────
  res.setHeader('Content-Type',                'text/event-stream');
  res.setHeader('Cache-Control',               'no-cache, no-transform');
  res.setHeader('Connection',                  'keep-alive');
  res.setHeader('X-Accel-Buffering',           'no');
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.flushHeaders();

  logger.info('[SSE/Logs] Log stream client connected');

  const sendLogEvent = (data) => {
    if (res.writableEnded) return;
    try {
      res.write(`event: log\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch { /* ignore */ }
  };

  // Send connection confirmation
  sendLogEvent({ type: 'connected', message: 'Log stream connected', timestamp: new Date().toISOString() });

  // Check if log file exists
  if (!fs.existsSync(logFile)) {
    sendLogEvent({ type: 'warning', message: 'Log file does not exist yet. Start sending requests to generate logs.', timestamp: new Date().toISOString() });
    // Still set up a watch in case the file appears later
  }

  // Track file position for incremental reads
  let filePosition = 0;
  try {
    const stat = fs.statSync(logFile);
    // Start from end of current file (only show new entries)
    filePosition = stat.size;
  } catch { /* file may not exist yet */ }

  /**
   * readNewLines – reads any new bytes added to the log file since
   * the last read, parses JSON log lines, applies filters, and streams
   * matching entries as SSE events.
   */
  const readNewLines = () => {
    try {
      const stat = fs.statSync(logFile);
      if (stat.size <= filePosition) return; // No new data

      const fd     = fs.openSync(logFile, 'r');
      const length = stat.size - filePosition;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, filePosition);
      fs.closeSync(fd);

      filePosition = stat.size;

      const newContent = buffer.toString('utf8');
      const lines      = newContent.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          // Apply level filter
          if (levelFilter && parsed.level !== levelFilter) continue;
          // Apply service filter
          if (serviceFilter && parsed.service !== serviceFilter) continue;

          sendLogEvent({
            type:      'log',
            level:     parsed.level,
            service:   parsed.service,
            message:   parsed.message,
            timestamp: parsed.timestamp,
            meta:      parsed,
          });
        } catch {
          // Skip unparseable lines (e.g. partial writes mid-line)
        }
      }
    } catch (err) {
      // File not found or read error — not fatal
    }
  };

  // Watch for file changes
  let watcher;
  try {
    watcher = fs.watch(logDir, (event, filename) => {
      if (filename && filename.includes('gateway-combined')) {
        readNewLines();
      }
    });
  } catch (err) {
    sendLogEvent({ type: 'warning', message: `Could not watch log directory: ${err.message}`, timestamp: new Date().toISOString() });
  }

  // Heartbeat for log stream
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  // Cleanup
  const cleanup = () => {
    clearInterval(heartbeat);
    if (watcher) {
      try { watcher.close(); } catch { /* ignore */ }
    }
    logger.info('[SSE/Logs] Log stream client disconnected');
  };

  req.on('close',   cleanup);
  req.on('aborted', cleanup);
});

module.exports = router;

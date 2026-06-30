/**
 * load-balancer/src/server.js  (Phase 11)
 *
 * HydraGateway Custom Load Balancer – Express Entry Point.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Architecture Overview:
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  Client
 *    │
 *    ▼
 *  Load Balancer  (:8080)      ← this file
 *    │   Round-Robin + Health Check
 *    ├──► Gateway Instance 1  (:3000)
 *    └──► Gateway Instance 2  (:3001)
 *              │
 *              ▼
 *         Downstream Services
 *         (Auth / Product / Payment / Order)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Middleware chain:
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  1. correlationId  – forward / generate X-Correlation-ID for tracing
 *  2. requestLogger  – log every request that hits the LB
 *  3. lbRouter       – pick a healthy gateway via round-robin; proxy request
 *  4. 404 handler    – catches unmatched routes (shouldn't happen in practice)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Key design decisions:
 * ──────────────────────────────────────────────────────────────────────────
 *  - Uses http-proxy-middleware's `router` option (a function) to select the
 *    target dynamically per-request. This is the idiomatic way to do
 *    dynamic target selection with HPM v3.
 *
 *  - `changeOrigin: true` rewrites the Host header so the Gateway accepts
 *    the forwarded request without origin mismatch errors.
 *
 *  - On failover (selected gateway becomes unavailable between health checks)
 *    the proxy error handler returns a clean 502 JSON response and logs the
 *    incident. We do NOT automatically retry on a different instance because
 *    that could cause duplicate POST/PUT side-effects. Retry logic should
 *    be implemented client-side (safe/idempotent requests) or with a
 *    dedicated retry queue.
 *
 *  - The LB exposes a /lb-health endpoint that reports its own liveness
 *    and the health state of all registered gateways. This endpoint can be
 *    used by an upstream load balancer (e.g. AWS ALB, nginx) to check the
 *    LB's health without touching the gateway ring.
 *
 *  - Graceful shutdown: SIGTERM/SIGINT are handled. The HTTP server is
 *    closed (stops accepting new connections), then the health poller is
 *    stopped. Active connections are given 10 s to drain before a forced
 *    process.exit(0).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Environment variables:
 * ──────────────────────────────────────────────────────────────────────────
 *  LB_PORT                 = 8080   Port the LB listens on
 *  GW_INSTANCE_1_URL       = http://localhost:3000
 *  GW_INSTANCE_2_URL       = http://localhost:3001
 *  LB_HEALTH_INTERVAL_MS   = 10000  Health poll interval
 *  LOG_LEVEL               = info
 *  NODE_ENV                = development
 */

'use strict';

require('dotenv').config();

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { v4: uuidv4 } = require('uuid');

const { getGatewayRegistry } = require('./config/gatewayRegistry');
const { startHealthPoller, getHealthMap, getDetailedHealth } = require('./health/healthPoller');
const { next: roundRobinNext }  = require('./balancer/roundRobin');
const { createLBLogger }        = require('./utils/lbLogger');

const logger = createLBLogger('load-balancer');
const app    = express();

// ── 1. Correlation ID middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  const id = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
});

// ── 2. Request Logger ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const startAt = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startAt;
    logger.info(`${req.method} ${req.url} → ${res.statusCode} [${elapsed}ms]`, {
      correlationId: req.correlationId,
      ip: req.ip,
    });
  });
  next();
});

// ── 3. LB /lb-health endpoint ─────────────────────────────────────────────────
//    Mounted BEFORE the proxy so it is served directly by the LB process,
//    not forwarded to a gateway.
app.get('/lb-health', (req, res) => {
  const detail  = getDetailedHealth();
  const allDown = detail.every((gw) => !gw.healthy);

  res.status(allDown ? 503 : 200).json({
    status:    allDown ? 'degraded' : 'ok',
    service:   'load-balancer',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    gateways:  detail,
  });
});

// ── 4. Dynamic Round-Robin Proxy ──────────────────────────────────────────────
//    Uses HPM's `router` function to pick a new target on EVERY request.
//    This is the correct pattern for dynamic target selection in HPM v3.

const proxy = createProxyMiddleware({
  /**
   * router – called by HPM for every incoming request.
   * Returns the target URL string for the upstream gateway, or null/throws
   * to trigger the error handler (which returns 503).
   */
  router: (req) => {
    const healthMap = getHealthMap();
    const selected  = roundRobinNext(healthMap);

    if (!selected) {
      // All gateways are down — signal to error handler
      logger.error('[LB] All gateway instances are DOWN — cannot route request', {
        correlationId: req.correlationId,
        path: req.path,
      });
      // Throwing here causes HPM to invoke the `error` handler below
      throw new Error('ALL_GATEWAYS_DOWN');
    }

    logger.debug(`[LB] Routing → ${selected.id} (${selected.target})`, {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
    });

    // Attach selected gateway info to req for the proxyReq hook
    req._selectedGateway = selected;
    return selected.target;
  },

  changeOrigin: true,

  on: {
    /**
     * proxyReq – fired before the request is sent upstream.
     * Inject LB-level headers so the Gateway knows it came through the LB.
     */
    proxyReq: (proxyReq, req) => {
      // Pass through the correlation ID
      if (req.correlationId) {
        proxyReq.setHeader('X-Correlation-ID', req.correlationId);
      }

      // Tell the gateway which LB instance forwarded this request
      proxyReq.setHeader('X-Forwarded-By', 'hydra-load-balancer');

      // Tell the gateway which gateway instance was selected (useful for logging)
      if (req._selectedGateway) {
        proxyReq.setHeader('X-LB-Selected-Gateway', req._selectedGateway.id);
      }

      // Standard reverse-proxy header
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const existing = req.headers['x-forwarded-for'];
      proxyReq.setHeader(
        'X-Forwarded-For',
        existing ? `${existing}, ${clientIp}` : clientIp
      );
    },

    /**
     * error – fired when the upstream TCP connection fails.
     * Returns a clean 502/503 JSON response.
     */
    error: (err, req, res) => {
      const correlationId = req.correlationId || '-';

      if (err.message === 'ALL_GATEWAYS_DOWN') {
        logger.error('[LB] 503 – All gateways unavailable', { correlationId });
        if (!res.headersSent) {
          return res.status(503).json({
            success: false,
            error: {
              code:    'SERVICE_UNAVAILABLE',
              message: 'All gateway instances are currently unavailable. Please try again shortly.',
            },
          });
        }
        return;
      }

      logger.error(`[LB] Proxy error: ${err.message}`, {
        correlationId,
        code: err.code,
        path: req.path,
        gateway: req._selectedGateway?.id,
      });

      const status = (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') ? 504 : 502;

      if (!res.headersSent) {
        res.status(status).json({
          success: false,
          error: {
            code:    status === 504 ? 'GATEWAY_TIMEOUT' : 'BAD_GATEWAY',
            message: 'The selected gateway is temporarily unreachable.',
          },
        });
      }
    },
  },
});

// Mount the proxy for ALL routes (the LB is transparent)
app.use('/', proxy);

// ── 5. 404 Fallback (shouldn't normally be reached with proxy above) ──────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `No route found for ${req.method} ${req.path}` },
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.LB_PORT || '8080', 10);

async function start() {
  // Print registered gateway instances at startup
  const registry = getGatewayRegistry();
  logger.info(`[LB] Registered gateway instances: ${registry.map((g) => `${g.id}@${g.target}`).join(', ')}`);

  // Start health polling (non-blocking)
  const healthInterval = startHealthPoller();

  const server = app.listen(PORT, () => {
    logger.info(`[LB] HydraGateway Load Balancer listening on port ${PORT}`);
    logger.info(`[LB] Algorithm: Round-Robin across ${registry.length} gateway instance(s)`);
    logger.info(`[LB] Health check: /lb-health  |  Forward: → ${registry.map((g) => g.target).join(', ')}`);
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`[LB] ${signal} received – shutting down gracefully`);
    clearInterval(healthInterval);

    server.close(() => {
      logger.info('[LB] HTTP server closed. Goodbye.');
      process.exit(0);
    });

    // Force exit after 10 s if connections don't drain
    setTimeout(() => {
      logger.error('[LB] Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('[LB] Unhandled Promise Rejection', { reason });
  });
}

start();

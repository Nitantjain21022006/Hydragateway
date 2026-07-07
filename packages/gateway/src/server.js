/**
 * gateway/src/server.js
 *
 * HydraGateway API Gateway – Express entry point.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Middleware chain (order is intentional and critical):
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 1. correlationId   – Generate / forward X-Correlation-ID. MUST be first
 *                      so every subsequent middleware has req.correlationId.
 *
 * 2. requestLogger   – HTTP access log (Morgan → Winston). Runs early so
 *                      even rejected requests are logged.
 *
 * 3. express.json    – Parse JSON bodies only for non-proxied routes.
 *                      Proxy requests forward the raw stream; body parsing
 *                      here would consume and lose the body.
 *                      We parse only for the gateway's own /health endpoint.
 *
 * 4. jwtAuth         – Validate JWT for protected routes. Public routes
 *                      (register, login) bypass automatically. Attaches
 *                      req.user for downstream header injection.
 *
 * 5. rateLimiter     – Redis fixed-window rate limiter. Runs AFTER jwtAuth
 *                      so we have req.user for per-user limits. BEFORE
 *                      proxy so limited requests never reach downstream.
 *
 * 6. gatewayRoutes   – http-proxy-middleware reverse proxy to downstream
 *                      services. Injects upstream headers, checks health.
 *
 * 7. 404 handler     – Catches routes not matched by any proxy rule.
 *
 * 8. errorHandler    – Centralised error envelope; last middleware.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Boot sequence:
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Load .env
 * 2. Start health-check poller (async, non-blocking)
 * 3. Register all middleware and routes
 * 4. Start HTTP server
 * 5. Register SIGTERM/SIGINT for graceful shutdown
 */

'use strict';

const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const express = require('express');
const { correlationId }   = require('../../../shared/middleware/correlationId');
const { createServiceLogger } = require('../../../shared/utils/logger');

const { createRequestLogger } = require('../../../shared/middleware/requestLogger');
const { jwtAuth }          = require('./middleware/jwtAuth');
const { rateLimiter }      = require('./middleware/rateLimiter');
const { startHealthPoller, getHealthSnapshot } = require('./middleware/healthCheck');
const { responseCache }       = require('./middleware/cacheMiddleware');
const { analyticsCollector }  = require('./middleware/analyticsCollector');
const { router: gatewayRoutes, getCircuitBreakerSnapshot } = require('./routes/gatewayRoutes');
const analyticsRoutes         = require('./routes/analyticsRoutes');
const { errorHandler }        = require('./middleware/errorHandler');

const logger = createServiceLogger('gateway');
const app    = express();

// ── 1. Correlation ID ─────────────────────────────────────────────────────────
app.use(correlationId);

// ── 2a. Analytics Collector (Phase 10) ───────────────────────────────────────
//    Registers a res.on('finish') listener so metrics are recorded after every
//    response is sent. Must be placed early (before jwtAuth / rateLimiter)
//    so that failed requests (429, 401) are also counted.
app.use(analyticsCollector);

// ── 2. Request Logger ─────────────────────────────────────────────────────────
// Using the shared centralized request logger
app.use(createRequestLogger(logger));

// ── 3. JSON body parser (gateway-own routes only) ─────────────────────────────
//    DO NOT put this before proxy routes — body parsing would consume the
//    readable stream before the proxy can forward it.
app.use('/health', express.json({ limit: '10kb' }));

// ── 4. JWT Authentication ─────────────────────────────────────────────────────
app.use(jwtAuth);

// ── 5. Rate Limiter ───────────────────────────────────────────────────────────
app.use(rateLimiter);

// ── 6. Response Cache (Phase 8) ───────────────────────────────────────────────
//    Cache product listings and single products.
//    Only GET requests to these paths will be intercepted.
app.get('/v1/products', responseCache('products', () => 'all'));
app.get('/v1/products/:id', responseCache('products', (req) => req.params.id));

// ── 7. Gateway /health endpoint ───────────────────────────────────────────────
//    Reports the Gateway instance's own liveness, all downstream service
//    health states, and circuit breaker statuses in a single response.
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    instance: process.env.GATEWAY_INSTANCE_ID || 'gateway-1',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    downstream: getHealthSnapshot(),
    circuitBreakers: getCircuitBreakerSnapshot(),
  });
});

// ── 7a. Analytics API (Phase 10) ──────────────────────────────────────────────
//    Dashboard endpoints: /analytics/summary, /analytics/timeline,
//    /analytics/endpoints, DELETE /analytics/reset
//    Mounted BEFORE the proxy so requests to /analytics/* are served here
//    and never forwarded downstream.
app.use('/analytics', express.json({ limit: '10kb' }), analyticsRoutes);

// ── 8. Proxy Routes ───────────────────────────────────────────────────────────
app.use(gatewayRoutes);

// ── 8. 404 – no proxy rule matched ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `No route found for ${req.method} ${req.path}`,
    },
  });
});

// ── 9. Central Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.GATEWAY_PORT || '3000', 10);

async function start() {
  // Kick off health polling (non-blocking; won't delay server start)
  const healthInterval = startHealthPoller();

  const server = app.listen(PORT, () => {
    logger.info(
      `API Gateway [${process.env.GATEWAY_INSTANCE_ID || 'gateway-1'}] listening on port ${PORT}`
    );
    logger.info('Middleware chain: correlationId → analyticsCollector → requestLogger → jwtAuth → rateLimiter → responseCache → proxy');
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} received – shutting down API Gateway gracefully`);
    clearInterval(healthInterval); // Stop health polling

    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 15 s if connections don't drain
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection in Gateway', { reason });
  });
}

start();

/**
 * gateway/src/routes/gatewayRoutes.js
 *
 * Dynamic reverse-proxy routing for all registered downstream services.
 *
 * Design decisions:
 * ─────────────────
 * - We create one `createProxyMiddleware` instance per service entry
 *   in the Service Registry and mount it at the service's `pathPrefix`.
 *   This is clean and explicit — adding a new service requires only a
 *   new entry in serviceRegistry.js, not a code change here.
 *
 * - Before forwarding, we run a lightweight "pre-flight" check:
 *   isServiceHealthy() returns the cached health state from the health
 *   poller. If the service is known to be DOWN we return 503 immediately
 *   and never touch the downstream network.
 *
 * - Headers injected upstream (before proxy forward):
 *     X-Internal-Secret   – authenticates the Gateway to the downstream service
 *     X-User-Id           – the decoded userId from the JWT (if authed)
 *     X-User-Role         – the decoded role from the JWT (if authed)
 *     X-Correlation-ID    – the correlation ID for distributed tracing
 *     X-Forwarded-For     – standard hop-by-hop proxy header
 *     X-Gateway-Instance  – which gateway instance forwarded the request
 *
 * - We do NOT strip the path prefix before forwarding (pathRewrite is not
 *   used). Downstream services should handle /v1/... paths directly.
 *   This keeps the routing transparent and debug-friendly.
 *
 * - proxyErrorHandler maps network-level errors (ECONNREFUSED, ETIMEDOUT)
 *   to clean 502/504 JSON responses instead of the generic proxy HTML error.
 */

'use strict';

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { getRegistry } = require('../config/serviceRegistry');
const { isServiceHealthy } = require('../middleware/healthCheck');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-proxy');
const router = express.Router();

/**
 * proxyErrorHandler – called by http-proxy-middleware when the upstream
 * TCP connection fails. Converts network errors into JSON API responses
 * consistent with our error envelope.
 */
function proxyErrorHandler(err, req, res) {
  const correlationId = req.correlationId || '-';

  logger.error(`[Proxy] Upstream error: ${err.message}`, {
    correlationId,
    code: err.code,
    path: req.path,
  });

  // Determine appropriate HTTP status
  let statusCode = 502; // Bad Gateway (default for unreachable upstream)
  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    statusCode = 504; // Gateway Timeout
  }

  if (!res.headersSent) {
    res.status(statusCode).json({
      success: false,
      error: {
        code: statusCode === 504 ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR',
        message: 'The requested service is temporarily unavailable.',
      },
    });
  }
}

// ── Mount a proxy for every service in the registry ──────────────────────────

const registry = getRegistry();

registry.forEach((svc) => {
  logger.info(`[GatewayRoutes] Mounting proxy: ${svc.pathPrefix} → ${svc.target}`);

  // Pre-flight health guard
  const healthGuard = (req, res, next) => {
    if (!isServiceHealthy(svc.name)) {
      logger.warn(`[Proxy] ${svc.name} is DOWN – rejecting request`, {
        correlationId: req.correlationId,
        path: req.path,
      });
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `${svc.name} is currently unavailable. Please try again later.`,
        },
      });
    }
    return next();
  };

  // http-proxy-middleware instance for this service
  const proxy = createProxyMiddleware({
    target: svc.target + svc.pathPrefix,
    changeOrigin: true,
    // Inject gateway-level headers before forwarding
    on: {
      proxyReq: (proxyReq, req) => {
        // Internal auth header so the downstream service trusts this request
        const internalSecret = process.env.INTERNAL_SECRET;
        if (internalSecret) {
          proxyReq.setHeader('X-Internal-Secret', internalSecret);
        }

        // Propagate authenticated user identity
        if (req.user) {
          proxyReq.setHeader('X-User-Id',   req.user.userId || '');
          proxyReq.setHeader('X-User-Role',  req.user.role   || 'user');
        }

        // Distributed tracing
        if (req.correlationId) {
          proxyReq.setHeader('X-Correlation-ID', req.correlationId);
        }

        // Mark which gateway instance forwarded the request
        proxyReq.setHeader(
          'X-Gateway-Instance',
          process.env.GATEWAY_INSTANCE_ID || 'gateway-1'
        );

        logger.info(
          `[Proxy] → ${svc.name} ${req.method} ${req.path}`,
          { correlationId: req.correlationId }
        );
      },
      error: proxyErrorHandler,
    },
  });

  // Mount: healthGuard then proxy
  router.use(svc.pathPrefix, healthGuard, proxy);
});

module.exports = router;

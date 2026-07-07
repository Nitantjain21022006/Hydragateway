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
const { CircuitBreaker } = require('../../../../shared/utils/circuitBreaker');

const logger = createServiceLogger('gateway-proxy');
const router = express.Router();

// ── Instantiate Circuit Breakers for all services ─────────────────────────────
const breakers = {};
const registry = getRegistry();

registry.forEach((svc) => {
  breakers[svc.name] = new CircuitBreaker({ name: svc.name });
});

/**
 * getCircuitBreakerSnapshot – returns status snapshot of all circuit breakers.
 */
function getCircuitBreakerSnapshot() {
  const snapshot = {};
  Object.keys(breakers).forEach((key) => {
    snapshot[key] = breakers[key].toJSON();
  });
  return snapshot;
}

// ── Mount a proxy for every service in the registry ──────────────────────────

registry.forEach((svc) => {
  logger.info(`[GatewayRoutes] Mounting proxy and circuit breaker: ${svc.pathPrefix} → ${svc.target}`);

  const cb = breakers[svc.name];

  // Circuit Breaker Guard Middleware
  const cbGuard = (req, res, next) => {
    if (cb.state === 'OPEN') {
      if (Date.now() < cb._nextAttemptTime) {
        logger.warn(`[CircuitBreaker] Service [${svc.name}] circuit is OPEN – rejecting request`, {
          correlationId: req.correlationId,
          path: req.path,
        });
        return res.status(503).json({
          success: false,
          error: {
            code: 'CIRCUIT_OPEN',
            message: `${svc.name} is temporarily unavailable (circuit open). Please try again later.`,
          },
        });
      }
      // Cooldown elapsed, allow probe (transitions to HALF_OPEN)
      cb._transition('HALF_OPEN');
    }
    return next();
  };

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
    // Connect & read timeouts (in ms) mapped from circuit breaker config
    timeout: cb.requestTimeout,
    proxyTimeout: cb.requestTimeout,
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
      error: (err, req, res) => {
        logger.error(`[Proxy] Upstream error for ${svc.name}: ${err.message}`, {
          correlationId: req.correlationId,
          code: err.code,
          path: req.path,
        });

        // Record failure in Circuit Breaker
        cb._onFailure(err);

        // Determine appropriate HTTP status
        let statusCode = 502; // Bad Gateway (default for unreachable upstream)
        if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT' || err.code === 'ECONNRESET') {
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
      },
      proxyRes: (proxyRes, req, res) => {
        // Intercept 5xx status codes as service failures
        if (proxyRes.statusCode >= 500) {
          logger.warn(`[Proxy] Downstream service ${svc.name} returned 5xx status: ${proxyRes.statusCode}`, {
            correlationId: req.correlationId,
            path: req.path,
          });
          const statusError = new Error(`Service returned ${proxyRes.statusCode}`);
          statusError.response = { status: proxyRes.statusCode };
          cb._onFailure(statusError);
        } else {
          // Success (includes 2xx, 3xx, 4xx)
          cb._onSuccess();
        }
      }
    },
  });

  // Mount: cbGuard -> healthGuard -> proxy
  router.use(svc.pathPrefix, cbGuard, healthGuard, proxy);
});

module.exports = { router, getCircuitBreakerSnapshot };


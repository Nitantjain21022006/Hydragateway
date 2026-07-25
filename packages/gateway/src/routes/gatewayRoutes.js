/**
 * Dynamic reverse-proxy router protected by circuit breakers and health check guards.
 * Forwards validated HTTP requests to registered downstream services and propagates identity headers.
 * Exports Express router instance and getCircuitBreakerSnapshot.
 */

'use strict';

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { getRegistry } = require('../config/serviceRegistry');
const { isServiceHealthy } = require('../middleware/healthCheck');
const { createServiceLogger } = require('../../../../shared/utils/logger');
const { CircuitBreaker } = require('../../../../shared/utils/circuitBreaker');
const { requestEventBus } = require('../middleware/analyticsCollector');

const logger = createServiceLogger('gateway-proxy');
const router = express.Router();

const breakers = {};
const registry = getRegistry();

registry.forEach((svc) => {
  breakers[svc.name] = new CircuitBreaker({
    name: svc.name,
    onStateChange: (name, newState, prevState) => {
      requestEventBus.emit('circuit_breaker', {
        service:   name,
        state:     newState,
        prevState,
        timestamp: new Date().toISOString(),
      });
    },
  });
});

function getCircuitBreakerSnapshot() {
  const snapshot = {};
  Object.keys(breakers).forEach((key) => {
    snapshot[key] = breakers[key].toJSON();
  });
  return snapshot;
}

registry.forEach((svc) => {
  logger.info(`[GatewayRoutes] Mounting proxy and circuit breaker: ${svc.pathPrefix} → ${svc.target}`);

  const cb = breakers[svc.name];

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
      cb._transition('HALF_OPEN');
    }
    return next();
  };

  const healthGuard = (req, res, next) => {
    if (cb.state === 'HALF_OPEN') {
      return next();
    }

    if (!isServiceHealthy(svc.name)) {
      logger.warn(`[Proxy] ${svc.name} is DOWN – recording CB failure and rejecting request`, {
        correlationId: req.correlationId,
        path: req.path,
      });

      const connErr = new Error(`${svc.name} is DOWN (health check)`);
      cb._onFailure(connErr);

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

  const proxy = createProxyMiddleware({
    target: svc.target + svc.pathPrefix,
    changeOrigin: true,
    timeout: cb.requestTimeout,
    proxyTimeout: cb.requestTimeout,
    on: {
      proxyReq: (proxyReq, req) => {
        const internalSecret = process.env.INTERNAL_SECRET;
        if (internalSecret) {
          proxyReq.setHeader('X-Internal-Secret', internalSecret);
        }

        if (req.user) {
          proxyReq.setHeader('X-User-Id',   req.user.userId || '');
          proxyReq.setHeader('X-User-Role',  req.user.role   || 'user');
        }

        if (req.correlationId) {
          proxyReq.setHeader('X-Correlation-ID', req.correlationId);
        }

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

        cb._onFailure(err);

        let statusCode = 502;
        if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT' || err.code === 'ECONNRESET') {
          statusCode = 504;
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
        if (proxyRes.statusCode >= 500) {
          logger.warn(`[Proxy] Downstream service ${svc.name} returned 5xx status: ${proxyRes.statusCode}`, {
            correlationId: req.correlationId,
            path: req.path,
          });
          const statusError = new Error(`Service returned ${proxyRes.statusCode}`);
          statusError.response = { status: proxyRes.statusCode };
          cb._onFailure(statusError);
        } else {
          cb._onSuccess();
        }
      }
    },
  });

  router.use(svc.pathPrefix, cbGuard, healthGuard, proxy);
});

module.exports = { router, getCircuitBreakerSnapshot };

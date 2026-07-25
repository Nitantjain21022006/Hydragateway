/**
 * Express application server entry point for the Load Balancer service.
 * Performs dynamic round-robin reverse proxying, correlation ID forwarding, and health check endpoint monitoring.
 * Launches HTTP server on configured port.
 */

'use strict';

const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { v4: uuidv4 } = require('uuid');

const { getGatewayRegistry } = require('./config/gatewayRegistry');
const { startHealthPoller, getHealthMap, getDetailedHealth } = require('./health/healthPoller');
const { next: roundRobinNext }  = require('./balancer/roundRobin');
const { createLBLogger }        = require('./utils/lbLogger');

const logger = createLBLogger('load-balancer');
const app    = express();

app.use((req, res, next) => {
  const id = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID, X-User-Id, X-User-Role');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

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

const proxy = createProxyMiddleware({
  router: (req) => {
    const healthMap = getHealthMap();
    const selected  = roundRobinNext(healthMap);

    if (!selected) {
      logger.error('[LB] All gateway instances are DOWN — cannot route request', {
        correlationId: req.correlationId,
        path: req.path,
      });
      throw new Error('ALL_GATEWAYS_DOWN');
    }

    logger.debug(`[LB] Routing → ${selected.id} (${selected.target})`, {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
    });

    req._selectedGateway = selected;
    return selected.target;
  },

  changeOrigin: true,

  on: {
    proxyReq: (proxyReq, req) => {
      if (req.correlationId) {
        proxyReq.setHeader('X-Correlation-ID', req.correlationId);
      }

      proxyReq.setHeader('X-Forwarded-By', 'hydra-load-balancer');

      if (req._selectedGateway) {
        proxyReq.setHeader('X-LB-Selected-Gateway', req._selectedGateway.id);
      }

      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const existing = req.headers['x-forwarded-for'];
      proxyReq.setHeader(
        'X-Forwarded-For',
        existing ? `${existing}, ${clientIp}` : clientIp
      );
    },

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

app.use('/', proxy);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `No route found for ${req.method} ${req.path}` },
  });
});

const PORT = parseInt(process.env.LB_PORT || '8080', 10);

async function start() {
  const registry = getGatewayRegistry();
  logger.info(`[LB] Registered gateway instances: ${registry.map((g) => `${g.id}@${g.target}`).join(', ')}`);

  const healthInterval = startHealthPoller();

  const server = app.listen(PORT, () => {
    logger.info(`[LB] HydraGateway Load Balancer listening on port ${PORT}`);
    logger.info(`[LB] Algorithm: Round-Robin across ${registry.length} gateway instance(s)`);
    logger.info(`[LB] Health check: /lb-health  |  Forward: → ${registry.map((g) => g.target).join(', ')}`);
  });

  const shutdown = (signal) => {
    logger.info(`[LB] ${signal} received – shutting down gracefully`);
    clearInterval(healthInterval);

    server.close(() => {
      logger.info('[LB] HTTP server closed. Goodbye.');
      process.exit(0);
    });

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

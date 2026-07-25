/**
 * Express application server entry point for API Gateway.
 * Configures correlation tracking, request analytics, authentication, rate limiting, response caching, reverse proxying, and Kafka producer lifecycle.
 * Launches HTTP server on configured port with graceful shutdown handlers.
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
const producer                = require('../../../shared/kafka/producer');

const logger = createServiceLogger('gateway');
const app    = express();

app.use(correlationId);

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

app.use(analyticsCollector);
app.use(createRequestLogger(logger));
app.use('/health', express.json({ limit: '10kb' }));
app.use(jwtAuth);
app.use(rateLimiter);

app.get('/v1/products', responseCache('products', () => 'all'));
app.get('/v1/products/:id', responseCache('products', (req) => req.params.id));

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

app.use('/analytics', express.json({ limit: '10kb' }), analyticsRoutes);
app.use(gatewayRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `No route found for ${req.method} ${req.path}`,
    },
  });
});

app.use(errorHandler);

const PORT = parseInt(process.env.GATEWAY_PORT || '3000', 10);

async function start() {
  await producer.connect();
  const healthInterval = startHealthPoller();

  const server = app.listen(PORT, () => {
    logger.info(
      `API Gateway [${process.env.GATEWAY_INSTANCE_ID || 'gateway-1'}] listening on port ${PORT}`
    );
    logger.info('Middleware chain: correlationId → analyticsCollector → requestLogger → jwtAuth → rateLimiter → responseCache → proxy');
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received – shutting down API Gateway gracefully`);
    clearInterval(healthInterval);

    server.close(async () => {
      await producer.disconnect();
      logger.info('HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection in Gateway', { reason });
  });
}

start();

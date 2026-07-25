/**
 * Express application server entry point for Order Service.
 * Sets up middleware, MongoDB database connection, order routes, Kafka producer/consumer lifecycle, and graceful shutdown handlers.
 * Launches HTTP server on configured port.
 */

const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const express = require('express');
const { connectDB } = require('../../../shared/config/dbConnect');
const { correlationId } = require('../../../shared/middleware/correlationId');
const { createServiceLogger } = require('../../../shared/utils/logger');
const orderRoutes = require('./routes/orderRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const { createRequestLogger } = require('../../../shared/middleware/requestLogger');
const producer = require('../../../shared/kafka/producer');
const paymentResultConsumer = require('./consumers/paymentResultConsumer');

const logger = createServiceLogger('order-service');
const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(correlationId);
app.use(createRequestLogger(logger));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'order-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/v1/orders', orderRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

app.use(errorHandler);

const PORT = parseInt(process.env.ORDER_PORT || '4004', 10);

async function start() {
  await connectDB();

  await producer.connect();
  await paymentResultConsumer.start();

  const server = app.listen(PORT, () => {
    logger.info(`Order Service listening on port ${PORT}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received – shutting down gracefully`);
    server.close(async () => {
      await paymentResultConsumer.disconnect();
      await producer.disconnect();
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

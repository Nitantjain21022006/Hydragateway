/**
 * order-service/src/server.js
 *
 * Entry point for the Order Service.
 */

require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const { connectDB } = require('../../../shared/config/dbConnect');
const { correlationId } = require('../../../shared/middleware/correlationId');
const { createServiceLogger } = require('../../../shared/utils/logger');
const orderRoutes = require('./routes/orderRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const logger = createServiceLogger('order-service');
const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(correlationId);

// HTTP request logging via Morgan → Winston
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'order-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/v1/orders', orderRoutes);

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.ORDER_PORT || '4004', 10);

async function start() {
  await connectDB();
  const server = app.listen(PORT, () => {
    logger.info(`Order Service listening on port ${PORT}`);
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = (signal) => {
    logger.info(`${signal} received – shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 15 s if connections don't drain
    setTimeout(() => process.exit(1), 15000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

/**
 * product-service/src/server.js
 *
 * Entry point for the Product Service.
 */

require('dotenv').config();
const express = require('express');
const { connectDB } = require('../../../shared/config/dbConnect');
const { correlationId } = require('../../../shared/middleware/correlationId');
const { createServiceLogger } = require('../../../shared/utils/logger');
const { createRequestLogger } = require('../../../shared/middleware/requestLogger');
const productRoutes = require('./routes/productRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const logger = createServiceLogger('product-service');
const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(correlationId);

// Centralized HTTP request logging
app.use(createRequestLogger(logger));

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'product-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/v1/products', productRoutes);

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
const PORT = parseInt(process.env.PRODUCT_PORT || '4002', 10);

async function start() {
  await connectDB();
  const server = app.listen(PORT, () => {
    logger.info(`Product Service listening on port ${PORT}`);
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

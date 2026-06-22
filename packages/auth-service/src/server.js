/**
 * auth-service/src/server.js
 *
 * Express application entry point for the Auth Service.
 *
 * Boot sequence:
 * 1. Load environment variables
 * 2. Connect to MongoDB
 * 3. Register middleware (CORS, JSON parser, logging, correlationId)
 * 4. Mount routes
 * 5. Mount error handler
 * 6. Start HTTP server
 * 7. Register SIGTERM/SIGINT handlers for graceful shutdown
 */

require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const { connectDB } = require('../../../shared/config/dbConnect');
const { correlationId } = require('../../../shared/middleware/correlationId');
const { createServiceLogger } = require('../../../shared/utils/logger');
const authRoutes = require('./routes/authRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const logger = createServiceLogger('auth-service');
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
    service: 'auth-service',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/v1/auth', authRoutes);

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.AUTH_PORT || '4001', 10);

async function start() {
  await connectDB();
  const server = app.listen(PORT, () => {
    logger.info(`Auth Service listening on port ${PORT}`);
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

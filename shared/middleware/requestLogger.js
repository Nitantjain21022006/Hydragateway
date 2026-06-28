/**
 * shared/middleware/requestLogger.js (Phase 9)
 *
 * Morgan-based request logging middleware that streams to Winston.
 *
 * Design decisions:
 * ─────────────────
 * - Captures method, URL, status, response time, and identity.
 * - Extracts X-Correlation-ID for distributed tracing.
 * - Captures Client IP and User ID (if available).
 * - Standardizes the log format across all microservices.
 */

'use strict';

const morgan = require('morgan');

/**
 * createRequestLogger – Returns a morgan middleware instance configured
 * to stream its output to the provided Winston logger.
 * @param {object} logger - Winston logger instance
 */
function createRequestLogger(logger) {
  // Define a custom token for correlation ID
  morgan.token('correlation-id', (req) => req.correlationId || req.headers['x-correlation-id'] || '-');
  
  // Define a custom token for User ID
  morgan.token('user-id', (req) => req.headers['x-user-id'] || (req.user && req.user.userId) || 'anonymous');

  // Define a custom token for Client IP
  morgan.token('ip', (req) => req.ip || req.connection.remoteAddress || '-');

  // Unified log format for Morgan (captured as a string and parsed by Winston if needed, 
  // but here we just pass it as a message)
  const logFormat = '[:correlation-id] :ip :user-id :method :url :status :response-time ms - :res[content-length]';

  return morgan(logFormat, {
    stream: {
      write: (message) => {
        // Log at 'info' level by default
        logger.info(message.trim());
      }
    }
  });
}

module.exports = { createRequestLogger };

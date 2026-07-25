/**
 * Express middleware for HTTP request logging using Morgan and Winston.
 * Captures request metadata, correlation IDs, client IP, and response time.
 * Exports createRequestLogger.
 */

'use strict';

const morgan = require('morgan');

function createRequestLogger(logger) {
  morgan.token('correlation-id', (req) => req.correlationId || req.headers['x-correlation-id'] || '-');
  morgan.token('user-id', (req) => req.headers['x-user-id'] || (req.user && req.user.userId) || 'anonymous');
  morgan.token('ip', (req) => req.ip || req.connection.remoteAddress || '-');

  const logFormat = '[:correlation-id] :ip :user-id :method :url :status :response-time ms - :res[content-length]';

  return morgan(logFormat, {
    stream: {
      write: (message) => {
        logger.info(message.trim());
      }
    }
  });
}

module.exports = { createRequestLogger };


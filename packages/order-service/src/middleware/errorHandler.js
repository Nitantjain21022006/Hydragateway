/**
 * order-service/src/middleware/errorHandler.js
 *
 * Catches errors from routes and formats them for consistent API responses.
 */

const { sendError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('order-service');

function errorHandler(err, req, res, next) {
  // Log the error for internal tracking
  logger.error(err.message, { 
    stack: err.stack,
    path: req.path,
    correlationId: req.headers['x-correlation-id']
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    err.statusCode = 400;
    err.code = 'DB_VALIDATION_ERROR';
    err.details = Object.values(err.errors).map(e => e.message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    err.statusCode = 409;
    err.code = 'DUPLICATE_RESOURCE';
    err.message = 'Resource already exists';
  }

  // Mongoose cast error (invalid ID)
  if (err.name === 'CastError') {
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    err.message = `Invalid value for ${err.path}`;
  }

  sendError(res, err);
}

module.exports = { errorHandler };

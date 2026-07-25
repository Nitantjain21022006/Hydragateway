/**
 * Express error handling middleware for Payment Service.
 * Formats DB validation, duplicate key, and cast errors into standardized API response envelopes.
 * Exports errorHandler middleware function.
 */

const { sendError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('payment-service');

function errorHandler(err, req, res, next) {
  logger.error(err.message, { 
    stack: err.stack,
    path: req.path,
    correlationId: req.headers['x-correlation-id']
  });

  if (err.name === 'ValidationError') {
    err.statusCode = 400;
    err.code = 'DB_VALIDATION_ERROR';
    err.details = Object.values(err.errors).map(e => e.message);
  }

  if (err.code === 11000) {
    err.statusCode = 409;
    err.code = 'DUPLICATE_RESOURCE';
    err.message = 'Resource already exists';
  }

  if (err.name === 'CastError') {
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    err.message = `Invalid value for ${err.path}`;
  }

  sendError(res, err);
}

module.exports = { errorHandler };

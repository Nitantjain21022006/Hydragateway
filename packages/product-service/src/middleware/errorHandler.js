/**
 * Express error handling middleware for Product Service.
 * Formats Mongoose validation, duplicate key, and cast errors into standardized API response envelopes.
 * Exports errorHandler middleware function.
 */

const { sendError, AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('product-service');

function errorHandler(err, req, res, _next) {
  let error = err;

  if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, 400, 'INVALID_ID');
  }

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new AppError('Validation failed', 422, 'VALIDATION_ERROR', details);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(`Duplicate value for field: ${field}`, 409, 'DUPLICATE_KEY');
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    logger.error('Unhandled Server Error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      correlationId: req.correlationId,
    });
  } else {
    logger.warn('Client Error', {
      message: err.message,
      path: req.path,
      statusCode,
      correlationId: req.correlationId,
    });
  }

  sendError(res, error);
}

module.exports = { errorHandler };

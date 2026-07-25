/**
 * Centralized error handling middleware for Auth Service.
 * Formats Mongoose, MongoDB, JWT, and application errors into standardized JSON responses.
 * Exports errorHandler middleware function.
 */

const { sendError, AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('auth-service');

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

  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      correlationId: req.correlationId,
    });
  } else {
    logger.warn('Client error', {
      message: err.message,
      path: req.path,
      statusCode,
      correlationId: req.correlationId,
    });
  }

  sendError(res, error);
}

module.exports = { errorHandler };

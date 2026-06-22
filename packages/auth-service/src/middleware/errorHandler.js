/**
 * auth-service/src/middleware/errorHandler.js
 *
 * Centralized error handling middleware for the Auth Service.
 *
 * Design decisions:
 * - Catches Mongoose validation and cast errors and maps them to
 *   friendly 422 / 400 responses so the client never sees raw DB errors.
 * - Duplicate key error (MongoDB code 11000) is caught and surfaced as 409.
 * - Non-operational errors (programmer mistakes) are logged with full
 *   stack traces in development, but only a generic message in production.
 */

const { sendError, AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('auth-service');

function errorHandler(err, req, res, _next) {
  let error = err;

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, 400, 'INVALID_ID');
  }

  // Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new AppError('Validation failed', 422, 'VALIDATION_ERROR', details);
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new AppError(`Duplicate value for field: ${field}`, 409, 'DUPLICATE_KEY');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
  }

  // Log
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

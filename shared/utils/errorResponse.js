/**
 * Standardized API error response and AppError exception class.
 * Formats API errors and success responses consistently across services.
 * Exports AppError, sendError, and sendSuccess.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function sendError(res, err) {
  const statusCode = err.statusCode || 500;
  const payload = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
  };
  if (err.details) {
    payload.error.details = err.details;
  }
  return res.status(statusCode).json(payload);
}

function sendSuccess(res, data, statusCode = 200, meta = null) {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(statusCode).json(payload);
}

module.exports = { AppError, sendError, sendSuccess };

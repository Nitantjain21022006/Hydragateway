/**
 * shared/utils/errorResponse.js
 *
 * Standardised error shape used by every service.
 *
 * All API errors follow:
 * {
 *   success: false,
 *   error: { code, message, details? }
 * }
 *
 * This consistency means clients and the Gateway can rely on a
 * predictable error envelope regardless of which downstream service
 * produced the error.
 */

class AppError extends Error {
  /**
   * @param {string} message  Human-readable message
   * @param {number} statusCode  HTTP status code
   * @param {string} [code]  Machine-readable error code e.g. "INVALID_TOKEN"
   * @param {any}    [details]  Optional structured details (validation errors)
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguish from programmer errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * sendError – Write a standardised error response.
 * Use this in error-handling middleware only.
 */
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

/**
 * sendSuccess – Write a standardised success response.
 */
function sendSuccess(res, data, statusCode = 200, meta = null) {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(statusCode).json(payload);
}

module.exports = { AppError, sendError, sendSuccess };

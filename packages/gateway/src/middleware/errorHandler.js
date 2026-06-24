/**
 * gateway/src/middleware/errorHandler.js
 *
 * Centralised error-handling middleware for the API Gateway.
 *
 * Design decisions:
 * ─────────────────
 * - This is a standard 4-argument Express error-handling middleware.
 *   Express identifies it as an error handler via the 4-arg signature
 *   (err, req, res, next).
 *
 * - We reuse the shared `sendError` utility so the error envelope is
 *   identical to every other HydraGateway service:
 *   { success: false, error: { code, message, details? } }
 *
 * - Stack traces are stripped in production (NODE_ENV=production) to
 *   avoid leaking implementation details to clients.
 *
 * - Unhandled/non-operational errors (programmer errors) log at `error`
 *   level and return a generic 500 to hide internals.
 */

'use strict';

const { sendError, AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-error');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Correlate error to its originating request
  const correlationId = req.correlationId || '-';

  if (err.isOperational) {
    // Known, expected errors — log at warn level
    logger.warn(`[Gateway] ${err.code}: ${err.message}`, {
      correlationId,
      statusCode: err.statusCode,
      path: req.path,
    });
  } else {
    // Unexpected programmer error — log full details
    logger.error(`[Gateway] Unexpected error: ${err.message}`, {
      correlationId,
      stack: err.stack,
      path: req.path,
    });

    // Convert to a safe operational error for the client
    err = new AppError(
      'An unexpected gateway error occurred',
      500,
      'GATEWAY_ERROR'
    );
  }

  return sendError(res, err);
}

module.exports = { errorHandler };

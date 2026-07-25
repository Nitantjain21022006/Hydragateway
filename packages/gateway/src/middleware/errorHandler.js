/**
 * Express error handling middleware for API Gateway.
 * Intercepts operational and unexpected errors and formats standardized error payloads.
 * Exports errorHandler middleware function.
 */

'use strict';

const { sendError, AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-error');

function errorHandler(err, req, res, next) {
  const correlationId = req.correlationId || '-';

  if (err.isOperational) {
    logger.warn(`[Gateway] ${err.code}: ${err.message}`, {
      correlationId,
      statusCode: err.statusCode,
      path: req.path,
    });
  } else {
    logger.error(`[Gateway] Unexpected error: ${err.message}`, {
      correlationId,
      stack: err.stack,
      path: req.path,
    });

    err = new AppError(
      'An unexpected gateway error occurred',
      500,
      'GATEWAY_ERROR'
    );
  }

  return sendError(res, err);
}

module.exports = { errorHandler };

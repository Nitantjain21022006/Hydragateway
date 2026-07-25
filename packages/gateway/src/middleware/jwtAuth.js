/**
 * JWT authentication middleware for API Gateway routes.
 * Verifies Bearer tokens for protected endpoints and attaches decoded user claims to req.user.
 * Exports jwtAuth and isPublicRoute.
 */

'use strict';

const jwt = require('jsonwebtoken');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-auth');

const PUBLIC_PREFIXES = [
  '/v1/auth/register',
  '/v1/auth/login',
  '/v1/auth/logout',
  '/health',
  '/analytics',
  '/v1/products',
];

function isPublicRoute(path) {
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function jwtAuth(req, res, next) {
  if (isPublicRoute(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError('Authorization token required', 401, 'UNAUTHORIZED')
    );
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return next(new AppError('Malformed authorization header', 401, 'UNAUTHORIZED'));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('[jwtAuth] JWT_SECRET is not configured');
    return next(new AppError('Gateway configuration error', 500, 'CONFIG_ERROR'));
  }

  try {
    const decoded = jwt.verify(token, secret);

    req.user = {
      userId: decoded.id || decoded.userId || decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user',
    };

    logger.info(`[jwtAuth] Token validated for user ${req.user.userId}`, {
      correlationId: req.correlationId,
      path: req.path,
    });

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Token has expired', 401, 'TOKEN_EXPIRED'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token', 401, 'INVALID_TOKEN'));
    }
    return next(new AppError('Authentication failed', 401, 'UNAUTHORIZED'));
  }
}

module.exports = { jwtAuth, isPublicRoute };

/**
 * gateway/src/middleware/jwtAuth.js
 *
 * JWT Authentication middleware for the API Gateway.
 *
 * Design decisions:
 * ─────────────────
 * - The Gateway validates tokens in two stages:
 *   1. LOCAL fast-path: verify the JWT signature locally using the shared
 *      JWT_SECRET. This avoids a network round-trip for every request and
 *      keeps latency low.
 *   2. REMOTE validation (optional, configurable): forward the raw token to
 *      the Auth Service's /v1/auth/validate endpoint. This allows the Auth
 *      Service to implement token revocation (e.g. logout blacklist). In the
 *      current phase we keep this as a comment; it can be enabled by setting
 *      ENABLE_REMOTE_JWT_VALIDATION=true in .env.
 *
 * - Public routes (AUTH_PUBLIC_PATHS) bypass JWT validation entirely.
 *   These are defined as a Set for O(1) lookup.
 *
 * - On success, `req.user` is populated with { userId, email, role } so
 *   downstream proxied requests can carry X-User-Id and X-User-Role headers.
 *
 * - On failure, we immediately return 401 UNAUTHORIZED with a clean JSON
 *   error — the request never reaches the downstream service.
 */

'use strict';

const jwt = require('jsonwebtoken');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-auth');

// Routes that are publicly accessible without a JWT
// Using a Set for O(1) prefix matching
const PUBLIC_PREFIXES = [
  '/v1/auth/register',
  '/v1/auth/login',
  '/v1/auth/logout',
  '/health',
  '/analytics', // Phase 10 – dashboard API is public (lock down via IP/admin scope in production)
];

/**
 * isPublicRoute – checks whether the request path starts with any known
 * public prefix so we skip JWT validation for those routes.
 * @param {string} path
 * @returns {boolean}
 */
function isPublicRoute(path) {
  return PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * jwtAuth – Express middleware.
 *
 * For protected routes:
 *   1. Extracts Bearer token from Authorization header
 *   2. Verifies signature against JWT_SECRET
 *   3. Attaches decoded payload to req.user
 *   4. Passes control to next middleware
 *
 * For public routes:
 *   - Calls next() immediately without any validation
 */
function jwtAuth(req, res, next) {
  // Skip auth for public routes
  if (isPublicRoute(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];

  // No Authorization header present
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

    // Attach user info for downstream middlewares and proxy header injection
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
    // Map specific JWT errors to meaningful codes
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

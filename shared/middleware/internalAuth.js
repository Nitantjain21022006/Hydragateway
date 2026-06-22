/**
 * shared/middleware/internalAuth.js
 *
 * Middleware that validates the X-Internal-Secret header on routes
 * that should only be reachable from other HydraGateway services.
 *
 * Design decision: Simple shared-secret approach as a lightweight
 * first line of defence for internal service-to-service calls.
 * In production this would be replaced with mTLS or a service mesh,
 * but this is a practical improvement over having no auth at all.
 */

const { AppError } = require('../utils/errorResponse');

function internalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SECRET;

  if (!expected) {
    // If secret is not configured, warn loudly but allow in dev only
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }
    return next(new AppError('Internal secret not configured', 500, 'CONFIG_ERROR'));
  }

  if (!secret || secret !== expected) {
    return next(
      new AppError('Forbidden: invalid internal secret', 403, 'FORBIDDEN')
    );
  }

  next();
}

module.exports = { internalAuth };

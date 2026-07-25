/**
 * Middleware for validating inter-service requests using a secret key header.
 * Restricts access to internal service endpoints by verifying X-Internal-Secret.
 * Exports internalAuth middleware function.
 */

const { AppError } = require('../utils/errorResponse');

function internalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  const expected = process.env.INTERNAL_SECRET;

  if (!expected) {
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


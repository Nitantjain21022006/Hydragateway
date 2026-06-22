/**
 * shared/utils/asyncHandler.js
 *
 * Wraps an async Express route handler and forwards any rejected
 * promise to next() so the central error-handler middleware catches it.
 *
 * Without this wrapper every async controller would need its own
 * try/catch, which is boilerplate noise.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 */

function asyncHandler(fn) {
  return function asyncWrapper(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };

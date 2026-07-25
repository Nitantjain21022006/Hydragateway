/**
 * Async error handling wrapper utility for Express route handlers.
 * Catches rejected promises and passes errors to next() middleware.
 * Exports asyncHandler function.
 */

function asyncHandler(fn) {
  return function asyncWrapper(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };


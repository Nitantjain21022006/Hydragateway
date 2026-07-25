/**
 * Middleware for distributed tracing correlation IDs.
 * Generates or propagates X-Correlation-ID header on HTTP requests.
 * Exports correlationId middleware function.
 */

const { v4: uuidv4 } = require('uuid');

function correlationId(req, res, next) {
  const id = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}

module.exports = { correlationId };


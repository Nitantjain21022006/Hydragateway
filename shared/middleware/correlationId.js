/**
 * shared/middleware/correlationId.js
 *
 * Injects or forwards an X-Correlation-ID header on every request.
 *
 * Design decision: Generate a UUID v4 at the entry point (Load Balancer
 * or Gateway edge) and propagate it downstream so every log line across
 * every service shares the same ID for a given user request.
 * This is foundational for distributed tracing.
 */

const { v4: uuidv4 } = require('uuid');

function correlationId(req, res, next) {
  // Accept an upstream correlation ID (e.g. from Load Balancer) or generate one
  const id = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}

module.exports = { correlationId };

/**
 * gateway/src/config/serviceRegistry.js
 *
 * Central source-of-truth for every downstream microservice that this
 * Gateway proxies to.
 *
 * Design decisions:
 * ─────────────────
 * - Registry is loaded once at startup from environment variables so that
 *   the same codebase can target dev / staging / production URLs without
 *   code changes — just .env swaps.
 *
 * - `requiresAuth: false` opts a service's routes out of JWT validation
 *   entirely (e.g. auth register / login endpoints).
 *
 * - `pathPrefix` is the external URL segment clients use (e.g. /v1/auth).
 *   The proxy strips this prefix before forwarding (see gatewayRoutes.js).
 *
 * - `healthPath` is the health-check endpoint the Gateway polls
 *   periodically to decide whether the service is reachable.
 *
 * Schema per entry:
 * {
 *   name        : string   – human-readable identifier used in logs
 *   target      : string   – base URL of the downstream service
 *   pathPrefix  : string   – external path prefix (e.g. '/v1/auth')
 *   requiresAuth: boolean  – whether JWT must be validated before proxying
 *   healthPath  : string   – relative path used by health checker
 * }
 */

'use strict';

const registry = [
  {
    name: 'auth-service',
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
    pathPrefix: '/v1/auth',
    requiresAuth: false,   // register + login are public; /validate is guarded internally
    healthPath: '/health',
  },
  {
    name: 'product-service',
    target: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002',
    pathPrefix: '/v1/products',
    requiresAuth: true,
    healthPath: '/health',
  },
  {
    name: 'payment-service',
    target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:4003',
    pathPrefix: '/v1/payments',
    requiresAuth: true,
    healthPath: '/health',
  },
  {
    name: 'order-service',
    target: process.env.ORDER_SERVICE_URL || 'http://localhost:4004',
    pathPrefix: '/v1/orders',
    requiresAuth: true,
    healthPath: '/health',
  },
];

/**
 * getRegistry – returns the full list of registered services.
 */
function getRegistry() {
  return registry;
}

/**
 * findService – looks up a service entry by its name.
 * @param {string} name
 * @returns {object|undefined}
 */
function findService(name) {
  return registry.find((svc) => svc.name === name);
}

module.exports = { getRegistry, findService };

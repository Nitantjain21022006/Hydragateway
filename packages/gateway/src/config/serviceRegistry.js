/**
 * Configuration registry for downstream microservices target URLs, paths, and health check routes.
 * Defines routing metadata and authentication requirements for proxied services.
 * Exports getRegistry and findService helper functions.
 */

'use strict';

const registry = [
  {
    name: 'auth-service',
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
    pathPrefix: '/v1/auth',
    requiresAuth: false,
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

function getRegistry() {
  return registry;
}

function findService(name) {
  return registry.find((svc) => svc.name === name);
}

module.exports = { getRegistry, findService };

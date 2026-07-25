/**
 * Dynamic environment configuration builder for load balancer target gateway instances.
 * Parses environment variables to discover gateway target URLs.
 * Exports getGatewayRegistry.
 */

'use strict';

function buildRegistry() {
  const instances = [];

  for (let n = 1; n <= 10; n++) {
    const url = process.env[`GW_INSTANCE_${n}_URL`];
    if (url) {
      instances.push({
        id:     `gateway-${n}`,
        target: url.replace(/\/$/, ''),
        weight: 1,
      });
    }
  }

  if (instances.length === 0) {
    instances.push(
      { id: 'gateway-1', target: 'http://localhost:3000', weight: 1 },
      { id: 'gateway-2', target: 'http://localhost:3001', weight: 1 }
    );
  }

  return instances;
}

const registry = buildRegistry();

function getGatewayRegistry() {
  return registry;
}

module.exports = { getGatewayRegistry };

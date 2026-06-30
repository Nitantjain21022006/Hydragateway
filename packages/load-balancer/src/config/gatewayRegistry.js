/**
 * load-balancer/src/config/gatewayRegistry.js  (Phase 11)
 *
 * Registry of all Gateway instances that the Load Balancer distributes
 * traffic across.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Design decisions:
 * ──────────────────────────────────────────────────────────────────────────
 *  - Gateway instances are loaded from environment variables so the same
 *    binary can target different clusters without code changes.
 *
 *  - Each entry carries:
 *      id      : unique human-readable label (e.g. "gateway-1")
 *      target  : full URL incl. scheme and port (e.g. "http://localhost:3000")
 *      weight  : reserved for future weighted round-robin (default: 1)
 *
 *  - The list is intentionally static at startup. A dynamic registry backed
 *    by Redis pub/sub or etcd can replace this in Phase 14+ (Docker/K8s).
 *
 *  - Supports up to 10 gateway instances via GW_INSTANCE_<N>_URL env vars.
 *    Falls back to two local defaults for development convenience.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Environment variables (all optional):
 * ──────────────────────────────────────────────────────────────────────────
 *  GW_INSTANCE_1_URL  = http://localhost:3000   (default gateway-1)
 *  GW_INSTANCE_2_URL  = http://localhost:3001   (default gateway-2)
 *  GW_INSTANCE_N_URL  = http://...              (gateway-N, up to N=10)
 */

'use strict';

/**
 * buildRegistry – reads GW_INSTANCE_N_URL vars and returns a gateway list.
 * @returns {Array<{id: string, target: string, weight: number}>}
 */
function buildRegistry() {
  const instances = [];

  for (let n = 1; n <= 10; n++) {
    const url = process.env[`GW_INSTANCE_${n}_URL`];
    if (url) {
      instances.push({
        id:     `gateway-${n}`,
        target: url.replace(/\/$/, ''), // strip trailing slash
        weight: 1,
      });
    }
  }

  // Development fallback: two local gateway instances
  if (instances.length === 0) {
    instances.push(
      { id: 'gateway-1', target: 'http://localhost:3000', weight: 1 },
      { id: 'gateway-2', target: 'http://localhost:3001', weight: 1 }
    );
  }

  return instances;
}

const registry = buildRegistry();

/**
 * getGatewayRegistry – returns the immutable list of gateway instances.
 * @returns {Array<{id: string, target: string, weight: number}>}
 */
function getGatewayRegistry() {
  return registry;
}

module.exports = { getGatewayRegistry };

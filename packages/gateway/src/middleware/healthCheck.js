/**
 * gateway/src/middleware/healthCheck.js
 *
 * Active health-check poller for all registered downstream services.
 *
 * Design decisions:
 * ─────────────────
 * - Polling is done on a fixed interval (HEALTH_CHECK_INTERVAL_MS, default
 *   10 s) via setInterval so the Gateway always has a fresh view of which
 *   services are alive without blocking the request path.
 *
 * - `serviceHealth` is a plain in-memory object. This is intentional:
 *   health state only needs to be accurate per-Gateway-instance. If we
 *   needed cross-instance agreement we would store it in Redis (Phase 11+).
 *
 * - We use axios with a short 3-second timeout so a hung service does not
 *   cause the health-check loop itself to back-pressure.
 *
 * - `isServiceHealthy(name)` is used by the proxy router before forwarding
 *   each request. If the service is marked DOWN we return 503 immediately
 *   without hitting the downstream target.
 *
 * - On first boot all services default to `true` (optimistic) so the
 *   Gateway can start serving traffic while the first poll runs.
 */

'use strict';

const axios = require('axios');
const { getRegistry } = require('../config/serviceRegistry');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-health');

// In-memory health map  →  { 'auth-service': true, 'product-service': false, … }
const serviceHealth = {};

/**
 * Initialise health map to true (optimistic) for all registered services.
 * Called once at startup before the first poll completes.
 */
function initHealthMap() {
  const registry = getRegistry();
  registry.forEach((svc) => {
    serviceHealth[svc.name] = true; // Optimistic default
  });
}

/**
 * pollHealth – hit each service's health endpoint and update the map.
 * Runs on a timer; also exported for manual triggering in tests.
 */
async function pollHealth() {
  const registry = getRegistry();

  await Promise.allSettled(
    registry.map(async (svc) => {
      const url = `${svc.target}${svc.healthPath}`;
      try {
        const res = await axios.get(url, { timeout: 3000 });
        const healthy = res.status >= 200 && res.status < 300;

        if (serviceHealth[svc.name] !== healthy) {
          logger.warn(`[HealthCheck] ${svc.name} health changed → ${healthy ? 'UP' : 'DOWN'}`);
        }

        serviceHealth[svc.name] = healthy;
      } catch (err) {
        if (serviceHealth[svc.name] !== false) {
          logger.warn(`[HealthCheck] ${svc.name} is DOWN – ${err.message}`);
        }
        serviceHealth[svc.name] = false;
      }
    })
  );
}

/**
 * startHealthPoller – initialise map then kick off recurring polling.
 * @returns {NodeJS.Timeout} interval handle so caller can clearInterval on shutdown
 */
function startHealthPoller() {
  initHealthMap();

  // Run immediately on startup, then on interval
  pollHealth();

  const intervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '10000', 10);
  const handle = setInterval(pollHealth, intervalMs);
  handle.unref(); // Don't keep process alive just for health checks

  logger.info(`[HealthCheck] Polling all services every ${intervalMs}ms`);
  return handle;
}

/**
 * isServiceHealthy – synchronous check used by the proxy router.
 * @param {string} serviceName
 * @returns {boolean}
 */
function isServiceHealthy(serviceName) {
  // If we have no record (service not in registry), default to true
  if (!(serviceName in serviceHealth)) return true;
  return serviceHealth[serviceName];
}

/**
 * getHealthSnapshot – returns a copy of the full health map.
 * Used by the gateway /health endpoint.
 */
function getHealthSnapshot() {
  return { ...serviceHealth };
}

module.exports = { startHealthPoller, isServiceHealthy, getHealthSnapshot, pollHealth };

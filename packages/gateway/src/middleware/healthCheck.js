/**
 * Active downstream health poller for API Gateway microservices.
 * Periodically polls target services and maintains in-memory reachability state.
 * Exports startHealthPoller, isServiceHealthy, getHealthSnapshot, and pollHealth.
 */

'use strict';

const axios = require('axios');
const { getRegistry } = require('../config/serviceRegistry');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-health');

const serviceHealth = {};

function initHealthMap() {
  const registry = getRegistry();
  registry.forEach((svc) => {
    serviceHealth[svc.name] = true;
  });
}

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

function startHealthPoller() {
  initHealthMap();
  pollHealth();

  const intervalMs = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '10000', 10);
  const handle = setInterval(pollHealth, intervalMs);
  handle.unref();

  logger.info(`[HealthCheck] Polling all services every ${intervalMs}ms`);
  return handle;
}

function isServiceHealthy(serviceName) {
  if (!(serviceName in serviceHealth)) return true;
  return serviceHealth[serviceName];
}

function getHealthSnapshot() {
  return { ...serviceHealth };
}

module.exports = { startHealthPoller, isServiceHealthy, getHealthSnapshot, pollHealth };

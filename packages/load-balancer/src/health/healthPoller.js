/**
 * Active health checker polling gateway targets for load balancer routing decisions.
 * Tracks consecutive success and failure thresholds to maintain target health maps.
 * Exports startHealthPoller, getHealthMap, getDetailedHealth, and pollAll.
 */

'use strict';

const axios = require('axios');
const { getGatewayRegistry } = require('../config/gatewayRegistry');
const { createLBLogger } = require('../utils/lbLogger');

const logger = createLBLogger('lb-health');

const POLL_INTERVAL_MS    = parseInt(process.env.LB_HEALTH_INTERVAL_MS   || '10000', 10);
const HEALTH_TIMEOUT_MS   = parseInt(process.env.LB_HEALTH_TIMEOUT_MS    || '3000',  10);
const FAIL_THRESHOLD      = parseInt(process.env.HEALTH_FAILURE_THRESHOLD || '1',     10);
const SUCCESS_THRESHOLD   = parseInt(process.env.HEALTH_SUCCESS_THRESHOLD || '1',     10);

const healthMap = {};
const consecutiveMap = {};

function initHealthMap() {
  const registry = getGatewayRegistry();
  registry.forEach((gw) => {
    healthMap[gw.id]      = true;
    consecutiveMap[gw.id] = { failures: 0, successes: 0 };
  });
  logger.info(`[HealthPoller] Initialised health map for ${registry.length} gateway(s)`);
}

async function checkGateway(gw) {
  const url = `${gw.target}/health`;
  let isUp  = false;

  try {
    const resp = await axios.get(url, { timeout: HEALTH_TIMEOUT_MS });
    isUp = resp.status >= 200 && resp.status < 300;
  } catch {
    isUp = false;
  }

  const prev = healthMap[gw.id];
  const c    = consecutiveMap[gw.id] || { failures: 0, successes: 0 };

  if (isUp) {
    c.failures  = 0;
    c.successes += 1;

    if (c.successes >= SUCCESS_THRESHOLD && !prev) {
      healthMap[gw.id] = true;
      logger.warn(`[HealthPoller] ✅ ${gw.id} recovered (UP) — target: ${gw.target}`);
    }
  } else {
    c.successes = 0;
    c.failures  += 1;

    if (c.failures >= FAIL_THRESHOLD && prev !== false) {
      healthMap[gw.id] = false;
      logger.warn(`[HealthPoller] ❌ ${gw.id} is DOWN (${c.failures} consecutive failure(s)) — target: ${gw.target}`);
    }
  }

  consecutiveMap[gw.id] = c;
}

async function pollAll() {
  const registry = getGatewayRegistry();
  await Promise.allSettled(registry.map((gw) => checkGateway(gw)));
}

function startHealthPoller() {
  initHealthMap();
  pollAll();

  const handle = setInterval(pollAll, POLL_INTERVAL_MS);
  handle.unref();

  logger.info(`[HealthPoller] Polling ${getGatewayRegistry().length} gateway(s) every ${POLL_INTERVAL_MS}ms`);
  return handle;
}

function getHealthMap() {
  return { ...healthMap };
}

function getDetailedHealth() {
  const registry = getGatewayRegistry();
  return registry.map((gw) => {
    const c = consecutiveMap[gw.id] || { failures: 0, successes: 0 };
    return {
      id:      gw.id,
      target:  gw.target,
      healthy: healthMap[gw.id] !== false,
      consecutiveFailures:  c.failures,
      consecutiveSuccesses: c.successes,
    };
  });
}

module.exports = { startHealthPoller, getHealthMap, getDetailedHealth, pollAll };

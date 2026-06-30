/**
 * load-balancer/src/health/healthPoller.js  (Phase 11)
 *
 * Active Health Poller for Gateway instances.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * How it works:
 * ──────────────────────────────────────────────────────────────────────────
 *  1. On startup: initialise all gateways as HEALTHY (optimistic default)
 *     so traffic flows immediately without waiting for the first poll cycle.
 *  2. Every LB_HEALTH_INTERVAL_MS (default 10 s): hit each gateway's
 *     /health endpoint using axios with a 3 s timeout.
 *  3. If the HTTP response is 2xx  → mark HEALTHY.
 *     If connection refused / timeout / non-2xx → mark UNHEALTHY.
 *  4. On state transitions (UP→DOWN, DOWN→UP) emit a warning log so
 *     operators are immediately notified.
 *  5. The healthMap is exported as a plain object; the round-robin
 *     algorithm reads it synchronously (no await needed on the hot path).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Failover logic:
 * ──────────────────────────────────────────────────────────────────────────
 *  - A gateway is marked DOWN after a SINGLE failed health check.
 *    Rationale: we prefer to fail fast. In a real system use a consecutive
 *    failure threshold (e.g. 2 failures before marking DOWN) — see
 *    `HEALTH_FAILURE_THRESHOLD` env var which is honoured here.
 *
 *  - Recovery: a gateway is marked HEALTHY after a SINGLE successful check.
 *    In production raise the threshold (HEALTH_SUCCESS_THRESHOLD) to avoid
 *    flapping on an unstable instance.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Environment variables:
 * ──────────────────────────────────────────────────────────────────────────
 *  LB_HEALTH_INTERVAL_MS     = 10000   Health poll interval in ms
 *  LB_HEALTH_TIMEOUT_MS      = 3000    Timeout per health request
 *  HEALTH_FAILURE_THRESHOLD  = 1       Consecutive failures before DOWN
 *  HEALTH_SUCCESS_THRESHOLD  = 1       Consecutive successes before UP
 */

'use strict';

const axios = require('axios');
const { getGatewayRegistry } = require('../config/gatewayRegistry');
const { createLBLogger } = require('../utils/lbLogger');

const logger = createLBLogger('lb-health');

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS    = parseInt(process.env.LB_HEALTH_INTERVAL_MS   || '10000', 10);
const HEALTH_TIMEOUT_MS   = parseInt(process.env.LB_HEALTH_TIMEOUT_MS    || '3000',  10);
const FAIL_THRESHOLD      = parseInt(process.env.HEALTH_FAILURE_THRESHOLD || '1',     10);
const SUCCESS_THRESHOLD   = parseInt(process.env.HEALTH_SUCCESS_THRESHOLD || '1',     10);

// ── State ─────────────────────────────────────────────────────────────────────

/**
 * healthMap – live health state for every registered gateway.
 * { [gatewayId: string]: boolean }
 */
const healthMap = {};

/**
 * consecutiveMap – tracks consecutive failure/success counts per gateway
 * to implement threshold-based state changes.
 * { [gatewayId: string]: { failures: number, successes: number } }
 */
const consecutiveMap = {};

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * initHealthMap – sets all gateways to HEALTHY (optimistic default) and
 * resets consecutive counters. Called once before the first poll.
 */
function initHealthMap() {
  const registry = getGatewayRegistry();
  registry.forEach((gw) => {
    healthMap[gw.id]      = true;
    consecutiveMap[gw.id] = { failures: 0, successes: 0 };
  });
  logger.info(`[HealthPoller] Initialised health map for ${registry.length} gateway(s)`);
}

// ── Poll logic ─────────────────────────────────────────────────────────────────

/**
 * checkGateway – pings a single gateway's /health endpoint and updates
 * the healthMap according to success/failure thresholds.
 * @param {{ id: string, target: string }} gw
 */
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
      // Gateway recovered: DOWN → UP
      healthMap[gw.id] = true;
      logger.warn(`[HealthPoller] ✅ ${gw.id} recovered (UP) — target: ${gw.target}`);
    }
  } else {
    c.successes = 0;
    c.failures  += 1;

    if (c.failures >= FAIL_THRESHOLD && prev !== false) {
      // Gateway failed: UP → DOWN
      healthMap[gw.id] = false;
      logger.warn(`[HealthPoller] ❌ ${gw.id} is DOWN (${c.failures} consecutive failure(s)) — target: ${gw.target}`);
    }
  }

  consecutiveMap[gw.id] = c;
}

/**
 * pollAll – checks every registered gateway in parallel.
 * Uses Promise.allSettled so one failure doesn't prevent others from running.
 */
async function pollAll() {
  const registry = getGatewayRegistry();
  await Promise.allSettled(registry.map((gw) => checkGateway(gw)));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * startHealthPoller – initialise health map, run first poll immediately,
 * then schedule recurring polls.
 * @returns {NodeJS.Timeout} interval handle for clearInterval on shutdown
 */
function startHealthPoller() {
  initHealthMap();
  pollAll(); // Non-blocking first poll

  const handle = setInterval(pollAll, POLL_INTERVAL_MS);
  handle.unref(); // Don't prevent process exit

  logger.info(`[HealthPoller] Polling ${getGatewayRegistry().length} gateway(s) every ${POLL_INTERVAL_MS}ms`);
  return handle;
}

/**
 * getHealthMap – returns a copy of the current health state.
 * @returns {{ [gatewayId: string]: boolean }}
 */
function getHealthMap() {
  return { ...healthMap };
}

/**
 * getDetailedHealth – returns full health data including consecutive counts.
 * Used by the load balancer's /lb-health endpoint.
 * @returns {Array<{id: string, target: string, healthy: boolean, failures: number, successes: number}>}
 */
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

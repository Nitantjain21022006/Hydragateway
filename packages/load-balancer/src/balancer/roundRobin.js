/**
 * load-balancer/src/balancer/roundRobin.js  (Phase 11)
 *
 * Round-Robin Load Balancer – picks the next healthy gateway instance in
 * a circular sequence.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Algorithm: Weighted Round-Robin (weight=1 for all → pure round-robin)
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  State:
 *    currentIndex  – pointer into the gateway registry array.
 *
 *  On each call to next():
 *    1. If NO gateways are healthy → return null  (caller returns 503).
 *    2. Scan from currentIndex forward (wrapping) to find a healthy gateway.
 *    3. Advance currentIndex by 1 after the selection so the next call
 *       picks the following instance.
 *    4. Return the selected gateway entry.
 *
 *  Properties of this implementation:
 *    - O(n) worst case when n-1 gateways are down (scans the full ring once).
 *    - Atomic via single-threaded Node.js — no mutex needed.
 *    - Zero-downtime failover: if an instance goes DOWN mid-cycle it is
 *      skipped on the very next request (health map is kept live by the
 *      health poller).
 *    - Thread-safe: Node.js event loop is single-threaded; no race conditions.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Scalability discussion:
 * ──────────────────────────────────────────────────────────────────────────
 *  Current:   In-memory index — correct within a single Load Balancer process.
 *  Multi-LB:  Store currentIndex in Redis (INCR + SETNX) so multiple LB
 *             instances stay in sync (Phase 14+ / Docker Swarm / K8s).
 *  Weighted:  Pre-expand the registry array (gateway with weight 3 → 3 slots)
 *             before starting the round-robin pointer. Pure round-robin is
 *             a special case of weighted where all weights equal 1.
 *  Sticky:    Add a thin consistent-hash layer on top (IP hash → gateway).
 *             Use Redis to persist the mapping with a TTL equal to the
 *             session lifetime.
 */

'use strict';

const { getGatewayRegistry } = require('../config/gatewayRegistry');
const { createLBLogger } = require('../utils/lbLogger');

const logger = createLBLogger('lb-round-robin');

// ── State ─────────────────────────────────────────────────────────────────────

let currentIndex = 0; // Pointer into the gateway list

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * next – selects the next healthy gateway instance using round-robin.
 *
 * @param {Object} healthMap  – { [gatewayId]: boolean }  (from health poller)
 * @returns {{ id: string, target: string, weight: number } | null}
 *          null when no healthy gateways are available.
 */
function next(healthMap) {
  const registry = getGatewayRegistry();
  const total    = registry.length;

  if (total === 0) {
    logger.error('[RoundRobin] Gateway registry is empty');
    return null;
  }

  // Check if at least one gateway is healthy
  const anyHealthy = registry.some((gw) => healthMap[gw.id] !== false);
  if (!anyHealthy) {
    logger.error('[RoundRobin] All gateway instances are DOWN');
    return null;
  }

  // Scan forward (with wrap-around) to find the next healthy gateway
  let attempts = 0;
  while (attempts < total) {
    const candidate = registry[currentIndex % total];
    currentIndex    = (currentIndex + 1) % total;
    attempts++;

    if (healthMap[candidate.id] !== false) {
      // Found a healthy candidate
      logger.debug(`[RoundRobin] Selected ${candidate.id} (${candidate.target})`);
      return candidate;
    }

    logger.debug(`[RoundRobin] Skipping ${candidate.id} (DOWN)`);
  }

  // Should never reach here due to the anyHealthy check above,
  // but guard against edge cases.
  logger.error('[RoundRobin] Could not find a healthy gateway after full scan');
  return null;
}

/**
 * resetIndex – resets the round-robin pointer.
 * Useful for testing; should not be called in production.
 */
function resetIndex() {
  currentIndex = 0;
}

/**
 * getCurrentIndex – returns the current pointer (for observability/tests).
 */
function getCurrentIndex() {
  return currentIndex;
}

module.exports = { next, resetIndex, getCurrentIndex };

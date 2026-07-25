/**
 * Round-robin algorithm implementation for choosing healthy gateway instances.
 * Rotates target index dynamically while filtering out unhealthy instances.
 * Exports next, resetIndex, and getCurrentIndex.
 */

'use strict';

const { getGatewayRegistry } = require('../config/gatewayRegistry');
const { createLBLogger } = require('../utils/lbLogger');

const logger = createLBLogger('lb-round-robin');

let currentIndex = 0;

function next(healthMap) {
  const registry = getGatewayRegistry();
  const total    = registry.length;

  if (total === 0) {
    logger.error('[RoundRobin] Gateway registry is empty');
    return null;
  }

  const anyHealthy = registry.some((gw) => healthMap[gw.id] !== false);
  if (!anyHealthy) {
    logger.error('[RoundRobin] All gateway instances are DOWN');
    return null;
  }

  let attempts = 0;
  while (attempts < total) {
    const candidate = registry[currentIndex % total];
    currentIndex    = (currentIndex + 1) % total;
    attempts++;

    if (healthMap[candidate.id] !== false) {
      logger.debug(`[RoundRobin] Selected ${candidate.id} (${candidate.target})`);
      return candidate;
    }

    logger.debug(`[RoundRobin] Skipping ${candidate.id} (DOWN)`);
  }

  logger.error('[RoundRobin] Could not find a healthy gateway after full scan');
  return null;
}

function resetIndex() {
  currentIndex = 0;
}

function getCurrentIndex() {
  return currentIndex;
}

module.exports = { next, resetIndex, getCurrentIndex };

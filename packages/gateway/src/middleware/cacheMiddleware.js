/**
 * gateway/src/middleware/cacheMiddleware.js (Phase 8)
 *
 * Redis-backed Response Caching middleware.
 *
 * Design decisions:
 * ─────────────────
 * - We cache only successful (200 OK) GET requests.
 * - Cache keys are namespaced: cache:<resource>:<identifier>.
 * - Uses `res.send` override to capture the response body before it goes to the client.
 * - TTL is configurable via environment variables (CACHE_TTL_SECONDS).
 * - Bypasses cache if Redis is unavailable (fail-open strategy consistent with rate limiter).
 */

'use strict';

const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-cache');

// Configuration
const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '60', 10);

/**
 * responseCache – Express middleware factory.
 * @param {string} resource - Resource name for the key (e.g., 'products')
 * @param {Function} keyGenerator - Function to generate the unique ID for the key (req => string)
 */
function responseCache(resource, keyGenerator) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    let redis;
    try {
      redis = getRedisClient();
    } catch (err) {
      logger.warn('[Cache] Redis unavailable – skipping cache', { error: err.message });
      return next();
    }

    const id = keyGenerator(req);
    const cacheKey = `cache:${resource}:${id}`;

    try {
      // 1. Try to fetch from cache
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        logger.info(`[Cache] HIT: ${cacheKey}`, { correlationId: req.correlationId });
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(cachedData);
      }

      logger.info(`[Cache] MISS: ${cacheKey}`, { correlationId: req.correlationId });
      res.setHeader('X-Cache', 'MISS');

      // 2. Overwrite res.write and res.end to capture proxy-streamed responses
      const originalWrite = res.write;
      const originalEnd = res.end;
      const chunks = [];

      res.write = function(chunk, encoding, callback) {
        if (chunk && typeof chunk !== 'function') {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8');
          chunks.push(buf);
        }
        return originalWrite.apply(res, arguments);
      };

      res.end = function(chunk, encoding, callback) {
        if (chunk && typeof chunk !== 'function') {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8');
          chunks.push(buf);
        }

        // Cache only on 200 OK responses
        if (res.statusCode === 200) {
          try {
            const bodyBuffer = Buffer.concat(chunks);
            const bodyString = bodyBuffer.toString('utf8');

            // Store in Redis asynchronously (don't block the response)
            redis.set(cacheKey, bodyString, 'EX', DEFAULT_TTL)
              .then(() => logger.debug(`[Cache] Stored: ${cacheKey}`))
              .catch(err => logger.warn(`[Cache] Failed to store ${cacheKey}: ${err.message}`));
          } catch (err) {
            logger.warn(`[Cache] Serialization error for ${cacheKey}: ${err.message}`);
          }
        }

        // Restore original functions
        res.write = originalWrite;
        res.end = originalEnd;

        return originalEnd.apply(res, arguments);
      };

      next();
    } catch (err) {
      logger.error(`[Cache] Error during cache lookup for ${cacheKey}: ${err.message}`);
      next();
    }
  };
}

module.exports = { responseCache };

/**
 * Redis-backed HTTP response caching middleware for GET requests.
 * Caches successful downstream JSON responses using resource keys and configurable TTL.
 * Exports responseCache middleware factory function.
 */

'use strict';

const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('gateway-cache');

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS || '60', 10);

function responseCache(resource, keyGenerator) {
  return async (req, res, next) => {
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
      const cachedData = await redis.get(cacheKey);

      if (cachedData) {
        logger.info(`[Cache] HIT: ${cacheKey}`, { correlationId: req.correlationId });
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.send(cachedData);
      }

      logger.info(`[Cache] MISS: ${cacheKey}`, { correlationId: req.correlationId });
      res.setHeader('X-Cache', 'MISS');

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

        if (res.statusCode === 200) {
          try {
            const bodyBuffer = Buffer.concat(chunks);
            const bodyString = bodyBuffer.toString('utf8');

            redis.set(cacheKey, bodyString, 'EX', DEFAULT_TTL)
              .then(() => logger.debug(`[Cache] Stored: ${cacheKey}`))
              .catch(err => logger.warn(`[Cache] Failed to store ${cacheKey}: ${err.message}`));
          } catch (err) {
            logger.warn(`[Cache] Serialization error for ${cacheKey}: ${err.message}`);
          }
        }

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

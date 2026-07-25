/**
 * Express middleware and ring-buffer event emitter for collecting API Gateway request analytics.
 * Pipelines metric counters to Redis and streams real-time request events.
 * Publishes product.viewed analytics events to Kafka for product detail views.
 * Exports analyticsCollector, requestEventBus, and getRecentRequests.
 */

'use strict';

const EventEmitter = require('events');
const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');
const { getRegistry } = require('../config/serviceRegistry');
const producer = require('../../../../shared/kafka/producer');
const { TOPICS } = require('../../../../shared/kafka/topics');

const logger = createServiceLogger('gateway-analytics');

const requestEventBus = new EventEmitter();
requestEventBus.setMaxListeners(50);

const RING_BUFFER_SIZE = 500;
const recentRequests = [];

function pushToRingBuffer(record) {
  recentRequests.push(record);
  if (recentRequests.length > RING_BUFFER_SIZE) {
    recentRequests.shift();
  }
}

function getRecentRequests() {
  return [...recentRequests];
}

const registry = getRegistry();
const prefixToService = {};
registry.forEach((svc) => {
  prefixToService[svc.pathPrefix] = svc.name;
});

let lastRedisWarnAt = 0;
const REDIS_WARN_INTERVAL_MS = 60_000;

const GATEWAY_INSTANCE = process.env.GATEWAY_INSTANCE_ID || 'gateway-1';

const PRODUCT_VIEW_PATTERN = /^\/v1\/products\/([a-f0-9]{24})$/i;

function resolveServiceName(reqPath) {
  for (const prefix of Object.keys(prefixToService)) {
    if (reqPath.startsWith(prefix)) {
      return prefixToService[prefix];
    }
  }
  return 'gateway';
}

function getStatusBucket(status) {
  if (status < 300) return '2xx';
  if (status < 400) return '3xx';
  if (status < 500) return '4xx';
  return '5xx';
}

function getTimelineKey() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm   = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(now.getUTCDate()).padStart(2, '0');
  return `analytics:timeline:${yyyy}-${mm}-${dd}`;
}

function getMinuteField() {
  const now = new Date();
  const hh  = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

function sanitisePath(reqPath) {
  let s = reqPath.replace(/\/[a-f0-9]{24}/gi, '/:id');
  s = s.replace(/\/\d+/g, '/:n');
  s = s.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid');
  return s;
}

function analyticsCollector(req, res, next) {
  const startAt = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - startAt;
    const elapsedMs = Number(elapsedNs / 1_000_000n);

    const status      = res.statusCode;
    const method      = req.method;
    const originalPath = (req.originalUrl || req.path || '/').split('?')[0];
    const path        = sanitisePath(originalPath);
    const service     = resolveServiceName(originalPath);
    const bucket      = getStatusBucket(status);
    const isFailed    = status >= 400;
    const timelineKey = getTimelineKey();
    const minuteField = getMinuteField();

    const requestRecord = {
      correlationId:    req.correlationId || null,
      timestamp:        new Date().toISOString(),
      method,
      path,
      service,
      statusCode:       status,
      latencyMs:        Math.round(elapsedMs),
      cacheHit:         res.getHeader('X-Cache') === 'HIT',
      jwtStatus:        req.user ? 'authenticated' : (isFailed && status === 401 ? 'rejected' : 'public'),
      rateLimitStatus:  status === 429 ? 'limited' : 'allowed',
      gatewayInstance:  GATEWAY_INSTANCE,
      bucket,
    };

    pushToRingBuffer(requestRecord);
    requestEventBus.emit('request', requestRecord);

    if (method === 'GET' && status < 400) {
      const productViewMatch = PRODUCT_VIEW_PATTERN.exec(originalPath);
      if (productViewMatch) {
        const productId = productViewMatch[1];
        setImmediate(async () => {
          await producer.publish(
            TOPICS.ANALYTICS_EVENT,
            productId,
            {
              eventType:      'product.viewed',
              productId,
              correlationId:  req.correlationId || null,
              gatewayInstance: GATEWAY_INSTANCE,
              latencyMs:      Math.round(elapsedMs),
              timestamp:      new Date().toISOString(),
            }
          );
        });
      }
    }

    let redis;
    try {
      redis = getRedisClient();
    } catch (err) {
      const now = Date.now();
      if (now - lastRedisWarnAt > REDIS_WARN_INTERVAL_MS) {
        logger.warn('[Analytics] Redis unavailable – skipping metrics recording', {
          error: err.message,
        });
        lastRedisWarnAt = now;
      }
      return;
    }

    try {
      const pipe = redis.pipeline();

      pipe.incr('analytics:total_requests');

      if (isFailed) {
        pipe.incr('analytics:failed_requests');
      }

      pipe.incr(`analytics:gateway:${GATEWAY_INSTANCE}`);
      pipe.incr(`analytics:service:${service}`);
      pipe.incr(`analytics:status:${bucket}`);

      pipe.incrby('analytics:latency:total_ms', Math.round(elapsedMs));
      pipe.incr('analytics:latency:count');

      const endpointKey = `analytics:endpoint:${method}:${path}`;
      pipe.incr(endpointKey);
      pipe.expire(endpointKey, 604800);

      pipe.hincrby(timelineKey, minuteField, 1);
      pipe.expire(timelineKey, 604800);

      pipe.exec().catch((err) => {
        logger.warn('[Analytics] Pipeline error during metrics write', {
          error: err.message,
        });
      });
    } catch (err) {
      logger.warn('[Analytics] Failed to build pipeline', { error: err.message });
    }
  });

  next();
}

module.exports = { analyticsCollector, requestEventBus, getRecentRequests };

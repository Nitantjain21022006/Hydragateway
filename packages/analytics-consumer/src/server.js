/**
 * Analytics Consumer background service for HydraGateway.
 * Consumes Kafka events from all topics and aggregates metrics into Redis.
 * Reports published/consumed counts, events/sec, and per-topic statistics.
 */

'use strict';

const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { Kafka, logLevel } = require('kafkajs');
const Redis = require('ioredis');
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format((info) => { info.service = 'analytics-consumer'; return info; })(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [new transports.Console()],
});

const BROKERS     = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim());
const CLIENT_ID   = process.env.KAFKA_CLIENT_ID || 'hydragateway';
const ENABLED     = process.env.KAFKA_ENABLED !== 'false';
const REDIS_HOST  = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT  = parseInt(process.env.REDIS_PORT || '6379', 10);

const CONSUME_TOPICS = [
  'order.created',
  'payment.completed',
  'payment.failed',
  'inventory.updated',
  'analytics.event',
];

const GROUP_ID = 'analytics-event-consumer';

let redis = null;
let consumer = null;

function buildRedis() {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on('error', (err) => {
    logger.warn('[AnalyticsConsumer] Redis error', { error: err.message });
  });

  return client;
}

async function incrementMetrics(topic, eventType) {
  if (!redis) return;

  try {
    const pipe = redis.pipeline();
    pipe.incr('kafka:consumed:total');
    pipe.incr(`kafka:consumed:topic:${topic}`);
    if (eventType) {
      pipe.incr(`kafka:consumed:event:${eventType}`);
    }

    const now    = Date.now();
    const bucket = Math.floor(now / 1000);
    pipe.incr(`kafka:events_per_sec:${bucket}`);
    pipe.expire(`kafka:events_per_sec:${bucket}`, 120);

    await pipe.exec();
  } catch (err) {
    logger.warn('[AnalyticsConsumer] Redis write error', { error: err.message });
  }
}

async function start() {
  if (!ENABLED) {
    logger.info('[AnalyticsConsumer] Kafka is disabled — exiting');
    return;
  }

  redis = buildRedis();
  try {
    await redis.connect();
    logger.info('[AnalyticsConsumer] Redis connected', { host: REDIS_HOST, port: REDIS_PORT });
  } catch (err) {
    logger.warn('[AnalyticsConsumer] Redis unavailable — metrics will be dropped', { error: err.message });
  }

  const kafka = new Kafka({
    clientId: `${CLIENT_ID}-analytics-consumer`,
    brokers: BROKERS,
    logLevel: logLevel.WARN,
    retry: { initialRetryTime: 300, retries: 8 },
  });

  consumer = kafka.consumer({
    groupId: GROUP_ID,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  try {
    await consumer.connect();
    logger.info('[AnalyticsConsumer] Kafka connected', { brokers: BROKERS, groupId: GROUP_ID });

    await consumer.subscribe({ topics: CONSUME_TOPICS, fromBeginning: false });
    logger.info('[AnalyticsConsumer] Subscribed to topics', { topics: CONSUME_TOPICS });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const raw = message.value ? message.value.toString() : null;
        if (!raw) return;

        let payload = {};
        try {
          payload = JSON.parse(raw);
        } catch {
          logger.warn('[AnalyticsConsumer] Failed to parse message', { topic });
          return;
        }

        const headers = {};
        if (message.headers) {
          for (const [k, v] of Object.entries(message.headers)) {
            headers[k] = v ? v.toString() : '';
          }
        }

        const eventType = headers.eventType || payload.eventType || topic;

        logger.info('[AnalyticsConsumer] Event consumed', {
          topic,
          partition,
          offset:        message.offset,
          eventType,
          correlationId: headers.correlationId || null,
          timestamp:     headers.timestamp     || new Date().toISOString(),
        });

        await incrementMetrics(topic, eventType);
      },
    });

    logger.info('[AnalyticsConsumer] Consumer running');
  } catch (err) {
    logger.warn('[AnalyticsConsumer] Failed to start Kafka consumer', { error: err.message });
  }
}

async function shutdown(signal) {
  logger.info(`[AnalyticsConsumer] ${signal} received – shutting down`);
  try {
    if (consumer) await consumer.disconnect();
    if (redis) await redis.quit();
  } catch (err) {
    logger.warn('[AnalyticsConsumer] Shutdown error', { error: err.message });
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('[AnalyticsConsumer] Uncaught exception', { error: err.message, stack: err.stack });
});

start();

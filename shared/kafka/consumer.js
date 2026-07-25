/**
 * KafkaJS consumer factory for HydraGateway event consumption.
 * Provides retry logic, duplicate detection via idempotency keys, and graceful shutdown.
 * Exports createConsumer factory function.
 */

'use strict';

const { Kafka, logLevel } = require('kafkajs');
const { createServiceLogger } = require('../utils/logger');

const BROKERS       = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim());
const CLIENT_ID     = process.env.KAFKA_CLIENT_ID || 'hydragateway';
const ENABLED       = process.env.KAFKA_ENABLED !== 'false';
const RETRY_MAX     = parseInt(process.env.KAFKA_CONSUMER_RETRY_MAX || '5', 10);

const SEEN_IDS_TTL_MS = 5 * 60 * 1000;
const MAX_SEEN_IDS    = 10_000;

function buildKafkaClient(clientSuffix) {
  return new Kafka({
    clientId: `${CLIENT_ID}-${clientSuffix}`,
    brokers: BROKERS,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: RETRY_MAX,
    },
  });
}

function createConsumer(groupId, topics, handler) {
  const logger = createServiceLogger(`kafka-consumer-${groupId}`);

  if (!ENABLED) {
    logger.info('[KafkaConsumer] Kafka is disabled — consumer will not start', { groupId });
    return {
      start:      async () => {},
      disconnect: async () => {},
    };
  }

  const kafka    = buildKafkaClient(groupId);
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout:    30000,
    heartbeatInterval: 3000,
  });

  const seenIds   = new Map();
  let   running   = false;

  function pruneSeenIds() {
    if (seenIds.size < MAX_SEEN_IDS) return;
    const cutoff = Date.now() - SEEN_IDS_TTL_MS;
    for (const [id, ts] of seenIds) {
      if (ts < cutoff) seenIds.delete(id);
    }
  }

  function isDuplicate(idempotencyKey) {
    if (!idempotencyKey) return false;
    pruneSeenIds();
    if (seenIds.has(idempotencyKey)) return true;
    seenIds.set(idempotencyKey, Date.now());
    return false;
  }

  async function start() {
    try {
      await consumer.connect();
      logger.info('[KafkaConsumer] Connected', { groupId, topics, brokers: BROKERS });

      await consumer.subscribe({ topics, fromBeginning: false });

      running = true;

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const rawValue = message.value ? message.value.toString() : null;
          if (!rawValue) return;

          const headers = {};
          if (message.headers) {
            for (const [k, v] of Object.entries(message.headers)) {
              headers[k] = v ? v.toString() : '';
            }
          }

          const idempotencyKey = headers.idempotencyKey || null;
          if (isDuplicate(idempotencyKey)) {
            logger.warn('[KafkaConsumer] Duplicate event detected — skipping', {
              topic, partition, idempotencyKey,
            });
            return;
          }

          let payload;
          try {
            payload = JSON.parse(rawValue);
          } catch {
            logger.warn('[KafkaConsumer] Failed to parse message value', { topic, rawValue });
            return;
          }

          logger.info('[KafkaConsumer] Event received', {
            topic,
            partition,
            offset:        message.offset,
            eventType:     headers.eventType      || topic,
            correlationId: headers.correlationId  || null,
            timestamp:     headers.timestamp      || new Date().toISOString(),
          });

          try {
            await handler({ topic, partition, offset: message.offset, payload, headers });
          } catch (err) {
            logger.error('[KafkaConsumer] Handler error — message will not be retried (committed)', {
              topic,
              partition,
              offset: message.offset,
              error: err.message,
            });
          }
        },
      });
    } catch (err) {
      logger.warn('[KafkaConsumer] Failed to start — consumer is inactive', {
        groupId,
        error: err.message,
      });
    }
  }

  async function disconnect() {
    if (!running) return;
    try {
      await consumer.disconnect();
      logger.info('[KafkaConsumer] Disconnected gracefully', { groupId });
    } catch (err) {
      logger.warn('[KafkaConsumer] Error during disconnect', { groupId, error: err.message });
    }
    running = false;
  }

  return { start, disconnect };
}

module.exports = { createConsumer };

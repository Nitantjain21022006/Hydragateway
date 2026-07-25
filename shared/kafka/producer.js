/**
 * Singleton KafkaJS producer for HydraGateway event publishing.
 * Handles broker unavailability gracefully with structured correlation-aware logging.
 * Exports connect, publish, disconnect, isConnected, and producerEvents EventEmitter for real-time SSE propagation.
 */

'use strict';

const EventEmitter = require('events');
const { Kafka, CompressionTypes, logLevel } = require('kafkajs');
const { createServiceLogger } = require('../utils/logger');

const logger = createServiceLogger('kafka-producer');

const BROKERS       = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim());
const CLIENT_ID     = process.env.KAFKA_CLIENT_ID || 'hydragateway';
const ENABLED       = process.env.KAFKA_ENABLED !== 'false';
const RETRY_MAX     = parseInt(process.env.KAFKA_PRODUCER_RETRY_MAX || '5', 10);

const producerEvents = new EventEmitter();
producerEvents.setMaxListeners(50);

let producer = null;
let connected = false;
let connectPromise = null;

function buildKafkaClient() {
  return new Kafka({
    clientId: `${CLIENT_ID}-producer`,
    brokers: BROKERS,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: RETRY_MAX,
    },
  });
}

async function connect() {
  if (!ENABLED) {
    logger.info('[KafkaProducer] Kafka is disabled via KAFKA_ENABLED=false — skipping producer init');
    return;
  }
  if (connected) return;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const kafka = buildKafkaClient();
      producer = kafka.producer({
        allowAutoTopicCreation: true,
        idempotent: false,
        maxInFlightRequests: 5,
      });

      await producer.connect();
      connected = true;
      logger.info('[KafkaProducer] Connected to Kafka brokers', { brokers: BROKERS });
    } catch (err) {
      connected = false;
      producer = null;
      logger.warn('[KafkaProducer] Failed to connect to Kafka — events will be dropped', {
        error: err.message,
        brokers: BROKERS,
      });
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

async function publish(topic, key, value, headers = {}) {
  if (!ENABLED) return;

  const eventPayload = {
    topic,
    key: key ? String(key) : null,
    eventType: value.eventType || topic,
    orderId: value.orderId || null,
    productId: value.productId || null,
    userId: value.userId || null,
    correlationId: value.correlationId || null,
    timestamp: new Date().toISOString(),
  };

  producerEvents.emit('kafka_event', eventPayload);

  if (!connected || !producer) {
    logger.warn('[KafkaProducer] Not connected — dropping event', { topic, key });
    return;
  }

  const message = {
    key:   key ? String(key) : null,
    value: JSON.stringify(value),
    headers: {
      eventType:     value.eventType     || topic,
      correlationId: value.correlationId || '',
      timestamp:     new Date().toISOString(),
      ...headers,
    },
  };

  try {
    const result = await producer.send({
      topic,
      compression: CompressionTypes.None,
      messages: [message],
    });

    const meta = result[0];
    logger.info('[KafkaProducer] Event published', {
      topic,
      partition: meta.partition,
      offset:    meta.baseOffset,
      key,
      eventType: value.eventType || topic,
      correlationId: value.correlationId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[KafkaProducer] Failed to publish event', {
      topic,
      key,
      error: err.message,
    });
  }
}

async function disconnect() {
  if (producer && connected) {
    try {
      await producer.disconnect();
      logger.info('[KafkaProducer] Disconnected gracefully');
    } catch (err) {
      logger.warn('[KafkaProducer] Error during disconnect', { error: err.message });
    } finally {
      connected = false;
      producer  = null;
    }
  }
}

function isConnected() {
  return connected;
}

module.exports = { connect, publish, disconnect, isConnected, producerEvents };

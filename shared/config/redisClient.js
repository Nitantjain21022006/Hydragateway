/**
 * shared/config/redisClient.js
 *
 * Centralised Redis connection factory used by all services.
 * Uses `ioredis` which supports automatic reconnection, pipelining,
 * and Sentinel/Cluster with zero config changes here.
 *
 * Design decision: Singleton pattern so every require() in the same
 * process reuses the same underlying TCP connection.
 */

const Redis = require('ioredis');

let client = null;

function getRedisClient() {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    // Retry strategy: exponential back-off capped at 30 s
    retryStrategy(times) {
      const delay = Math.min(times * 200, 30000);
      return delay;
    },
    // Reconnect on error (e.g. READONLY on failover)
    reconnectOnError(err) {
      return err.message.includes('READONLY');
    },
    lazyConnect: false,
  });

  client.on('connect', () => {
    console.log('[Redis] Connected');
  });

  client.on('error', (err) => {
    console.error('[Redis] Error:', err.message);
  });

  return client;
}

module.exports = { getRedisClient };

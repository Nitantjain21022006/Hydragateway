/**
 * Centralized Redis connection factory.
 * Provides a singleton ioredis client with automatic reconnection logic.
 * Exports getRedisClient.
 */

const Redis = require('ioredis');

let client = null;

function getRedisClient() {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 30000);
      return delay;
    },
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


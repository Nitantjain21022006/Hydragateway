/**
 * shared/config/dbConnect.js
 *
 * Centralised MongoDB connection utility.
 *
 * Design decisions:
 * - Single call per process; subsequent calls return cached connection.
 * - Pool size is configurable via MONGO_POOL_SIZE env var.
 * - MONGO_URI must be a valid MongoDB connection string (local or Atlas).
 *   In Docker, MONGO_URI is injected via the ${MONGO_URI} environment variable
 *   defined in docker-compose.yml – pointing to MongoDB Atlas (external, cloud).
 * - Unhandled rejection on failed initial connect shuts the process
 *   down cleanly so the container restarter (Docker / k8s) can react.
 */

const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('[DB] MONGO_URI environment variable is not set');
  }

  try {
    await mongoose.connect(uri, {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '10', 10),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('[DB] MongoDB connected:', mongoose.connection.host);

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected – attempting reconnect…');
      isConnected = false;
    });
  } catch (err) {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB, mongoose };

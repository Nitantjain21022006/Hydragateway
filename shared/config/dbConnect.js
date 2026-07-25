/**
 * Centralized MongoDB connection utility.
 * Manages database connection lifecycle and cached connection state.
 * Exports connectDB and mongoose.
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

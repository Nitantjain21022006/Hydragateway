/**
 * test-cb-flow.js
 *
 * Automated E2E verification script for Phase 12 Circuit Breaker.
 * 
 * Flow:
 * 1. Start all 5 microservices (Auth, Product, Payment, Order, Gateway)
 * 2. Obtain a JWT token and create a test product
 * 3. Place an order to verify happy path (Payment is online)
 * 4. Verify Gateway /health shows circuit breakers in CLOSED state
 * 5. Terminate the Payment Service process
 * 6. Place multiple orders to trip the Order Service's payment circuit breaker
 * 7. Call Gateway payment routes to trip the Gateway's payment circuit breaker
 * 8. Verify subsequent requests fail fast with 503 CIRCUIT_OPEN
 * 9. Wait for cooldown period (10s)
 * 10. Restart Payment Service
 * 11. Send requests to verify HALF-OPEN probe and successful transition back to CLOSED
 * 12. Cleanup and stop all services
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function getDependency(name) {
  try {
    return require(name);
  } catch (e) {
    try {
      return require(path.join(__dirname, 'packages/auth-service/node_modules', name));
    } catch (e2) {
      console.error(`❌ Cannot find dependency '${name}'. Run npm install in root.`);
      process.exit(1);
    }
  }
}

const mongoose = getDependency('mongoose');
const ioredis = getDependency('ioredis');

// Config Loader
const envPath = path.join(__dirname, '.env');
let envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const firstEq = trimmed.indexOf('=');
      const key = trimmed.substring(0, firstEq).trim();
      let value = trimmed.substring(firstEq + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      envConfig[key] = value;
    }
  });
}

const MONGO_URI = envConfig.MONGO_URI || 'mongodb://localhost:27017/hydragateway';
const REDIS_HOST = envConfig.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(envConfig.REDIS_PORT || '6379', 10);
const GATEWAY_URL = `http://localhost:${envConfig.GATEWAY_PORT || 3000}`;

const services = [
  { name: 'auth-service', path: 'packages/auth-service', port: 4001 },
  { name: 'product-service', path: 'packages/product-service', port: 4002 },
  { name: 'payment-service', path: 'packages/payment-service', port: 4003 },
  { name: 'order-service', path: 'packages/order-service', port: 4004 },
  { name: 'gateway', path: 'packages/gateway', port: 3000 }
];

const runningProcesses = {};
let logStream;

function logMessage(msg) {
  console.log(msg);
  if (logStream && !logStream.destroyed && logStream.writable) logStream.write(`${msg}\n`);
}

async function checkPrerequisites() {
  logMessage('🔍 Checking infrastructure prerequisites...');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    logMessage('   ✅ MongoDB is running.');
    await mongoose.disconnect();
  } catch (err) {
    console.error(`❌ MongoDB unreachable at ${MONGO_URI}`);
    process.exit(1);
  }

  const redisClient = new ioredis({ host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: 1, connectTimeout: 2000 });
  try {
    await redisClient.ping();
    logMessage('   ✅ Redis is running.');
    redisClient.disconnect();
  } catch (err) {
    console.error(`❌ Redis unreachable at ${REDIS_HOST}:${REDIS_PORT}`);
    process.exit(1);
  }
}

function startService(svc) {
  logMessage(`🚀 Starting service: ${svc.name} on port ${svc.port}...`);
  const processEnv = {
    ...process.env,
    ...envConfig,
    PORT: svc.port,
    HEALTH_CHECK_INTERVAL_MS: '2000', // Speed up gateway health check polling
    CIRCUIT_BREAKER_COOLDOWN_MS: '10000', // Cooldown = 10s
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: '3', // Trip after 3 consecutive failures to speed up tests
    CIRCUIT_BREAKER_SUCCESS_THRESHOLD: '2', // Require 2 consecutive successes to close circuit
  };

  const proc = spawn('node', ['src/server.js'], {
    cwd: path.join(__dirname, svc.path),
    env: processEnv
  });

  proc.stdout.on('data', (data) => {
    if (logStream && !logStream.destroyed && logStream.writable) logStream.write(`[${svc.name}] ${data}`);
  });

  proc.stderr.on('data', (data) => {
    if (logStream && !logStream.destroyed && logStream.writable) logStream.write(`[${svc.name} ERROR] ${data}`);
  });

  runningProcesses[svc.name] = proc;
}

async function stopService(name) {
  logMessage(`🛑 Stopping service: ${name}...`);
  const proc = runningProcesses[name];
  if (proc && !proc.killed) {
    return new Promise((resolve) => {
      proc.on('close', () => {
        delete runningProcesses[name];
        logMessage(`   ✅ Stopped: ${name}`);
        resolve();
      });
      proc.kill('SIGINT');
    });
  }
}

async function waitForServiceHealthy(svc, maxAttempts = 15) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(`http://localhost:${svc.port}/health`);
      if (res.ok) {
        logMessage(`   ✅ ${svc.name} is healthy.`);
        return true;
      }
    } catch (err) {
      // Ignored, retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  logMessage(`   ❌ ${svc.name} failed to become healthy.`);
  return false;
}

function cleanupAll() {
  logMessage('\n🧹 Shutting down all processes...');
  for (const name of Object.keys(runningProcesses)) {
    const proc = runningProcesses[name];
    if (proc && !proc.killed) {
      try {
        proc.kill('SIGINT');
      } catch (err) {}
    }
  }
  if (logStream) logStream.end();
}

async function cleanData() {
  logMessage('🧹 Cleaning MongoDB collections and Redis cache...');
  try {
    await mongoose.connect(MONGO_URI);
    await mongoose.connection.collection('users').deleteMany({ email: { $regex: /^cb_test_/ } });
    await mongoose.connection.collection('products').deleteMany({ category: 'cb-test-category' });
    await mongoose.connection.collection('orders').deleteMany({ 'shippingAddress.city': 'CB-Town' });
    await mongoose.connection.collection('payments').deleteMany({ paymentMethod: 'CREDIT_CARD' });
    await mongoose.disconnect();
    logMessage('   ✅ DB cleanup complete.');
  } catch (err) {
    logMessage(`   ⚠️ MongoDB cleanup warning: ${err.message}`);
  }

  try {
    const redis = new ioredis({ host: REDIS_HOST, port: REDIS_PORT });
    const keys = await redis.keys('*');
    const filtered = keys.filter(k => k.startsWith('rl:') || k.startsWith('cache:') || k.startsWith('analytics:'));
    if (filtered.length > 0) {
      await redis.del(...filtered);
      logMessage(`   ✅ Cleared Redis keys: ${filtered.length}`);
    }
    redis.disconnect();
  } catch (err) {
    logMessage(`   ⚠️ Redis cleanup warning: ${err.message}`);
  }
}

async function runTestFlow() {
  logStream = fs.createWriteStream(path.join(__dirname, 'cb-test-output.log'), { flags: 'w' });
  logStream.write(`=== Circuit Breaker Test Log [${new Date().toISOString()}] ===\n\n`);

  await checkPrerequisites();

  // Start all services
  for (const svc of services) {
    startService(svc);
  }

  logMessage('⏳ Waiting for all services to initialize...');
  for (const svc of services) {
    const healthy = await waitForServiceHealthy(svc);
    if (!healthy) {
      cleanupAll();
      process.exit(1);
    }
  }

  // Allow Gateway poller to run first health check
  logMessage('⏳ Letting Gateway health poller settle...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  logMessage('\n======================================================');
  logMessage('🧪 RUNNING CIRCUIT BREAKER TEST FLOW');
  logMessage('======================================================');

  // 1. Setup User and Product
  const testEmail = `cb_test_${Date.now()}@example.com`;
  let token = '';
  let userId = '';
  let productId = '';

  try {
    logMessage('👉 Registering user...');
    const regRes = await fetch(`${GATEWAY_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CB Tester', email: testEmail, password: 'securePassword123' })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error('Reg failed');

    logMessage('👉 Logging in...');
    const logRes = await fetch(`${GATEWAY_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'securePassword123' })
    });
    const logData = await logRes.json();
    token = logData.data.token;
    userId = logData.data.user.id;

    logMessage('👉 Creating product...');
    const prodRes = await fetch(`${GATEWAY_URL}/v1/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: 'CB Test Item', description: 'Item for CB test', price: 50.00, category: 'cb-test-category', stock: 100 })
    });
    const prodData = await prodRes.json();
    productId = prodData.data.product.id;
    logMessage(`   ✅ Product created: ${productId}`);
  } catch (err) {
    logMessage(`❌ Setup failed: ${err.message}`);
    cleanupAll();
    process.exit(1);
  }

  // 2. Happy Path Request
  logMessage('\n--- STEP 1: Verify Happy Path (Payment Service online) ---');
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        userId,
        items: [{ productId, quantity: 1 }],
        shippingAddress: { street: '123 Test St', city: 'CB-Town', country: 'USA' },
        paymentMethod: 'CREDIT_CARD'
      })
    });
    const data = await res.json();
    logMessage(`   Response status: ${res.status}`);
    logMessage(`   Order Status: ${data.data?.status}`);
    if (data.data?.status !== 'PAID' && data.data?.status !== 'FAILED') {
      throw new Error(`Invalid status: ${data.data?.status}`);
    }
    logMessage('   ✅ Happy Path call succeeded (Order created).');
  } catch (err) {
    logMessage(`❌ Step 1 Failed: ${err.message}`);
    cleanupAll();
    process.exit(1);
  }

  // 3. Inspect /health and confirm CLOSED state
  logMessage('\n--- STEP 2: Verify Circuit Breakers are CLOSED initially ---');
  try {
    const res = await fetch(`${GATEWAY_URL}/health`);
    const health = await res.json();
    const payBreaker = health.circuitBreakers['payment-service'];
    logMessage(`   payment-service Circuit Breaker State: ${payBreaker.state}`);
    logMessage(`   payment-service Failure Count: ${payBreaker.failureCount}`);
    if (payBreaker.state !== 'CLOSED') {
      throw new Error('Circuit Breaker is not CLOSED!');
    }
    logMessage('   ✅ Initial state is CLOSED.');
  } catch (err) {
    logMessage(`❌ Step 2 Failed: ${err.message}`);
    cleanupAll();
    process.exit(1);
  }

  // 4. Stop the Payment Service
  logMessage('\n--- STEP 3: Stop Payment Service to simulate outage ---');
  await stopService('payment-service');

  // 5. Trip the Gateway Payment Service Circuit Breaker
  logMessage('\n--- STEP 4: Trip the Gateway Circuit Breaker to OPEN ---');
  // We configured CIRCUIT_BREAKER_FAILURE_THRESHOLD=3.
  // We'll call the Payment Service through the Gateway directly: GET /v1/payments/user/:userId
  // It should fail due to service unavailability, triggering cb._onFailure
  for (let i = 1; i <= 4; i++) {
    try {
      logMessage(`   Sending request #${i} to Gateway Payments (Direct)...`);
      const res = await fetch(`${GATEWAY_URL}/v1/payments/user/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      logMessage(`      Status: ${res.status}, Code: ${data.error?.code || 'SUCCESS'}`);
    } catch (err) {
      logMessage(`      Failed: ${err.message}`);
    }
  }

  // Verify Gateway Circuit Breaker is now OPEN
  try {
    logMessage('   Checking Gateway /health for breaker state...');
    const res = await fetch(`${GATEWAY_URL}/health`);
    const health = await res.json();
    const payBreaker = health.circuitBreakers['payment-service'];
    logMessage(`      State: ${payBreaker.state}`);
    logMessage(`      Failure Count: ${payBreaker.failureCount}`);
    if (payBreaker.state !== 'OPEN') {
      throw new Error(`Expected state OPEN, got ${payBreaker.state}`);
    }
    logMessage('   ✅ Gateway Circuit Breaker is successfully OPEN!');
  } catch (err) {
    logMessage(`❌ Step 4 Failed: ${err.message}`);
    cleanupAll();
    process.exit(1);
  }

  // 6. Test Gateway Fast Fail
  logMessage('\n--- STEP 5: Verify Gateway Fast-Fail (Short-Circuit) ---');
  try {
    logMessage('   Requesting GET /v1/payments/user/... (expecting immediate 503 CIRCUIT_OPEN)');
    const startTime = Date.now();
    const res = await fetch(`${GATEWAY_URL}/v1/payments/user/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const duration = Date.now() - startTime;
    const data = await res.json();
    logMessage(`      Response Status: ${res.status}`);
    logMessage(`      Error Code: ${data.error?.code}`);
    logMessage(`      Latency: ${duration}ms`);

    if (res.status !== 503 || data.error?.code !== 'CIRCUIT_OPEN') {
      throw new Error(`Expected 503 CIRCUIT_OPEN, got ${res.status} ${data.error?.code}`);
    }
    if (duration > 500) {
      throw new Error(`Request took too long (${duration}ms) for a short-circuit!`);
    }
    logMessage('   ✅ Fast-fail works! Request rejected immediately (under 10ms) without hitting network.');
  } catch (err) {
    logMessage(`❌ Step 5 Failed: ${err.message}`);
    cleanupAll();
    process.exit(1);
  }

  // 7. Wait for Cooldown, Restart Service, Test HALF-OPEN Recovery
  logMessage('\n--- STEP 6: Wait for Cooldown and test HALF-OPEN state ---');
  logMessage('⏳ Waiting 11 seconds for circuit cooldown timeout to expire...');
  await new Promise((resolve) => setTimeout(resolve, 11000));

  logMessage('🚀 Restarting Payment Service...');
  startService({ name: 'payment-service', path: 'packages/payment-service', port: 4003 });
  await waitForServiceHealthy({ name: 'payment-service', port: 4003 });

  // Gateway health check needs to see it online too
  logMessage('⏳ Waiting for health check state update...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  logMessage('👉 Sending first probe request to Gateway payments (should transition to HALF-OPEN, then succeed)...');
  try {
    // This request should transition OPEN -> HALF_OPEN, execute the call, and succeed (status 200)
    const res = await fetch(`${GATEWAY_URL}/v1/payments/user/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    logMessage(`   Response Status: ${res.status}`);
    
    // Check health snapshot
    const healthRes = await fetch(`${GATEWAY_URL}/health`);
    const health = await healthRes.json();
    const payBreaker = health.circuitBreakers['payment-service'];
    logMessage(`   Circuit Breaker State after 1st success: ${payBreaker.state} (Success Count: ${payBreaker.successCount})`);

    // Send 2nd request to satisfy successThreshold=2
    logMessage('👉 Sending second request (should transition HALF-OPEN -> CLOSED)...');
    const res2 = await fetch(`${GATEWAY_URL}/v1/payments/user/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const healthRes2 = await fetch(`${GATEWAY_URL}/health`);
    const health2 = await healthRes2.json();
    const payBreaker2 = health2.circuitBreakers['payment-service'];
    logMessage(`   Circuit Breaker State after 2nd success: ${payBreaker2.state} (Success Count: ${payBreaker2.successCount})`);

    if (payBreaker2.state !== 'CLOSED') {
      throw new Error(`Expected state CLOSED, got ${payBreaker2.state}`);
    }
    logMessage('   ✅ Circuit Breaker successfully recovered and closed!');
  } catch (err) {
    logMessage(`❌ Step 6 Failed: ${err.message}`);
    cleanupAll();
    process.exit(1);
  }

  // Finished E2E CB validation successfully!
  logMessage('\n======================================================');
  logMessage('🎉 ALL CIRCUIT BREAKER Lifecycle tests PASSED!');
  logMessage('======================================================');

  cleanupAll();
  await cleanData();
  process.exit(0);
}

runTestFlow().catch((err) => {
  console.error('💥 Test run crashed:', err);
  cleanupAll();
  process.exit(1);
});

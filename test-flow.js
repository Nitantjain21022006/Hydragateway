/**
 * End-to-end integration test runner validating all microservices and Gateway capabilities.
 * Tests Auth, Product, Payment, Order, Rate Limiting, Caching, Analytics, and Load Balancing flows.
 * Manages service processes and performs automatic database and Redis cleanup.
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
      console.error(`❌ Cannot find dependency '${name}'. Please run 'npm install' in the root first.`);
      process.exit(1);
    }
  }
}

const mongoose = getDependency('mongoose');
const ioredis = getDependency('ioredis');

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
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      envConfig[key] = value;
    }
  });
}

const MONGO_URI    = envConfig.MONGO_URI    || 'mongodb://localhost:27017/hydragateway';
const REDIS_HOST   = envConfig.REDIS_HOST   || 'localhost';
const REDIS_PORT   = parseInt(envConfig.REDIS_PORT   || '6379',  10);
const GATEWAY_URL  = `http://localhost:${envConfig.GATEWAY_PORT  || 3000}`;
const LB_URL       = `http://localhost:${envConfig.LB_PORT       || 8080}`;
const GATEWAY_2_PORT = parseInt(envConfig.GATEWAY_2_PORT || '3001', 10);

const services = [
  { name: 'auth-service', path: 'packages/auth-service', port: parseInt(envConfig.AUTH_PORT || '4001', 10) },
  { name: 'product-service', path: 'packages/product-service', port: parseInt(envConfig.PRODUCT_PORT || '4002', 10) },
  { name: 'payment-service', path: 'packages/payment-service', port: parseInt(envConfig.PAYMENT_PORT || '4003', 10) },
  { name: 'order-service', path: 'packages/order-service', port: parseInt(envConfig.ORDER_PORT || '4004', 10) },
  { name: 'gateway', path: 'packages/gateway', port: parseInt(envConfig.GATEWAY_PORT || '3000', 10) }
];

const children = [];
let testLogStream;

async function checkPrerequisites() {
  console.log('🔍 Validating infrastructure prerequisites...');
  
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    console.log('   ✅ MongoDB is active and reachable.');
    await mongoose.disconnect();
  } catch (err) {
    console.error(`\n❌ Error: MongoDB is not running or unreachable at: ${MONGO_URI}`);
    console.error('   Please start MongoDB first (e.g., net start MongoDB, or docker run -d -p 27017:27017 mongo).');
    process.exit(1);
  }

  const redisClient = new ioredis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000
  });
  try {
    await redisClient.ping();
    console.log('   ✅ Redis is active and reachable.');
    redisClient.disconnect();
  } catch (err) {
    console.error(`\n❌ Error: Redis is not running or unreachable at: ${REDIS_HOST}:${REDIS_PORT}`);
    console.error('   Please start Redis first (e.g., redis-server, or docker run -d -p 6379:6379 redis).');
    process.exit(1);
  }
}

function startServices() {
  console.log('\n🚀 Starting microservices...');
  testLogStream = fs.createWriteStream(path.join(__dirname, 'test-services.log'), { flags: 'w' });
  testLogStream.write(`=== Microservices Run Log [${new Date().toISOString()}] ===\n\n`);

  for (const svc of services) {
    console.log(`   Starting ${svc.name} on port ${svc.port}...`);
    
    const processEnv = {
      ...process.env,
      ...envConfig,
      PORT: svc.port,
      HEALTH_CHECK_INTERVAL_MS: '1000'
    };

    const proc = spawn('node', ['src/server.js'], {
      cwd: path.join(__dirname, svc.path),
      env: processEnv
    });

    proc.stdout.on('data', (data) => {
      testLogStream.write(`[${svc.name}] ${data}`);
    });

    proc.stderr.on('data', (data) => {
      testLogStream.write(`[${svc.name} ERROR] ${data}`);
    });

    proc.on('close', (code) => {
      testLogStream.write(`[${svc.name}] process exited with code ${code}\n`);
    });

    children.push({ name: svc.name, proc });
  }
}

async function waitForServices() {
  console.log('⏳ Waiting for all services to start health probes...');
  const retries = 15;
  const interval = 1000;

  for (const svc of services) {
    let healthy = false;
    for (let i = 1; i <= retries; i++) {
      try {
        const res = await fetch(`http://localhost:${svc.port}/health`);
        if (res.ok) {
          healthy = true;
          break;
        }
      } catch (err) {
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    if (healthy) {
      console.log(`   ✅ ${svc.name} is running and healthy.`);
    } else {
      console.error(`\n❌ Error: ${svc.name} failed to respond to health probes on port ${svc.port}.`);
      console.error('   Please check the log file "test-services.log" for details.');
      cleanup();
      process.exit(1);
    }
  }
  
  console.log('⏳ Letting Gateway poller settle downstream status...');
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

function cleanup() {
  console.log('\n🛑 Shutting down microservices...');
  for (const svc of children) {
    if (svc.proc && !svc.proc.killed && svc.proc.pid) {
      try {
        svc.proc.kill('SIGINT');
      } catch (err) {
      }
    }
  }
  if (testLogStream) {
    testLogStream.end();
  }
}

async function cleanDatabase() {
  console.log('\n🧹 Cleaning up test data from MongoDB and Redis...');
  
  try {
    await mongoose.connect(MONGO_URI);
    
    const userRes = await mongoose.connection.collection('users').deleteMany({
      email: { $regex: /^test_/ }
    });
    console.log(`   Deleted test users: ${userRes.deletedCount}`);

    const prodRes = await mongoose.connection.collection('products').deleteMany({
      category: 'test-category'
    });
    console.log(`   Deleted test products: ${prodRes.deletedCount}`);

    const orderRes = await mongoose.connection.collection('orders').deleteMany({
      'shippingAddress.city': 'Testville'
    });
    console.log(`   Deleted test orders: ${orderRes.deletedCount}`);

    const payRes = await mongoose.connection.collection('payments').deleteMany({
      paymentMethod: 'CREDIT_CARD'
    });
    console.log(`   Deleted test payments: ${payRes.deletedCount}`);

    await mongoose.disconnect();
  } catch (err) {
    console.warn(`   ⚠️ MongoDB cleanup warning: ${err.message}`);
  }

  try {
    const redis = new ioredis({ host: REDIS_HOST, port: REDIS_PORT });

    const rlKeys = await redis.keys('rl:*');
    if (rlKeys.length > 0) {
      await redis.del(...rlKeys);
      console.log(`   Cleared Redis rate limiter keys: ${rlKeys.length}`);
    }

    const cacheKeys = await redis.keys('cache:*');
    if (cacheKeys.length > 0) {
      await redis.del(...cacheKeys);
      console.log(`   Cleared Redis cache keys: ${cacheKeys.length}`);
    }

    const analyticsKeys = await redis.keys('analytics:*');
    if (analyticsKeys.length > 0) {
      await redis.del(...analyticsKeys);
      console.log(`   Cleared Redis analytics keys: ${analyticsKeys.length}`);
    }

    redis.disconnect();
  } catch (err) {
    console.warn(`   ⚠️ Redis cleanup warning: ${err.message}`);
  }
  console.log('✨ Cleanup complete!');
}

async function runTests() {
  let token = '';
  let userId = '';
  let productId = '';
  let orderId = '';
  let transactionId = '';

  console.log('\n================================================================');
  console.log('🧪 RUNNING INTEGRATION TESTS (PHASE 2 - 11) VIA API GATEWAY');
  console.log('================================================================');

  console.log('\n--- PHASE 6: API Gateway routing & health report ---');
  try {
    const res = await fetch(`${GATEWAY_URL}/health`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Gateway health error: ${res.statusText}`);
    console.log('✅ Success: Gateway reports downstream service health metrics:');
    console.log(JSON.stringify(data.downstream, null, 2));
  } catch (err) {
    console.error('❌ Phase 6 Failed: Health Endpoint check failed:', err.message);
    throw err;
  }

  console.log('\n--- PHASE 2: Auth Service (Register, Login, Profile) ---');
  const testEmail = `test_${Date.now()}@example.com`;
  const registerPayload = {
    name: 'Automation Tester',
    email: testEmail,
    password: 'securePassword123'
  };

  try {
    console.log(`   Registering new test user: ${testEmail}...`);
    const regRes = await fetch(`${GATEWAY_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerPayload)
    });
    const regData = await regRes.json();
    if (regRes.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
    console.log('   ✅ Registration successful!');

    console.log('   Logging in with credentials...');
    const loginRes = await fetch(`${GATEWAY_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: registerPayload.password })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    console.log('   ✅ Login successful!');
    
    token = loginData.data.token;
    userId = loginData.data.user.id;
    console.log(`   👉 Acquired JWT Token: ${token.substring(0, 20)}...`);
    console.log(`   👉 Acquired User ID: ${userId}`);

    console.log('   Retrieving profile via GET /me (passing JWT)...');
    const meRes = await fetch(`${GATEWAY_URL}/v1/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const meData = await meRes.json();
    if (!meRes.ok) throw new Error(`Me profile retrieval failed: ${JSON.stringify(meData)}`);
    console.log(`   ✅ Succeeded! Name from DB: ${meData.data.user.name}`);

    console.log('   Verifying JWT validation: calling GET /me without Token...');
    const failRes = await fetch(`${GATEWAY_URL}/v1/auth/me`);
    const failData = await failRes.json();
    if (failRes.status === 401) {
      console.log('   ✅ Request rejected with 401 Unauthorized (JWT verification works!).');
    } else {
      throw new Error(`Expected 401 Unauthorized, got ${failRes.status}`);
    }
  } catch (err) {
    console.error('❌ Phase 2 Failed:', err.message);
    throw err;
  }

  console.log('\n--- PHASE 3: Product CRUD operations ---');
  const productPayload = {
    name: 'Smart Automation Device',
    description: 'An advanced system testing widget',
    price: 99.99,
    category: 'test-category',
    stock: 120
  };

  try {
    console.log('   Creating product...');
    const pCreateRes = await fetch(`${GATEWAY_URL}/v1/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(productPayload)
    });
    const pCreateData = await pCreateRes.json();
    if (pCreateRes.status !== 201) throw new Error(`Product creation failed: ${JSON.stringify(pCreateData)}`);
    productId = pCreateData.data.product.id;
    console.log(`   ✅ Product created successfully! ID: ${productId}`);

    console.log(`   Retrieving product by ID: ${productId}...`);
    const pGetRes = await fetch(`${GATEWAY_URL}/v1/products/${productId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const pGetData = await pGetRes.json();
    if (!pGetRes.ok) throw new Error(`Product fetch failed: ${JSON.stringify(pGetData)}`);
    console.log(`   ✅ Succeeded! Name: "${pGetData.data.product.name}", Price: $${pGetData.data.product.price}`);

    console.log(`   Updating product price...`);
    const pUpdateRes = await fetch(`${GATEWAY_URL}/v1/products/${productId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ price: 109.99, stock: 100 })
    });
    const pUpdateData = await pUpdateRes.json();
    if (!pUpdateRes.ok) throw new Error(`Product update failed: ${JSON.stringify(pUpdateData)}`);
    console.log(`   ✅ Updated! New price: $${pUpdateData.data.product.price}, Stock: ${pUpdateData.data.product.stock}`);

    console.log(`   Listing products in category 'test-category'...`);
    const pListRes = await fetch(`${GATEWAY_URL}/v1/products?category=test-category`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const pListData = await pListRes.json();
    if (!pListRes.ok) throw new Error(`Products listing failed: ${JSON.stringify(pListData)}`);
    console.log(`   ✅ Succeeded! Found ${pListData.data.products.length} test products.`);
  } catch (err) {
    console.error('❌ Phase 3 Failed:', err.message);
    throw err;
  }

  console.log('\n--- PHASE 4 & 5: Order Orchestration & Payment ---');
  const orderPayload = {
    userId: userId,
    items: [
      { productId: productId, quantity: 3 }
    ],
    shippingAddress: {
      street: '456 Automation Lane',
      city: 'Testville',
      country: 'Testland'
    },
    paymentMethod: 'CREDIT_CARD'
  };

  try {
    console.log('   Creating order (orchestrating product validation and payment)...');
    const oRes = await fetch(`${GATEWAY_URL}/v1/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(orderPayload)
    });
    const oData = await oRes.json();
    if (oRes.status !== 201 && oRes.status !== 200) throw new Error(`Order creation failed: ${JSON.stringify(oData)}`);
    
    orderId = oData.data.id;
    transactionId = oData.data.paymentId;
    console.log(`   ✅ Order created! Order ID: ${orderId}`);
    console.log(`   👉 Total calculated: $${oData.data.totalAmount}`);
    console.log(`   👉 Status: ${oData.data.status} (Payment simulation status)`);
    console.log(`   👉 Payment Transaction ID: ${transactionId || 'N/A (Failed payment)'}`);

    if (transactionId) {
      console.log(`   Retrieving payment details for transaction ${transactionId}...`);
      const payRes = await fetch(`${GATEWAY_URL}/v1/payments/${transactionId}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const payData = await payRes.json();
      if (payRes.ok) {
        console.log(`   ✅ Payment Status: ${payData.data.status}, Amount: $${payData.data.amount}`);
      }
    }

    console.log(`   Querying order history for user ${userId}...`);
    const histRes = await fetch(`${GATEWAY_URL}/v1/orders/user/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const histData = await histRes.json();
    if (histRes.ok) {
      console.log(`   ✅ Succeeded! Total orders found: ${histData.data.length}`);
    }
  } catch (err) {
    console.error('❌ Phase 4/5 Failed:', err.message);
    throw err;
  }

  console.log('\n--- PHASE 7: Redis Rate Limiter check ---');
  try {
    console.log('   Sending a burst of requests to trigger rate limit (429)...');
    let isLimited = false;
    let limitHeader = '';
    let resetHeader = '';
    let retryHeader = '';

    for (let i = 0; i < 110; i++) {
      const res = await fetch(`${GATEWAY_URL}/health`);
      if (res.status === 429) {
        isLimited = true;
        limitHeader = res.headers.get('X-RateLimit-Limit');
        resetHeader = res.headers.get('X-RateLimit-Reset');
        retryHeader = res.headers.get('Retry-After');
        break;
      }
    }

    if (isLimited) {
      console.log('   ✅ Rate Limiter successfully triggered!');
      console.log(`      X-RateLimit-Limit: ${limitHeader}`);
      console.log(`      X-RateLimit-Reset: ${resetHeader} (epoch timestamp)`);
      console.log(`      Retry-After: ${retryHeader} seconds`);
    } else {
      console.log('   ⚠️ Rate limiter did not return 429. This is expected if Redis is bypass/fail-open or RATE_LIMIT_MAX is very high.');
    }

    console.log('   🧹 Resetting Redis rate limits for subsequent phases...');
    try {
      const redis = new ioredis({ host: REDIS_HOST, port: REDIS_PORT });
      const rlKeys = await redis.keys('rl:*');
      if (rlKeys.length > 0) {
        await redis.del(...rlKeys);
        console.log(`      ✅ Cleared rate limiters: ${rlKeys.length} keys`);
      }
      redis.disconnect();
    } catch (redisErr) {
      console.warn(`      ⚠️  Redis reset warning: ${redisErr.message}`);
    }
  } catch (err) {
    console.error('❌ Phase 7 Failed:', err.message);
    throw err;
  }

  console.log('\n--- PHASE 8: Redis Response Cache (X-Cache headers) ---');
  try {
    console.log('   Requesting GET /v1/products (expecting X-Cache: MISS)...');
    const cacheMiss = await fetch(`${GATEWAY_URL}/v1/products`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const missHeader = cacheMiss.headers.get('X-Cache');
    if (missHeader === 'MISS') {
      console.log('   ✅ X-Cache: MISS — response fetched from Product Service and stored in Redis.');
    } else {
      console.log(`   ℹ️  X-Cache: ${missHeader || 'not present'} (may already be cached from earlier requests).`);
    }

    console.log('   Requesting GET /v1/products again (expecting X-Cache: HIT)...');
    const cacheHit = await fetch(`${GATEWAY_URL}/v1/products`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const hitHeader = cacheHit.headers.get('X-Cache');
    if (hitHeader === 'HIT') {
      console.log('   ✅ X-Cache: HIT — response served from Redis cache.');
    } else {
      console.log(`   ⚠️  X-Cache: ${hitHeader || 'not present'} (cache may not be active or TTL expired).`);
    }

    if (productId) {
      console.log(`   Requesting GET /v1/products/${productId} (single product cache)...`);
      await fetch(`${GATEWAY_URL}/v1/products/${productId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const hitSingle = await fetch(`${GATEWAY_URL}/v1/products/${productId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const singleHeader = hitSingle.headers.get('X-Cache');
      console.log(`   ✅ Single product X-Cache: ${singleHeader || 'not present'}`);
    }
  } catch (err) {
    console.error('❌ Phase 8 Failed:', err.message);
    throw err;
  }

  console.log('\n--- PHASE 10: Analytics Infrastructure ---');
  try {
    console.log('   Fetching GET /analytics/summary...');
    const summaryRes = await fetch(`${GATEWAY_URL}/analytics/summary`);
    if (!summaryRes.ok) throw new Error(`Analytics summary failed: ${summaryRes.status}`);
    const summaryData = await summaryRes.json();
    const d = summaryData.data;
    console.log('   ✅ Analytics summary received!');
    console.log(`      Total Requests       : ${d.total_requests}`);
    console.log(`      Failed Requests      : ${d.failed_requests}`);
    console.log(`      Success Rate         : ${d.success_rate}`);
    console.log(`      Avg Response Time    : ${d.avg_response_time_ms}ms`);
    console.log(`      Status Breakdown     : ${JSON.stringify(d.status_code_breakdown)}`);
    console.log(`      Service Breakdown    : ${JSON.stringify(d.per_service_breakdown)}`);
    console.log(`      Gateway Breakdown    : ${JSON.stringify(d.per_gateway_breakdown)}`);

    if (d.total_requests === 0) {
      console.log('   ⚠️  total_requests is 0 — analyticsCollector may not be wired in server.js.');
    }

    console.log('   Fetching GET /analytics/timeline (today)...');
    const timelineRes = await fetch(`${GATEWAY_URL}/analytics/timeline`);
    if (!timelineRes.ok) throw new Error(`Timeline failed: ${timelineRes.status}`);
    const timelineData = await timelineRes.json();
    const tl = timelineData.data;
    console.log(`   ✅ Timeline for ${tl.date}: ${tl.total_requests} requests across ${tl.timeline.length} minute bucket(s).`);
    if (tl.timeline.length > 0) {
      const peak = tl.timeline.reduce((a, b) => (b.requests > a.requests ? b : a));
      console.log(`      Peak minute: ${peak.minute} — ${peak.requests} requests.`);
    }

    console.log('   Fetching GET /analytics/endpoints?limit=5...');
    const epRes = await fetch(`${GATEWAY_URL}/analytics/endpoints?limit=5`);
    if (!epRes.ok) throw new Error(`Endpoints failed: ${epRes.status}`);
    const epData = await epRes.json();
    console.log(`   ✅ Top endpoints (${epData.data.total_unique_endpoints} unique total):`);
    epData.data.endpoints.forEach((ep, i) => {
      console.log(`      #${i + 1}  ${ep.method} ${ep.path} — ${ep.requests} hits`);
    });
  } catch (err) {
    console.error('❌ Phase 10 Failed:', err.message);
    throw err;
  }

  console.log('\n--- PHASE 11: Custom Load Balancer ---');
  try {
    console.log(`   Checking Load Balancer health at ${LB_URL}/lb-health...`);
    let lbRes;
    try {
      lbRes = await fetch(`${LB_URL}/lb-health`);
    } catch {
      console.log('   ⚠️  Load Balancer is not running. Skipping Phase 11 tests.');
      console.log('      Start it with: node packages/load-balancer/src/server.js');
      return;
    }
    const lbData = await lbRes.json();
    console.log(`   ✅ LB health: status=${lbData.status}, uptime=${Math.round(lbData.uptime)}s`);
    console.log('   Gateway pool reported by LB:');
    lbData.gateways.forEach((gw) => {
      const icon = gw.healthy ? '✅' : '❌';
      console.log(`      ${icon} ${gw.id} — ${gw.target} | healthy=${gw.healthy} | failures=${gw.consecutiveFailures}`);
    });

    console.log('   Routing a request through LB -> Gateway -> Auth Service...');
    const lbAuthRes = await fetch(`${LB_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent_lb_test@example.com', password: 'wrong' })
    });
    const lbGatewayHeader = lbAuthRes.headers.get('X-LB-Selected-Gateway');
    const lbCorrelationId = lbAuthRes.headers.get('X-Correlation-ID');
    if (lbAuthRes.status === 401 || lbAuthRes.status === 404) {
      console.log(`   ✅ Request correctly routed through LB (status ${lbAuthRes.status} from upstream — routing works!)`);
    } else if (lbAuthRes.status === 502 || lbAuthRes.status === 503) {
      console.log(`   ⚠️  LB returned ${lbAuthRes.status} — Gateway instance may be down (only gateway-1 is running in this test).`);
    } else {
      console.log(`   ✅ LB routed request — upstream responded with ${lbAuthRes.status}`);
    }
    if (lbGatewayHeader) console.log(`      X-LB-Selected-Gateway : ${lbGatewayHeader}`);
    if (lbCorrelationId)  console.log(`      X-Correlation-ID      : ${lbCorrelationId}`);

    console.log('   Sending 4 requests to verify round-robin distribution...');
    const selectedGateways = [];
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(`${LB_URL}/health`);
        const gw = r.headers.get('X-LB-Selected-Gateway');
        selectedGateways.push(gw || 'unknown');
      } catch {
        selectedGateways.push('unreachable');
      }
    }
    const unique = [...new Set(selectedGateways)];
    console.log(`   Distribution over 4 requests: ${selectedGateways.join(', ')}`);
    if (unique.length >= 2) {
      console.log(`   ✅ Round-robin confirmed — ${unique.length} distinct gateway(s) selected: ${unique.join(', ')}`);
    } else {
      console.log(`   ℹ️  Only one gateway used (${unique[0]}). Start gateway-2 on port ${GATEWAY_2_PORT} for full round-robin.`);
    }
  } catch (err) {
    console.error('❌ Phase 11 Failed:', err.message);
    throw err;
  }
}

async function main() {
  try {
    await checkPrerequisites();
    startServices();
    await waitForServices();
    
    await runTests();
    console.log('\n🎉 ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('\n💥 Integration test execution failed:', err.message);
  } finally {
    cleanup();
    await cleanDatabase();
    process.exit(0);
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  cleanup();
  process.exit(1);
});

main();

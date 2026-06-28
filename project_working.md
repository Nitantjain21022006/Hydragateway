# 🛠️ HydraGateway – System Walkthrough and Operation Guide

This guide is designed to help you understand the architecture, end-to-end flow, database structures, and testing procedures for **HydraGateway**. It will prepare you to run, test, and explain the entire project from scratch.

---

## 🏛️ 1. High-Level Architecture Overview

HydraGateway is a production-inspired, microservices-based backend platform consisting of:
*   **API Gateway (Edge Layer)**: The single entry point for all clients. It handles cross-cutting concerns: logging, authentication, rate limiting, request caching, health monitoring, and proxy routing.
*   **Microservices (Business Logic Layer)**:
    1.  **Auth Service**: Handles registration, login, token generation, and validation.
    2.  **Product Service**: Manages inventory catalog with caching and cache invalidation.
    3.  **Payment Service**: Simulates and logs credit card/payment processing.
    4.  **Order Service**: Orchestrates orders by calling Product Service (to validate price) and Payment Service (to charge the user).
*   **In-Memory Cache (Redis)**: Used for distributed rate limiting and response caching of product queries.
*   **Database (MongoDB)**: Used by each service to persist business models in isolation.
*   **Shared Infrastructure Library**: Common code (`shared/`) loaded by all services to ensure dry config, standardized errors, structured Winston logging, and a circuit breaker state machine.

### Request Flow Topology
```
[Client]
   │
   ▼ (HTTP port 3000)
[API Gateway]
   ├── correlationId (generates X-Correlation-ID)
   ├── requestLogger (Winston stream)
   ├── jwtAuth (verify token locally)
   ├── rateLimiter (Redis-based check)
   ├── cacheMiddleware (GET products: Redis Hit/Miss)
   └── proxyRouter (http-proxy-middleware)
         │
         ├───► Auth Service (port 4001)   ────► MongoDB (hydragateway.users)
         ├───► Product Service (port 4002) ────► MongoDB (hydragateway.products)
         ├───► Payment Service (port 4003) ────► MongoDB (hydragateway.payments)
         └───► Order Service (port 4004)   ────► MongoDB (hydragateway.orders)
                 │ (internal call)
                 ├───► Product Service (validate price)
                 └───► Payment Service (charge card)
```

---

## 🔗 2. Detailed Request & Verification Flows

### 🔐 Register & Login Flow
1.  **Request**: The client sends a `POST /v1/auth/register` or `POST /v1/auth/login` to the Gateway (port `3000`).
2.  **Bypass**: The Gateway identifies these as public paths via the [serviceRegistry.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/config/serviceRegistry.js) and bypasses the JWT verification middleware.
3.  **Proxying**: The Gateway proxies the body directly to the **Auth Service** (port `4001`).
4.  **Hashing / Token Creation**:
    *   For *registration*, the Auth Service validates fields using `express-validator`, hashes the password via `bcryptjs`, saves the user to MongoDB, and responds with a JWT token.
    *   For *login*, the Auth Service fetches the user's record from MongoDB (selecting the password field), compares hashes, updates the `lastLoginAt` timestamp, signs a JWT (using HMAC SHA256 with the shared `JWT_SECRET`), and returns it.
5.  **Output**: The client receives the JWT token, which must be attached as a `Bearer <token>` in the `Authorization` header for all subsequent protected requests.

### 🛒 Order Orchestration Flow
When a client places an order, a chain of synchronous inter-service calls is executed:
1.  **Auth Check**: The client calls `POST /v1/orders` with the `Authorization` header. The Gateway validates the JWT locally, extracts the payload (`userId`, `role`), and injects `X-User-Id` and `X-User-Role` headers before proxying.
2.  **Orchestrator Boot**: The **Order Service** (port `4004`) receives the request.
3.  **Product Verification**:
    *   For each item in the order, the Order Service makes an internal HTTP call to the **Product Service** (`GET /v1/products/:id`) using the internal authorization header `X-Internal-Secret`.
    *   The Product Service fetches the product from MongoDB, checks if `isActive` is `true`, and returns the product details.
    *   The Order Service calculates the total cost using prices fetched from the Product Service, preventing users from tampering with prices in the request payload.
4.  **Pending Save**: The Order Service writes the order to MongoDB in a `PENDING` state to guarantee that the record is stored before transaction processing occurs.
5.  **Payment Initiation**:
    *   The Order Service makes an internal HTTP request (`POST /v1/payments`) to the **Payment Service** (port `4003`) with the amount, user ID, and payment method.
    *   The Payment Service performs a simulation (90% success probability, with a 1-second timeout delay simulating banking processing) and saves the outcome as a `Payment` document with a unique UUID `transactionId`.
    *   The Payment Service returns the status (`COMPLETED` or `FAILED`) and `transactionId`.
6.  **State Settlement**:
    *   If the payment succeeded, the Order Service updates the order state in MongoDB to `PAID` and registers the transaction ID.
    *   If the payment failed, the order is updated to `FAILED`.
7.  **Response**: The final response is returned to the client through the Gateway.

### ⚡ Redis Response Caching & Invalidation
To minimize inter-service overhead and lower response times, caching is implemented at the Gateway level for product reads:
1.  **Cache Lookup**: When a client requests product list `GET /v1/products` or product details `GET /v1/products/:id`, the Gateway's [cacheMiddleware.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/middleware/cacheMiddleware.js) checks Redis for the key `cache:products:all` or `cache:products:{id}`.
2.  **Cache Hit**: If the key exists, the Gateway returns the cached JSON string directly with the custom header `X-Cache: HIT`. The request never hits the downstream Product Service.
3.  **Cache Miss**: If it's a miss, the request goes through to the Product Service. Once the Product Service returns the `200 OK` response, the Gateway intercepts the payload, writes it to Redis with a Time-To-Live (TTL) of 60 seconds (or configured via `CACHE_TTL_SECONDS`), and returns the response with `X-Cache: MISS`.
4.  **Active Cache Invalidation**: When any modification occurs on the inventory—via `POST /v1/products` (create), `PATCH /v1/products/:id` (update), or `DELETE /v1/products/:id` (delete)—the Product Service controller invalidates the stale cache by sending Redis `DEL` commands for both the listing key (`cache:products:all`) and the specific product key (`cache:products:{id}`). This ensures immediate data consistency while maximizing cache efficiency.

### 🚦 Redis Distributed Rate Limiter
The system protects downstream services from abuse by implementing a Redis-based Fixed-Window rate limiter in the Gateway:
1.  **Identifiers**: The limiter runs two checks:
    *   **Per-IP**: All requests are checked by the client's IP address.
    *   **Per-User**: If the request is authenticated, the limiter also tracks requests against the `userId`.
2.  **Atomicity**: It computes the current 60-second window key (`rl:ip:<ip>:<timestamp>` or `rl:user:<userId>:<timestamp>`) and executes an atomic Redis pipeline containing `INCR` and `EXPIRE` commands.
3.  **Fail-Open Safety**: If the Redis server experiences a connection outage, the middleware catches the error, logs a warning via Winston, and allows the request to pass through ("fails open") to ensure a Redis crash does not cause a site-wide outage.

---

## 🏃 3. How to Run the Services

### 📋 Prerequisites
Ensure the following databases are running on your system:
*   **MongoDB**: Running at `mongodb://localhost:27017`
*   **Redis**: Running at `localhost:6379`

### 🚀 Command Option A: Running All Services Electronically (Automated E2E)
You can run the pre-built test script which spins up all 5 microservices, validates connection states, triggers a full API sequence, and cleans up:
```powershell
node test-flow.js
```
*   **Console Output**: Displays integration test execution results.
*   **Service Logs**: Check [test-services.log](file:///c:/Users/admin/Desktop/Projects/ProjectSec/test-services.log) for debug/info streams generated by the services.

### 💻 Command Option B: Running Services Manually
If you want to keep the services running continuously for testing, open separate terminals and run:
```powershell
# Start Auth Service (Port 4001)
npm run dev:auth

# Start Product Service (Port 4002)
npm run dev:product

# Start Payment Service (Port 4003)
npm run dev:payment

# Start Order Service (Port 4004)
npm run dev:order

# Start API Gateway (Port 3000)
npm run dev:gateway
```

---

## 🧪 4. Step-by-Step API Request Testing (PowerShell)

You can run these scripts inside Windows PowerShell to test individual operations through the API Gateway on port `3000`.

### 1. Check Gateway & Downstream Services Health
Gateway pings each service dynamically and reports their state:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get | ConvertTo-Json
```

### 2. Register a New User
```powershell
$regBody = @{
    name = "Candidate Interviewee"
    email = "candidate@example.com"
    password = "superSecurePassword"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/v1/auth/register" -Method Post -Body $regBody -ContentType "application/json" | ConvertTo-Json
```

### 3. Log In to Acquire JWT Token
```powershell
$loginBody = @{
    email = "candidate@example.com"
    password = "superSecurePassword"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResponse.data.token
$userId = $loginResponse.data.user.id

Write-Host "JWT Token: $token"
Write-Host "User ID: $userId"
```

### 4. Fetch Profile (Protected Route)
```powershell
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:3000/v1/auth/me" -Method Get -Headers $headers | ConvertTo-Json
```

### 5. Create a Product
```powershell
$prodBody = @{
    name = "Architectural Review Laptop"
    description = "Specially configured machine for microservice runs"
    price = 1499.99
    category = "electronics"
    stock = 15
} | ConvertTo-Json

$prodResponse = Invoke-RestMethod -Uri "http://localhost:3000/v1/products" -Method Post -Headers $headers -Body $prodBody -ContentType "application/json"
$productId = $prodResponse.data.product.id
Write-Host "Created Product ID: $productId"
```

### 6. Query Products List (Verifying Cache Header)
Execute this command twice. The first response will show `X-Cache: MISS` (and hit Product Service). The second response (within 60s) will show `X-Cache: HIT` and arrive in under 5ms:
```powershell
$webReq = Invoke-WebRequest -Uri "http://localhost:3000/v1/products" -Method Get -Headers $headers
Write-Host "Cache Status Header: $($webReq.Headers['X-Cache'])"
$webReq.Content | ConvertFrom-Json | ConvertTo-Json
```

### 7. Place an Order (Cross-Service Orchestration)
This call validates stock, updates user records, charges the transaction through the simulated bank, and updates order states:
```powershell
$orderBody = @{
    userId = $userId
    items = @(
        @{ productId = $productId; quantity = 1 }
    )
    shippingAddress = @{
        street = "77 Innovation Way"
        city = "Silicon Valley"
        country = "US"
    }
    paymentMethod = "CREDIT_CARD"
} | ConvertTo-Json

$orderResponse = Invoke-RestMethod -Uri "http://localhost:3000/v1/orders" -Method Post -Headers $headers -Body $orderBody -ContentType "application/json"
$orderId = $orderResponse.data.id
$paymentId = $orderResponse.data.paymentId

Write-Host "Order ID: $orderId"
Write-Host "Payment ID: $paymentId"
$orderResponse | ConvertTo-Json
```

### 8. View Order Details
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/v1/orders/$orderId" -Method Get -Headers $headers | ConvertTo-Json
```

### 9. Test Rate Limiter (Trigger 429)
Runs requests to Gateway health in a rapid loop to trigger the rate limiter limit:
```powershell
Write-Host "Bursting requests to Gateway health..."
for ($i = 1; $i -le 110; $i++) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method Get -ErrorAction Stop
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 429) {
            Write-Host "Request $i: Blocked! HTTP 429 Too Many Requests."
            $_.Exception.Response.Headers | Format-Table
            break
        }
    }
}
```

---

## 🗄️ 5. Database & Cache Verification

### 1. Inspecting MongoDB
MongoDB holds all primary data in isolation.
*   **Connection URL**: `mongodb://localhost:27017`
*   **Database**: `hydragateway`
*   **Collection Structure & Verification Queries** (using MongoDB Compass or `mongosh`):
    *   **`users`**: Stores client login accounts.
        ```javascript
        db.users.find({ email: "candidate@example.com" }).pretty()
        // Notice that the 'password' field is hashed with bcrypt and 'lastLoginAt' stores login event timestamps.
        ```
    *   **`products`**: Stores inventory records.
        ```javascript
        db.products.find({ _id: ObjectId("YOUR_PRODUCT_ID") }).pretty()
        // Checks 'stock' amounts, 'price', and soft-delete field 'isActive' (default true).
        ```
    *   **`payments`**: Audits simulated transactions.
        ```javascript
        db.payments.find({ transactionId: "YOUR_PAYMENT_ID" }).pretty()
        // Shows transaction state ('COMPLETED' or 'FAILED'), amount charged, and timestamp.
        ```
    *   **`orders`**: Tracks order orchestration.
        ```javascript
        db.orders.find({ _id: ObjectId("YOUR_ORDER_ID") }).pretty()
        // Contains mapped order status ('PENDING', 'PAID', etc.) matching payments and items array.
        ```

### 2. Inspecting Redis Cache & Rate Limiters
Use the Redis CLI to inspect in-memory parameters:
1.  Open CLI:
    ```bash
    redis-cli
    ```
2.  **View All Response Caching Keys**:
    ```bash
    keys cache:products:*
    // You should see 'cache:products:all' and 'cache:products:<id>'.
    ```
3.  **Read Capped Content Value**:
    ```bash
    get cache:products:all
    ```
4.  **Check Time-to-Live (TTL) of Cache**:
    ```bash
    ttl cache:products:all
    // Returns remaining seconds before expiration (defaults to 60s).
    ```
5.  **View Rate Limiting Windows**:
    ```bash
    keys rl:*
    // Look for 'rl:ip:<ip>:<timestamp>' or 'rl:user:<userId>:<timestamp>'.
    ```
6.  **Read Request Counter inside the window**:
    ```bash
    get "rl:ip:127.0.0.1:170000000000"
    // Returns number of requests made in the current 60s window.
    ```
7.  **Check rate limiter expiry**:
    ```bash
    ttl "rl:ip:127.0.0.1:170000000000"
    ```

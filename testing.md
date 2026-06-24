# 🧪 HydraGateway — Testing and Verification Guide (Phases 1 to 7)

This document provides a comprehensive testing guide for the 5 microservices and API Gateway built up to **Phase 7**. You will learn how to run automated tests, perform manual verification using native Windows PowerShell, and view database records in MongoDB and Redis without needing Postman.

---

## ⚡ Quick Start: Automated E2E Testing

We have built a single, unified test script, [test-flow.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/test-flow.js), that automates the entire sequence for all phases. It performs the following actions:
1. Verifies that MongoDB and Redis are running.
2. Spawns all 5 microservices in the background (Auth, Product, Payment, Order, and Gateway).
3. Polls each service's `/health` endpoint until online.
4. Executes test cases through the Gateway (port `3000`):
   - **Phase 6 Gateway Check**: Fetches aggregated downstream health.
   - **Phase 2 Auth**: Registers a user, logs in to obtain a JWT, tests JWT authentication bypass on public routes, and verifies token-secured access to `/me`.
   - **Phase 3 Product CRUD**: Creates a product, fetches details, modifies values, and lists products.
   - **Phase 4 & 5 Order Orchestration**: Creates an order, which internally triggers cross-service calls to validate the product and simulate payment processing.
   - **Phase 7 Rate Limiter**: Bursts requests to verify IP-based blocking and response headers.
5. Cleans up all generated test data from MongoDB and Redis, keeping your databases pristine.
6. Shuts down all background services cleanly.

### How to Run:
1. Ensure MongoDB and Redis are active (see [Database Inspection](#-database-inspection) below).
2. Open your terminal in the project root directory.
3. Run the test script:
   ```powershell
   node test-flow.js
   ```
4. Background logs will be saved to a newly created file: [test-services.log](file:///c:/Users/admin/Desktop/Projects/ProjectSec/test-services.log).

---

## 🗄️ Database Inspection (MongoDB & Redis)

You do **not** need Postman to inspect database records. Here are the recommended ways to verify data in MongoDB and Redis:

### 1. MongoDB (Microservices Data)
All business data (users, products, payments, orders) is stored in the MongoDB database named `hydragateway` running at:
`mongodb://localhost:27017/hydragateway`

> [!TIP]
> **MongoDB Compass (Recommended GUI)**
> 1. Download and install [MongoDB Compass](https://www.mongodb.com/products/tools/compass) (the official free graphical interface for MongoDB).
> 2. Open Compass, click **New Connection**, paste the connection string `mongodb://localhost:27017`, and click **Connect**.
> 3. Under databases on the left sidebar, click `hydragateway`.
> 4. You will see 4 collections:
>    - `users` (Phase 2): User profiles with hashed passwords.
>    - `products` (Phase 3): Inventory details.
>    - `payments` (Phase 4): Simulated payment receipts and transaction statuses.
>    - `orders` (Phase 5): Orders mapped to a total price and transaction status.

> [!NOTE]
> **Mongo Shell (CLI Alternative)**
> If you have the MongoDB Shell (`mongosh`) installed, open your terminal and run:
> ```bash
> mongosh "mongodb://localhost:27017/hydragateway"
> show collections
> db.users.find().pretty()
> db.orders.find().pretty()
> ```

### 2. Redis (Rate Limiting Keys)
Redis stores short-lived IP and user rate-limiter counters on `localhost:6379`.

To inspect keys in Redis:
1. Run the Redis Command Line Interface:
   ```bash
   redis-cli
   ```
2. Retrieve all active rate-limiting keys:
   ```bash
   keys rl:*
   ```
3. Read the request count of a specific key (e.g. an IP window):
   ```bash
   get "rl:ip:127.0.0.1:1700000000000"
   ```
4. Check how many seconds are remaining before the rate limit counter resets:
   ```bash
   ttl "rl:ip:127.0.0.1:1700000000000"
   ```

---

## 💻 Manual Step-by-Step Testing (PowerShell)

If you prefer to run services manually and test them step-by-step from the command line without Postman, follow this guide using Windows PowerShell.

### Step 1: Start All Services Manually
Open a separate terminal window for each command (or run them in the background):
```powershell
# In terminal 1
npm run dev:auth

# In terminal 2
npm run dev:product

# In terminal 3
npm run dev:payment

# In terminal 4
npm run dev:order

# In terminal 5
npm run dev:gateway
```

### Step 2: Run Request Scenarios
Open a new PowerShell terminal and run the commands below.

#### Phase 6: Verify API Gateway Liveness & Health Routing
Gateway health check endpoint (aggregates downstream service connectivity):
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get | ConvertTo-Json
```

#### Phase 2: Register and Login (Public Routes)
1. **Register a User**:
   ```powershell
   $regBody = @{
       name = "Manual Tester"
       email = "manual_test@example.com"
       password = "superSecurePassword"
   } | ConvertTo-Json

   Invoke-RestMethod -Uri "http://localhost:3000/v1/auth/register" -Method Post -Body $regBody -ContentType "application/json" | ConvertTo-Json
   ```

2. **Login and Save Token**:
   ```powershell
   $loginBody = @{
       email = "manual_test@example.com"
       password = "superSecurePassword"
   } | ConvertTo-Json

   $loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
   $token = $loginResponse.data.token
   $userId = $loginResponse.data.user.id

   # Print verification variables
   Write-Host "JWT Token: $token"
   Write-Host "User ID: $userId"
   ```

3. **Get User Profile (Protected - Requires JWT)**:
   ```powershell
   $headers = @{ Authorization = "Bearer $token" }
   Invoke-RestMethod -Uri "http://localhost:3000/v1/auth/me" -Method Get -Headers $headers | ConvertTo-Json
   ```

#### Phase 3: Create a Product (Protected)
1. **Create Product**:
   ```powershell
   $prodBody = @{
       name = "Super Deluxe Coffee Mug"
       description = "Keeps beverages piping hot for hours"
       price = 24.99
       category = "kitchen"
       stock = 85
   } | ConvertTo-Json

   $prodResponse = Invoke-RestMethod -Uri "http://localhost:3000/v1/products" -Method Post -Headers $headers -Body $prodBody -ContentType "application/json"
   $productId = $prodResponse.data.id
   Write-Host "Created Product ID: $productId"
   ```

2. **Get Product Detail**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/v1/products/$productId" -Method Get -Headers $headers | ConvertTo-Json
   ```

#### Phase 4 & 5: Create Order (Triggers Product Check & Payment Simulation)
1. **Place Order**:
   ```powershell
   $orderBody = @{
       userId = $userId
       items = @(
           @{ productId = $productId; quantity = 2 }
       )
       shippingAddress = @{
           street = "123 Main Street"
           city = "Mugtown"
           country = "US"
       }
       paymentMethod = "CREDIT_CARD"
   } | ConvertTo-Json

   $orderResponse = Invoke-RestMethod -Uri "http://localhost:3000/v1/orders" -Method Post -Headers $headers -Body $orderBody -ContentType "application/json"
   $orderId = $orderResponse.data.id
   $paymentId = $orderResponse.data.paymentId
   Write-Host "Order ID: $orderId"
   Write-Host "Payment Transaction ID: $paymentId"
   ```

2. **Check Payment Status Direct**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/v1/payments/$paymentId/status" -Method Get -Headers $headers | ConvertTo-Json
   ```

3. **Check Order Status**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/v1/orders/$orderId" -Method Get -Headers $headers | ConvertTo-Json
   ```

#### Phase 7: Redis Rate Limiting Verification
Perform rapid requests in a loop to see if the Gateway blocks you with **HTTP 429 Too Many Requests**.

```powershell
Write-Host "Sending rapid requests. Please wait..."
for ($i = 1; $i -le 110; $i++) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method Get -ErrorAction Stop
        Write-Host "Request $i: OK"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 429) {
            Write-Host "Request $i: blocked successfully! HTTP 429 received."
            Write-Host "Headers returned:"
            $_.Exception.Response.Headers | Format-Table
            break
        } else {
            Write-Host "Request $i: failed with unexpected status $statusCode"
        }
    }
}
```

---

## 🛠️ Troubleshooting

- **Service Connection Errors**: Check [test-services.log](file:///c:/Users/admin/Desktop/Projects/ProjectSec/test-services.log) for errors related to duplicate ports or database connection timeouts.
- **Port Conflicts**: Ensure ports `3000`, `4001`, `4002`, `4003`, and `4004` are not occupied by other background software before running tests.
- **Rate Limit Reset**: If you are locked out during manual tests, either wait 60 seconds for the window to reset, or clear Redis:
  ```bash
  redis-cli flushall
  ```

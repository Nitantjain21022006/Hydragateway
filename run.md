# 🚦 HydraGateway – Detailed Manual & Automated Test Run Guide

This guide provides step-by-step instructions on how to start and test the HydraGateway monorepo ecosystem. It covers automated End-to-End (E2E) testing, manual multi-terminal execution, and a detailed walkthrough of verifying the registration and login authentication flows.

---

## 🏗️ 1. Prerequisites & Environment Setup

Before executing any commands, ensure that your infrastructure is active and the dependencies are installed.

### Install Dependencies
Run the following in the root directory:
```bash
npm install
```

### Start Databases
Ensure **MongoDB** and **Redis** are running locally.
*   **MongoDB**: Runs on `mongodb://localhost:27017`
*   **Redis**: Runs on `redis://127.0.0.1:6379`

### Environment Variables
Verify your root `.env` file matches the template in `.env.example`. Key configuration options include:
*   `JWT_SECRET`: The shared secret key used for signing JWTs.
*   `MONGO_URI`: `mongodb://localhost:27017/hydragateway`
*   `REDIS_HOST`: `localhost`
*   `REDIS_PORT`: `6379`

---

## 🚀 2. Option A: Automated E2E Testing

For a quick, fully automated verification of all components (Phases 2 through 11), run the E2E integration test script.

### Run Script
In your terminal, execute:
```bash
node test-flow.js
```

### What It Does
1.  **Validates Prerequisites**: Checks connection to MongoDB and Redis.
2.  **Spawns Microservices**: Launches Auth, Product, Payment, Order, and Gateway services.
3.  **Probes Health**: Polls each service's `/health` endpoint until online.
4.  **Runs Scenarios**:
    *   Creates a test user and verifies JWT login.
    *   Tests protected route guards (e.g. GET `/v1/auth/me`).
    *   Executes Product CRUD and Order orchestrations.
    *   Verifies Redis rate limiting (sends 110 requests to trigger `429 Too Many Requests`).
    *   Validates response caching (`X-Cache: HIT` / `MISS`).
    *   Tests load balancing across gateway ports and checks round-robin distribution.
5.  **Performs Cleanup**: Clears test data from MongoDB and Redis, then shuts down all services.

> [!NOTE]
> Detailed output logs from the spawned services are saved dynamically in [test-services.log](file:///c:/Users/admin/Desktop/Projects/ProjectSec/test-services.log).

---

## 💻 3. Option B: Manual Execution (Multi-Terminal Run)

To inspect services individually, view their standard output in real-time, or test endpoints manually, you can launch the services in separate terminal windows.

### Terminal 1: Downstream Services
Run the downstream microservices in their own windows or in the background:
```bash
# Start Auth Service (Port 4001)
npm run dev:auth

# Start Product Service (Port 4002)
npm run dev:product

# Start Payment Service (Port 4003)
npm run dev:payment

# Start Order Service (Port 4004)
npm run dev:order
```

### Terminal 2: API Gateway Instances
We start two instances of the Gateway on different ports to verify the Load Balancer's round-robin routing and failover capacity.

*   **Instance 1 (Port 3000)**:
    ```powershell
    $env:GATEWAY_PORT=3000; $env:GATEWAY_INSTANCE_ID="gateway-1"; npm run dev:gateway
    ```
*   **Instance 2 (Port 3001)**:
    ```powershell
    $env:GATEWAY_PORT=3001; $env:GATEWAY_INSTANCE_ID="gateway-2"; npm run dev:gateway
    ```

> [!TIP]
> On Windows Command Prompt (CMD), run:
> `set GATEWAY_PORT=3000&& set GATEWAY_INSTANCE_ID=gateway-1&& npm run dev:gateway`

### Terminal 3: Load Balancer
Start the Custom Load Balancer to act as the primary entry point (Port 8080):
```bash
npm run dev:lb
```

---

## 🔒 4. How to Verify the User Login & Registration Flow

This section details how to check the login and registration mechanisms manually using **cURL** or **PowerShell**, inspect database collections, and verify the backend authentication logs.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Tester
    participant LB as Load Balancer (:8080)
    participant GW as API Gateway (:3000/:3001)
    participant Auth as Auth Service (:4001)
    participant DB as MongoDB

    Note over Client,DB: Registration Flow
    Client->>LB: POST /v1/auth/register (payload)
    LB->>GW: Forward Round-Robin
    GW->>Auth: Proxy request (Public route)
    Auth->>DB: Check email & save User (Bcrypt Hash)
    Auth-->>Client: 201 Created + JWT Token
    
    Note over Client,DB: Login Flow
    Client->>LB: POST /v1/auth/login (email/password)
    LB->>GW: Forward Round-Robin
    GW->>Auth: Proxy request (Public route)
    Auth->>DB: Validate credentials & update lastLoginAt
    Auth-->>Client: 200 OK + JWT Token

    Note over Client,DB: Accessing Protected Route (/me)
    Client->>LB: GET /v1/auth/me (Headers: Authorization: Bearer <JWT>)
    LB->>GW: Forward Round-Robin
    GW->>GW: Local validation (Decode JWT & verify signature)
    GW->>Auth: Proxy request (Headers: X-User-Id, X-User-Role)
    Auth->>DB: Fetch user by ID
    Auth-->>Client: 200 OK + User Profile JSON
```

### Step 1: Register a New User
Send a `POST` request with user credentials. We target the Load Balancer on port `8080` (or Gateway on `3000`).

#### Using cURL:
```bash
curl -X POST http://localhost:8080/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"vision_test@example.com","password":"securePassword123","name":"Vision Tester"}'
```

#### Using PowerShell:
```powershell
$regPayload = @{
    email = "vision_test@example.com"
    password = "securePassword123"
    name = "Vision Tester"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8080/v1/auth/register" -Method Post -Body $regPayload -ContentType "application/json" | ConvertTo-Json
```

#### Expected JSON Response (201 Created):
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "64bfd4e12e843c0012abc789",
      "name": "Vision Tester",
      "email": "vision_test@example.com",
      "role": "user",
      "isActive": true
    }
  }
}
```

---

### Step 2: Database Verification (MongoDB)
Verify that the registration occurred successfully and passwords are encrypted in the database.

1.  Connect to MongoDB via **mongosh** or **MongoDB Compass**:
    ```bash
    mongosh "mongodb://localhost:27017/hydragateway"
    ```
2.  Query the user:
    ```javascript
    db.users.findOne({ email: "vision_test@example.com" })
    ```
3.  **Check Validation Points**:
    *   Verify that `password` is NOT saved in plain text (it should be a `bcrypt` hash starting with `$2a$`).
    *   Verify that `isActive` defaults to `true`.
    *   Verify that `role` defaults to `user`.

---

### Step 3: Login to Acquire the JWT Token
Log in to verify the authentication service compares passwords correctly and generates a new stateless token.

#### Using cURL:
```bash
curl -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"vision_test@example.com","password":"securePassword123"}'
```

#### Using PowerShell:
```powershell
$loginPayload = @{
    email = "vision_test@example.com"
    password = "securePassword123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8080/v1/auth/login" -Method Post -Body $loginPayload -ContentType "application/json"
$token = $response.data.token
Write-Host "Captured JWT Token: $token"
```

---

### Step 4: Verify JWT Access Control (GET /me)
Attempt to access the protected user profile (`/v1/auth/me`).

#### Test Case 4.1: Access Without Token (Should FAIL)
Verify the API Gateway blocks requests without an authorization header:
```bash
curl -i http://localhost:8080/v1/auth/me
```
*   **Expected Response**: `401 Unauthorized` with error code `UNAUTHORIZED`.

#### Test Case 4.2: Access With Invalid Token (Should FAIL)
```bash
curl -i -H "Authorization: Bearer invalidToken123" http://localhost:8080/v1/auth/me
```
*   **Expected Response**: `401 Unauthorized` with error code `INVALID_TOKEN` or `UNAUTHORIZED`.

#### Test Case 4.3: Access With Valid Token (Should SUCCEED)
Pass the token captured from Step 3.

*   **Using cURL**:
    ```bash
    curl -X GET http://localhost:8080/v1/auth/me \
      -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    ```
*   **Using PowerShell**:
    ```powershell
    $headers = @{ Authorization = "Bearer $token" }
    Invoke-RestMethod -Uri "http://localhost:8080/v1/auth/me" -Method Get -Headers $headers | ConvertTo-Json
    ```

*   **Expected JSON Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "user": {
          "id": "64bfd4e12e843c0012abc789",
          "name": "Vision Tester",
          "email": "vision_test@example.com",
          "role": "user"
        }
      }
    }
    ```

---

### Step 5: How the Gateway Decodes & Propagates JWTs
When testing the protected `/me` path, the API Gateway performs local validation on the token and injects identifying headers to internal downstream services.

> [!IMPORTANT]
> **Downstream Header Injection**
> 1. The Gateway validates the JWT locally using `JWT_SECRET`.
> 2. It decodes the payload: `{ sub: "64bfd4e12e843c0012abc789", role: "user", iat: 170000000, exp: 170000086 }`.
> 3. It proxies the request to the Auth Service (`http://localhost:4001/v1/auth/me`).
> 4. During forwarding, the Gateway injects the headers:
>    *   `x-user-id`: `"64bfd4e12e843c0012abc789"`
>    *   `x-user-role`: `"user"`
> 5. The downstream Auth Service reads `x-user-id` from the headers directly, keeping the microservice stateless and decoupled from JWT signing logic!

---

### Step 6: Checking Logs
To verify that requests are flowing, check the consolidated logs in the `/logs` directory:

1.  **`logs/gateway.log`**:
    Tracks incoming requests, routes matched, rate limiting checks, and latency.
    ```json
    {"level":"info","message":"[jwtAuth] Token validated for user 64bfd4e12e843c0012abc789","service":"gateway-auth","correlationId":"corr-uuid-123"}
    ```
2.  **`logs/auth.log`**:
    Logs user registration queries, successful logins, and password comparisons.
    ```json
    {"level":"info","message":"POST /v1/auth/login completed status=200","service":"auth-service","correlationId":"corr-uuid-123"}
    ```

---

## 🛠️ Troubleshooting Runs

*   **Port Conflicts**: If you get `EADDRINUSE`, ensure the ports are clear:
    *   Auth Service: `4001`
    *   Product Service: `4002`
    *   Payment Service: `4003`
    *   Order Service: `4004`
    *   Gateway instances: `3000`, `3001`
    *   Load Balancer: `8080`
*   **Failed token decode**: If the gateway outputs `INVALID_TOKEN` for a newly issued token, ensure that `JWT_SECRET` in `.env` is identical across **both** the gateway and the auth-service directories/environment.
*   **Database connection failures**: Ensure local Redis and MongoDB services are running and bound to default ports before launching the nodes.

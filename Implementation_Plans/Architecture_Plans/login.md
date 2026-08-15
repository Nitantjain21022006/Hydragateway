# 🔑 HydraGateway – Authentication & Login Verification Guide

This document describes how to execute and verify the authentication and authorization flow of the HydraGateway platform. 

Verification can be performed in two ways:
1. **Via Command Line (PowerShell / curl)**
2. **Via the Observability Dashboard (Load Generator)**

---

## ⚡ Prerequisites

Ensure that all services are active before beginning verification:
* **Load Balancer:** Running on port `8080` (or Gateway directly on `3000`).
* **Auth Service:** Running on port `4001`.
* **MongoDB:** Running on port `27017` with the `hydragateway` database.

---

## 🛠️ Method 1: CLI Verification (curl / PowerShell)

Using standard API requests, we will verify:
1. Denying access to protected routes without a token.
2. Creating a test user.
3. Authenticating the user to obtain a JWT.
4. Using the JWT to access protected endpoints.

### Step 1: Attempt Protected Route Without a Token (Expect: 401)
Verify that requests directly to protected routes are blocked.
```powershell
curl -X GET "http://localhost:8080/v1/products" -H "Content-Type: application/json"
```
**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authorization token required"
  }
}
```

### Step 2: Register a New User
If you don't have a user, register one by posting to `/v1/auth/register`:
```powershell
curl -X POST "http://localhost:8080/v1/auth/register" `
  -H "Content-Type: application/json" `
  -d '{"name": "Verification User", "email": "verify@example.com", "password": "Password123"}'
```
**Expected Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "_id": "...",
      "name": "Verification User",
      "email": "verify@example.com",
      "role": "user"
    }
  }
}
```

### Step 3: Login to Get a Fresh JWT Token
Simulate authentication by calling `/v1/auth/login`:
```powershell
curl -X POST "http://localhost:8080/v1/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"email": "verify@example.com", "password": "Password123"}'
```
*Take note of the `"token"` field returned in the response.*

### Step 4: Access Protected Route with the JWT Token (Expect: 200)
Replace `<YOUR_TOKEN>` with the token string returned in Step 3:
```powershell
curl -X GET "http://localhost:8080/v1/products" `
  -H "Authorization: Bearer <YOUR_TOKEN>" `
  -H "Content-Type: application/json"
```
**Expected Response:**
An array of products or an empty list `[]` with status code `200 OK`.

---

## 🖥️ Method 2: Observability Dashboard Verification (Load Generator)

The Observability Dashboard's Load Generator features a built-in pre-flight auto-login and credentials override widget.

### Step 1: Open the Load Generator
1. Open `http://localhost:5173/load-generator` in your browser.
2. On the left configuration panel, locate the **Authentication Settings** accordion block.
3. Click it to expand the authentication details.

### Step 2: Verify Auto-Authenticate (Zero-Config)
1. Select the `GET /v1/products` preset from the **Endpoint Preset** dropdown (this route is protected by JWT validation).
2. Ensure **"Auto-Authenticate on Start"** is checked.
3. Clear the **"Active JWT Token"** field if there is a cached token.
4. Set **Total Requests** to `10`.
5. Click **"Start Load Test"**.
6. **Expected Behavior:**
   * The load test starts immediately and completes successfully (no `401` errors).
   * Behind the scenes, the Load Generator sent a pre-flight login request, registered/logged in `test@example.com`, retrieved the token, and appended it to all 10 outgoing requests.
   * Expand the **Authentication Settings** panel; you will see the active token populated and stored.

### Step 3: Verify Manual Authentication Widget
1. Expand the **Authentication Settings** accordion.
2. In the Email and Password fields, enter:
   * **Email:** `verify@example.com`
   * **Password:** `Password123`
3. Click **"Login / Register"**.
4. **Expected Behavior:**
   * A green message banner appears: `Authenticated as verify@example.com` (or `Registered and Authenticated as...`).
   * The **"Active JWT Token"** box is instantly populated with a fresh JWT.
   * Hit "Start Load Test" again — requests will now use this custom account's token.

### Step 4: Verify Denied Access (Without Auth)
1. Expand **Authentication Settings** and click **"Clear"** next to the active token text area.
2. Uncheck **"Auto-Authenticate on Start"**.
3. Set preset to `GET /v1/products` and click **"Start Load Test"**.
4. **Expected Behavior:**
   * The requests will fail immediately.
   * The **Recent Results** grid at the bottom will display status code `401` (UNAUTHORIZED) next to red X icons for all requests.

---

## ⚡ Verifying Payments & Orders List Endpoints (404 Resolution)

We resolved the 404 errors on `GET /v1/payments` and `GET /v1/orders` by implementing the endpoints in the respective payment and order microservices.

### Steps to Verify:
1. Ensure the services have restarted with the updated code.
2. Go to the **Load Generator** page.
3. Select `GET /v1/payments` or `GET /v1/orders`.
4. Ensure **"Auto-Authenticate on Start"** is checked.
5. Click **"Start Load Test"**.
6. **Expected Behavior:**
   * The load generator fires requests and completes successfully.
   * In the **Recent Results** section, the status code displays `200` with a green checkmark instead of `404`.

---

## 🛡️ Verifying Circuit Breakers (CLOSED ➔ OPEN ➔ HALF_OPEN ➔ CLOSED)

The API Gateway implements a 3-state Circuit Breaker FSM (CLOSED, OPEN, HALF_OPEN) for all downstream services. Here is how to trigger and verify the circuit breaker lifecycle:

### Step 1: Confirm Normal State (CLOSED)
1. Navigate to the **Circuit Breakers** tab on the dashboard.
2. Confirm that the status of all services (auth, product, payment, order) is **CLOSED** (green pulsing indicators).

### Step 2: Trigger the Breaker (CLOSED ➔ OPEN)
1. Stop the **Payment Service** in your terminal:
   * Press `Ctrl+C` in the terminal running `npm run dev:payment` (Port 4003).
2. Navigate to the **Load Generator** page.
3. Select `GET /v1/payments`.
4. Set **Total Requests** to `10` and concurrency to `2`.
5. Click **"Start Load Test"**.
6. **Expected Behavior:**
   * The first 5 requests will fail (trying to connect to the offline service).
   * After exactly **5 failures** (the default threshold), the circuit trips to **OPEN** (red flashing state).
   * Any subsequent requests in the batch fail instantly with `503 CIRCUIT_OPEN` at the API Gateway level, protecting the system from wasting socket resources.
   * On the **Circuit Breakers** dashboard page, the Payment Service card turns red with a recovery countdown.

### Step 3: Wait for Cooldown (OPEN ➔ HALF_OPEN)
1. Wait for **10 seconds** (the default cooldown timer).
2. Look at the **Circuit Breakers** page: the state transitions to **HALF_OPEN** (amber/yellow indicator). In this state, the gateway allows limited probe requests through.

### Step 4: Recover the Service (HALF_OPEN ➔ CLOSED)
1. Start the **Payment Service** back up in your terminal:
   * Run `npm run dev:payment`.
2. Go to the **Load Generator** and send 2-3 requests to `GET /v1/payments`.
3. **Expected Behavior:**
   * The requests succeed since the payment service is back online.
   * After **2 consecutive successes** (the default success threshold), the circuit breaker transitions back to **CLOSED** (green pulsing indicator).

# HydraGateway - Manual Testing Guide (Part 2: Phases 8-13)

---

## 1. Prerequisites

Before testing these phases, ensure all services are running as described in the initial testing guide. 

Start the ecosystem (in separate terminals or in the background):
```bash
npm run dev:lb
npm run dev:gateway # (run two instances if testing LB, e.g., on ports 3000 and 3001)
npm run dev:auth
npm run dev:product
npm run dev:payment
npm run dev:order
npm run dev:dashboard
```

You will need a valid `{{token}}` from logging in (see API 3 in Part 1).

---

## 2. Phase 8: Redis Response Cache Validation

This phase caches product GET responses to reduce latency.

### Test A: Cache MISS (First Request)
**Method**: `GET`
**URL**: `http://localhost:8080/v1/products`
**Headers**: `Authorization: Bearer {{token}}`

**Expected**: 
- `200 OK`
- Look at the Response Headers in Postman/Curl: `X-Cache` should equal `MISS`.

### Test B: Cache HIT (Second Request)
Immediately send the exact same request again.

**Method**: `GET`
**URL**: `http://localhost:8080/v1/products`
**Headers**: `Authorization: Bearer {{token}}`

**Expected**: 
- `200 OK`
- Response Header `X-Cache` should equal `HIT`.
- The response time should be significantly lower (e.g., <5ms).

---

## 3. Phase 9: Centralized Distributed Logging

We standardized logging with Winston & Morgan. Every request generates structured JSON log entries that are written to a central `logs/` directory in the project root. You don't test this via API — you verify it by inspecting the filesystem after making a few requests.

> **Note**: Log files are now always written regardless of `NODE_ENV`. Prior to the fix, file logging was gated behind `NODE_ENV=production`, so the `logs/` folder appeared empty in development mode. This has been corrected.

**Steps**:
1. Ensure all services are running (auth, product, gateway — from earlier phases).
2. Make any request through the gateway, e.g.:
   ```
   GET http://localhost:3000/v1/products
   ```
3. Open the `logs/` directory in the **project root** (`c:\Users\admin\Desktop\Projects\ProjectSec\logs\`).
4. You should now see log files like:
   - `gateway-combined.log`
   - `auth-service-combined.log`
   - `product-service-combined.log`
5. Open `gateway-combined.log`. You will see structured JSON lines like:
   ```json
   { "timestamp": "2026-07-08 01:30:12", "service": "gateway", "level": "info", "message": "GET /v1/products 200 4ms", "correlationId": "abc-123-xyz" }
   ```
6. Copy the `correlationId` value from a gateway log entry.
7. Open `product-service-combined.log` and search (Ctrl+F) for that same `correlationId`.
8. You should find the **identical UUID** in the product service log, proving that the request was traced end-to-end across two services.

**Expected**:
- A `logs/` folder in the project root with one `.log` file per service.
- JSON structured entries with `timestamp`, `service`, `level`, `message`, and `correlationId`.
- The same `correlationId` appearing in both `gateway-combined.log` and `product-service-combined.log` for the same request.

---

## 4. Phase 10: Analytics Infrastructure

Every request is tracked asynchronously in Redis. Let's view the dashboard API metrics.

### API: Get Analytics Summary
**Method**: `GET`
**URL**: `http://localhost:3000/analytics/summary` (Hit the Gateway directly, no auth required)

**Expected JSON (200 OK)**:
```json
{
  "success": true,
  "data": {
    "total_requests": 15,
    "failed_requests": 1,
    "success_rate": "93.33%",
    "avg_response_time_ms": 25,
    "per_service_breakdown": {
      "product-service": 2
    }
  }
}
```

### API: Timeline & Endpoints
- **Timeline**: `GET http://localhost:3000/analytics/timeline`
- **Top Endpoints**: `GET http://localhost:3000/analytics/endpoints`

*(Try hitting a few random backend endpoints through the gateway to see these numbers increase in real-time).*

---

## 5. Phase 11: Custom Load Balancer

The custom load balancer distributes traffic across multiple gateway instances in a round-robin fashion.

### Test A: Routing Distribution
1. Ensure you have two Gateway instances running (e.g., Ports 3000 and 3001).
2. Send multiple requests to the Load Balancer:
   `GET http://localhost:8080/health`
3. Check the Response Headers. You should see the `X-LB-Selected-Gateway` header alternating:
   - Request 1: `gateway-1`
   - Request 2: `gateway-2`
   - Request 3: `gateway-1`

### Test B: Load Balancer Health Polling
**Method**: `GET`
**URL**: `http://localhost:8080/lb-health`

**Expected (200 OK)**:
```json
{
  "status": "UP",
  "gateways": {
    "gateway-1": "UP",
    "gateway-2": "UP"
  }
}
```

*Optional manual failover test: Kill Gateway 2 (`Ctrl+C`), wait 10 seconds, check `/lb-health` again. Gateway 2 will show `DOWN`, and all traffic will automatically route to Gateway 1.*

---

## 6. Phase 12: Circuit Breaker Pattern

The circuit breaker stops cascading failures when a downstream service dies. 

*Note: This can be fully tested via the provided script `node test-cb-flow.js`. The script will programmatically kill the payment service, observe the 503 CIRCUIT_OPEN, and verify recovery. Below is the manual alternative.*

### Manual Walkthrough:
1. **Normal Flow**: Ensure `payment-service` is running.
2. Send `GET http://localhost:8080/v1/payments`. (Expect 200/404/Normal response).
3. **Simulate Outage**: Go to the terminal running `npm run dev:payment` and kill it (`Ctrl+C`).
4. **Trip the Breaker**: Quickly send 5 requests to `GET http://localhost:8080/v1/payments`. The first few will hang briefly and fail (or return network error). After 5 failures, the circuit breaker **OPENS**.
5. **Verify Fast-Fail**: Send another request immediately. It will fail *instantly* with:
   ```json
   {
     "error": "CIRCUIT_OPEN",
     "message": "Service is currently unavailable. Please try again later."
   }
   ```
6. **Recovery**: Start the `payment-service` back up (`npm run dev:payment`). Wait for the cooldown period (~10 seconds). Send a request. The breaker will enter `HALF-OPEN`, probe the service, succeed, and go back to `CLOSED`.

### Automated Script Overview (`test-cb-flow.js`):
If you prefer not to manually kill terminals, run:
```bash
node test-cb-flow.js
```
**What the script does**:
- Starts all services for you.
- Deliberately shuts down the Payment Service programmatically.
- Spams the Gateway to trip the breaker.
- Validates that requests are being rejected immediately (Circuit Open).
- Waits 10 seconds for the cooldown.
- Restarts the Payment Service.
- Validates that the system successfully recovered (Circuit Closed).

---

## 7. Phase 13: Monitoring Dashboard

This is the visual culmination of the analytics infrastructure.

### Test: Visualizing the Data
1. Start the frontend client: `npm run dev:dashboard`.
2. Open your web browser and go to `http://localhost:5173`.
3. You will see a React SPA (built with Tailwind & Recharts) displaying:
   - Total & Failed Requests (Cards)
   - Average Latency (Cards)
   - Gateway Traffic Over Time (Area Chart)
   - Response Times (Bar Chart)
   - Live Microservice Health Statuses.
4. **Interact**: Send traffic using Postman to the API (`http://localhost:8080/v1/products`), then watch the Dashboard auto-update within 30 seconds to reflect the new metrics!

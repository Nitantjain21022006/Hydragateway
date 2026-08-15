# Phase 12: Circuit Breaker Pattern - Implementation Guide

This document provides a detailed breakdown of the **Circuit Breaker Pattern** implemented in Phase 12 of the **HydraGateway** platform. 

---

## 1. Objective of Phase 12
The primary objective of Phase 12 is to implement fault tolerance, self-healing, and resilience mechanisms across the microservices ecosystem. Specifically, we want to isolate failures in downstream services (e.g., the **Payment Service** becoming unavailable) so they do not cause cascading failures, thread exhaustion, or high latencies throughout the gateway and the **Order Service**.

---

## 2. Why a Circuit Breaker is Needed
In a distributed microservice architecture, synchronous service-to-service calls are common. For instance, when creating an order:
`Client ──► API Gateway ──► Order Service ──► Payment Service`

If the **Payment Service** becomes unavailable (due to network partitions, database crashes, or heavy load):
1. **Without a Circuit Breaker**: The Order Service and API Gateway will continue sending requests, causing threads/connections to hang until they hit socket timeouts. This leads to resource saturation, high memory/CPU usage, and eventual cascading failure across the entire system.
2. **With a Circuit Breaker**: The system detects the continuous failures. Once a threshold is crossed, it "trips" the circuit breaker. Subsequent requests are rejected immediately (fail-fast) with a `503 Service Unavailable` error, preserving system resources and offering a fast feedback loop to clients.

---

## 3. Overall Architecture
Our Circuit Breaker architecture protects two critical boundaries in the system:
1. **Ingress Boundary (API Gateway)**: Protects the gateway itself and external clients from wasting connection slots on downstream services that are already known to be offline.
2. **Service-to-Service Boundary (Order Service)**: Protects the internal order orchestrations. If the Payment Service is down, the Order Service fails fast at the payment step without waiting for HTTP socket timeouts, marking the order as `FAILED` gracefully.

Both implementations share the same core Finite State Machine (FSM) utility class.

---

## 4. State Machine Explanation

The Circuit Breaker behaves as a state machine with three primary states:

```
                  +--------------------------------+
                  |                                |
                  v                                |
            +-----------+      Consecutive         |
            |  CLOSED   | ─────────────────────┐   |
            +-----------+  Failures >= Limit   │   |
                  ^                            │   |
                  │                            v   │
   Consecutive    │                      +-----------+
   Successes >=   │                      |   OPEN    |
    Threshold     │                      +-----------+
                  │                            │
                  │                            │ Cooldown
                  │                            │
                  │                            v
            +-----------+                +-----------+
            | HALF-OPEN | ◄──────────────| HALF-OPEN |
            +-----------+ (First request) +-----------+
                  │
                  │ Probe Request Fails
                  └────────────────────────────>
```

### A. Closed State
* **Behavior**: Normal operations. All requests are permitted to flow through the breaker to the downstream target.
* **Failure Tracking**: The breaker listens to the outcome of each execution. If an execution fails (due to network timeouts, connection refused, or `>= 500` status codes), the internal failure counter increments.
* **Transition**: If consecutive failures reach the configured `failureThreshold` (default `5`), the breaker trips and transitions to the **OPEN** state.

### B. Open State
* **Behavior**: Short-circuiting mode. The breaker rejects all incoming requests immediately by throwing a `503 CIRCUIT_OPEN` error without initiating any network traffic.
* **Cooldown Timer**: A timer starts upon entering the **OPEN** state. The length of this cooldown period is configured by `cooldownTimeout` (default `10000ms`).
* **Transition**: Once the cooldown timer expires, the next incoming request transitions the breaker into the **HALF-OPEN** state to probe the downstream service's health.

### C. Half-Open State
* **Behavior**: Probing mode. The breaker permits a limited number of requests to go through to check if the downstream service has recovered.
* **Success/Failure Tracking**: 
  - If a probe request fails, the breaker assumes the downstream service is still unhealthy, resets the cooldown timer, and trips back to **OPEN** immediately.
  - If a probe request succeeds, it increments a success counter.
* **Transition**: Once consecutive successes reach the `successThreshold` (default `2`), the breaker assumes the service has fully recovered and resets the state back to **CLOSED**.

---

## 5. Request Flow

1. **Client Call**: Client sends a request to `/v1/payments` via the API Gateway.
2. **Circuit Breaker Guard**: The Gateway's `cbGuard` middleware intercepts the request:
   - If the circuit is `OPEN`, it rejects the request instantly with a `503 CIRCUIT_OPEN` JSON response.
   - If the circuit is `CLOSED` or `HALF-OPEN`, it forwards the request.
3. **Active Health Check (Health Guard)**: Checks the optimistic in-memory active health map.
4. **Proxy Forwarding**: The request is proxied through `http-proxy-middleware` to the target service.
5. **Proxy Call Outcome**:
   - **Success (HTTP < 500)**: The `proxyRes` listener calls `cb._onSuccess()`.
   - **Failure (Network Error or HTTP >= 500)**: The `error` / `proxyRes` listener catches it and calls `cb._onFailure()`.

---

## 6. Recovery Flow
1. While in `OPEN` state, a request arrives *after* the `cooldownTimeout` has expired.
2. The `cbGuard` transitions the circuit breaker state to `HALF-OPEN` and allows the request to be sent to the target service.
3. If this probe request succeeds:
   - Success count increments.
   - Once success count reaches `successThreshold` (e.g. 2 consecutive successful responses), the breaker transitions to `CLOSED`.
4. The system is fully recovered, and normal request routing resumes.

---

## 7. Failure Handling
Our Circuit Breaker specifically filters out client errors:
- **Client Errors (HTTP 400, 401, 403, 404, 422)**: Represent client input issues, not service unavailability. They do **NOT** count as failures and will not trip the breaker.
- **Server Errors (HTTP >= 500)**: Represent service degradation/failures. They increment the failure count.
- **Network Errors (ECONNREFUSED, ETIMEDOUT, ECONNRESET)**: Represent service unavailability. They increment the failure count.

---

## 8. Retry Mechanism
To protect against transient glitches (such as temporary packet drops or brief connection drops) tripping the breaker unnecessarily:
- The `CircuitBreaker.fire()` method runs a **retry loop** (default `3` attempts, with `1000ms` delay between attempts).
- Retries are triggered **only** for transient errors (connection timeouts, socket hangs, HTTP 503, and HTTP 504).
- The breaker counts the failure and increments the state machine's failure count **only** if all retry attempts fail. If an attempt succeeds, the client receives the success response and the failure count is cleared.

---

## 9. Timeout Strategy
Timeout handling is applied at two layers:
1. **HTTP Proxy Layer (Gateway)**: `http-proxy-middleware` connects with `timeout` (connection timeout) and `proxyTimeout` (read timeout) parameters set to the configured `CIRCUIT_BREAKER_TIMEOUT_MS`.
2. **Internal API Client Layer (Order Service)**: The `CircuitBreaker.fire()` method races the request execution against a timeout promise using `Promise.race`. If the request does not resolve within `requestTimeout` ms, the promise rejects with an `UPSTREAM_TIMEOUT` error, which counts as a failure.

---

## 10. Configurations Used
All circuit breaker options are loaded from the central environment config:

| Environment Variable | Default Value | Purpose |
|---|---|---|
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` | Number of consecutive failures to trip the circuit to OPEN |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | `10000` (10s) | Time to wait in OPEN state before attempting recovery |
| `CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | `2` | Consecutive successful probe requests required in HALF-OPEN to close the circuit |
| `CIRCUIT_BREAKER_TIMEOUT_MS` | `3000` (3s) | Maximum duration of an individual request before timing out |
| `CIRCUIT_BREAKER_RETRY_ATTEMPTS` | `3` | Maximum retry attempts for transient errors |
| `CIRCUIT_BREAKER_RETRY_DELAY_MS` | `1000` (1s) | Delay duration between consecutive retry attempts |

---

## 11. New Folders Created
No new folders were created to preserve the clean, flat packaging structure of the monorepo.

---

## 12. New Files Created

| File Path | Purpose | Why it was needed |
|---|---|---|
| [test-cb-flow.js](file:///c:/Users/Moksha%20Sheth/Desktop/HydraGateway/API_Gateway_Load_Balancer/test-cb-flow.js) | Automated E2E Circuit Breaker verification suite. | Orchestrates the entire state machine test lifecycle. Shuts down the Payment Service, trips the breaker, waits for cooldown, restarts the service, and verifies recovery. |

---

## 13. Existing Files Modified

### A. Shared Core Library
* **[shared/utils/circuitBreaker.js](file:///c:/Users/Moksha%20Sheth/Desktop/HydraGateway/API_Gateway_Load_Balancer/shared/utils/circuitBreaker.js)**:
  - **What changed**: Rewrote the stub class to implement the complete 3-state FSM. Added `successThreshold` recovery logic, `Promise.race` request timeout enforcement, retry looping for transient errors, and Winston log bindings.
  - **Why**: To provide a standardized, reusable, production-ready reliability component for both internal microservices and external gateways.

### B. API Gateway
* **[packages/gateway/src/routes/gatewayRoutes.js](file:///c:/Users/Moksha%20Sheth/Desktop/HydraGateway/API_Gateway_Load_Balancer/packages/gateway/src/routes/gatewayRoutes.js)**:
  - **What changed**: Instantiated circuit breakers for each service in the registry, wired the `cbGuard` middleware, configured proxy timeouts, and hooked into the proxy's `error` and `proxyRes` events to notify the breaker of successes and failures.
  - **Why**: Intercepts external requests to unhealthy downstream services at the edge, protecting gateway connections and resources.
* **[packages/gateway/src/server.js](file:///c:/Users/Moksha%20Sheth/Desktop/HydraGateway/API_Gateway_Load_Balancer/packages/gateway/src/server.js)**:
  - **What changed**: Updated the gateway router import and updated the `/health` endpoint to return the current state of all gateway circuit breakers.
  - **Why**: Allows administrators and monitoring scripts to view the real-time state of the circuit breakers.

### C. Downstream Services
* **[packages/order-service/src/services/orderService.js](file:///c:/Users/Moksha%20Sheth/Desktop/HydraGateway/API_Gateway_Load_Balancer/packages/order-service/src/services/orderService.js)**:
  - **What changed**: Wrapped the Payment Service call (`POST /v1/payments`) and Product Service validation call (`GET /v1/products/:id`) inside `paymentCircuitBreaker.fire()` and `productCircuitBreaker.fire()`.
  - **Why**: Protects the Order Service from failing internally or hanging when payment or product microservices are unhealthy.

### D. Global Config
* **[.env](file:///c:/Users/Moksha%20Sheth/Desktop/HydraGateway/API_Gateway_Load_Balancer/.env)**:
  - **What changed**: Added the default environment variables for the circuit breaker.
  - **Why**: Centralizes circuit breaker parameters for easy staging and production tuning.

---

## 14. Middleware Explanation
* **`cbGuard` (Gateway)**: A custom express middleware running before the proxy. It acts as the gatekeeper. It checks the state of the circuit. If `OPEN`, it rejects the request immediately. If the cooldown timer has elapsed, it transitions the breaker to `HALF-OPEN` and calls `next()` to execute the probe.

---

## 15. Service Explanation
* **`paymentCircuitBreaker` (Order Service)**: An instance of the `CircuitBreaker` class running inside the `OrderService` class memory. It wraps the downstream payment REST call. If payments start failing, the order service stops calling the payment service and fails orders instantly, avoiding thread pooling issues.

---

## 16. Environment Variables Added
*(Refer to Section 10 for the complete list and definitions)*

---

## 17. Logging Implementation
Log entries are recorded using the shared Winston logger and tagged with the service name:
- **State Transitions**: Logged with `logger.warn` showing previous and new states:
  ```json
  {"level":"warn","message":"[CircuitBreaker] Service [payment-service] transitioned from CLOSED to OPEN","service":"circuit-breaker"}
  ```
- **Probe success tracking**: Logged with `logger.info` tracking successes in HALF-OPEN state:
  ```json
  {"level":"info","message":"[CircuitBreaker] Service [payment-service] probe success 1/2","service":"circuit-breaker"}
  ```
- **Error details**: Logged with `logger.error` tracking failure counts:
  ```json
  {"level":"error","message":"[CircuitBreaker] Service [payment-service] recorded failure #1. Error: connect ECONNREFUSED","service":"circuit-breaker"}
  ```

---

## 18. Error Handling Strategy
- The Circuit Breaker wraps the execution in a `try-catch` block.
- If it throws a `CIRCUIT_OPEN` error, the API Gateway maps it to a `503 Service Unavailable` status and a standard error payload.
- In the Order Service, a payment failure (circuit open or payment down) is caught, and the order is saved as `status: 'FAILED'`, preventing database corruption or incomplete order states.

---

## 19. Integration with Previous Phases
- **Phase 6 (API Gateway)**: The circuit breaker middleware runs as part of the Gateway's middleware pipeline, placed between cache lookup and http-proxy-middleware.
- **Phase 9 (Logging)**: Circuit breaker transition states, failures, and retries are streamed directly into Winston's consolidated logger.
- **Phase 10 (Analytics)**: Requests rejected by the circuit breaker (503 CIRCUIT_OPEN) flow back to the analytics collector middleware, incrementing the `failed_requests` counter in Redis, guaranteeing accurate analytics.

---

## 20. Complete Request Life Cycle Flow
```
[Client Request]
       │
       ▼
[API Gateway]
       │
       ├─► Correlation ID Injected
       ├─► Morgan Logger
       ├─► JWT Validation
       ├─► Redis Rate Limiter
       ├─► Cache Check ── (Hit?) ──► [Return 200 Cached Data]
       │
       ▼ (Miss)
[Circuit Breaker Guard] ── (State is OPEN?) ──► [Return 503 CIRCUIT_OPEN]
       │
       ▼ (CLOSED / HALF-OPEN)
[Active Health Check] ── (DOWN?) ──► [Return 503 SERVICE_UNAVAILABLE]
       │
       ▼ (UP)
[Http-Proxy-Middleware] ── (Enforce Connection & Read Timeouts)
       │
       ▼ (Proxy Call)
[Downstream Service (e.g., Order Service)]
       │
       ├─► Product Verification ── (Wrapped in productCircuitBreaker.fire)
       ├─► Save Order PENDING
       ├─► Payment Process ──── (Wrapped in paymentCircuitBreaker.fire)
       │                                     │
       │                                     ▼ (Outage?)
       │                             [Trips internal breaker]
       │                             [Marks order status FAILED]
       ▼
[Response received by Gateway Proxy]
       │
       ├─► 2xx/3xx/4xx ──► Calls cb._onSuccess()
       └─► 5xx / Error ──► Calls cb._onFailure()
       │
[Analytics Collector] (Increment requests counter in Redis)
       │
       ▼
[Final Client Response]
```

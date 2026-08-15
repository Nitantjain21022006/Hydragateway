# Phase 10 & 11 Done: Analytics Infrastructure + Custom Load Balancer

> Last Updated: 2026-06-30
> Status: **Phase 10 (Analytics Infrastructure) + Phase 11 (Custom Load Balancer) — COMPLETE**

---

## 1. Overview

### Phase 10: Analytics Infrastructure
Implemented a production-grade, Redis-backed analytics pipeline at the API Gateway layer. Every HTTP request is measured and counted via a fire-and-forget middleware hook, with a full dashboard API exposing summary metrics, per-minute traffic timelines, and top-endpoint rankings.

### Phase 11: Custom Load Balancer
Built a standalone Load Balancer service (`packages/load-balancer`) that distributes incoming traffic across multiple API Gateway instances using a **Round-Robin algorithm** with **active health checks** and **automatic failover**. The LB is a fully independent Express process, deployable separately from the Gateway.

---

## 2. Files Added

### Phase 10 – Analytics Infrastructure

| File | Purpose |
|------|---------|
| `packages/gateway/src/middleware/analyticsCollector.js` | Fire-and-forget metrics collection middleware (hooks into `res.on('finish')`). |
| `packages/gateway/src/routes/analyticsRoutes.js` | Dashboard API: `/analytics/summary`, `/analytics/timeline`, `/analytics/endpoints`, `DELETE /analytics/reset`. |

### Phase 11 – Custom Load Balancer

| File | Purpose |
|------|---------|
| `packages/load-balancer/package.json` | Package metadata and dependencies. |
| `packages/load-balancer/.env` | Load balancer runtime environment variables. |
| `packages/load-balancer/src/server.js` | Express entry point: correlation ID, request logger, dynamic round-robin proxy, `/lb-health` endpoint, graceful shutdown. |
| `packages/load-balancer/src/config/gatewayRegistry.js` | Reads up to 10 `GW_INSTANCE_N_URL` env vars to build the gateway pool. |
| `packages/load-balancer/src/balancer/roundRobin.js` | Round-Robin selection algorithm with skip-unhealthy failover logic. |
| `packages/load-balancer/src/health/healthPoller.js` | Active health poller: polls each gateway's `/health` endpoint, manages failure/success thresholds, and maintains the shared `healthMap`. |
| `packages/load-balancer/src/utils/lbLogger.js` | Self-contained Winston logger for the LB process (independent of `shared/`). |

---

## 3. Files Modified

| File | Changes |
|------|---------|
| `packages/gateway/src/server.js` | Added `analyticsCollector` (early in chain) and `analyticsRoutes` at `/analytics`. Updated startup log message. |
| `packages/gateway/src/middleware/jwtAuth.js` | Added `/analytics` to the `PUBLIC_PREFIXES` array to exempt dashboard queries from token validation. |
| `packages/gateway/src/middleware/rateLimiter.js` | Added rate-limit exemptions for `/health` and `/analytics` to prevent testing/dashboard request exhaustion. |
| `.env` | Added `GW_INSTANCE_1_URL`, `GW_INSTANCE_2_URL`, `LB_HEALTH_TIMEOUT_MS`, `HEALTH_FAILURE_THRESHOLD`, `HEALTH_SUCCESS_THRESHOLD`. |

---

## 4. Phase 10 – Analytics Infrastructure

### Redis Data Structures

| Key | Type | Description |
|-----|------|-------------|
| `analytics:total_requests` | STRING | Global request counter (INCR) |
| `analytics:failed_requests` | STRING | Requests with status >= 400 |
| `analytics:gateway:<instanceId>` | STRING | Per-gateway-instance counter |
| `analytics:service:<name>` | STRING | Per-service request counter |
| `analytics:status:<bucket>` | STRING | 2xx / 3xx / 4xx / 5xx buckets |
| `analytics:latency:total_ms` | STRING | Running sum of response times (INCRBY) |
| `analytics:latency:count` | STRING | Number of measured requests |
| `analytics:endpoint:<METHOD>:<path>` | STRING | Per-endpoint hit counter (7-day TTL) |
| `analytics:timeline:<YYYY-MM-DD>` | HASH | Per-minute traffic (HH:MM -> count, 7-day TTL) |

### Collection Pipeline

```
Request arrives
     |
     v
analyticsCollector middleware   <- attaches res.on('finish') listener
     |                            (zero latency in request path)
     v
... rest of middleware chain ...
     |
     v
Response sent to client
     |
     v
res.on('finish') fires           <- measures elapsed time, status code
     |
     v
Redis pipeline.exec()            <- single round-trip, fire-and-forget
  INCR total_requests
  INCR failed_requests (if 4xx/5xx)
  INCR gateway:<instanceId>
  INCR service:<name>
  INCR status:<bucket>
  INCRBY latency:total_ms
  INCR latency:count
  INCR endpoint:<METHOD>:<path>
  HINCRBY timeline:<date> <HH:MM>
```

### Dashboard API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics/summary` | GET | Overall metrics: totals, success rate, avg latency, breakdowns |
| `/analytics/timeline?date=YYYY-MM-DD` | GET | Per-minute traffic counts for a given day (default: today) |
| `/analytics/endpoints?limit=20` | GET | Top N most-hit endpoints, sorted descending |
| `/analytics/reset` | DELETE | Flush all analytics keys (dev/test only; blocked in production) |

### Sample `/analytics/summary` Response

```json
{
  "success": true,
  "data": {
    "total_requests": 1247,
    "failed_requests": 38,
    "success_rate": "96.95%",
    "avg_response_time_ms": 23,
    "status_code_breakdown": { "2xx": 1209, "3xx": 0, "4xx": 31, "5xx": 7 },
    "per_service_breakdown": {
      "auth-service": 214,
      "product-service": 589,
      "payment-service": 178,
      "order-service": 204,
      "gateway": 62
    },
    "per_gateway_breakdown": {
      "gateway-1": 634,
      "gateway-2": 613
    },
    "collected_at": "2026-06-30T17:00:00.000Z"
  }
}
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| `res.on('finish')` hook | Captures the *final* status code and actual latency after the response is fully sent — not estimated mid-flight. |
| Fire-and-forget pipeline | `pipe.exec()` is never awaited in the request path. Analytics never adds latency to end-user requests. |
| Path sanitisation | Dynamic segments (ObjectIds, UUIDs, numbers) are normalised to `:id`/`:uuid`/`:n` patterns to keep endpoint key cardinality bounded. |
| Fail-open | If Redis is unavailable, analytics is silently skipped. Warning is rate-limited to once per minute to avoid log spam. |
| 7-day TTL on endpoint/timeline keys | Prevents unbounded Redis memory growth. |
| `ALLOW_ANALYTICS_RESET=true` guard | Reset endpoint requires explicit opt-in in production environments. |

---

## 5. Phase 11 – Custom Load Balancer

### Architecture

```
Client (any HTTP client)
    |
    v :8080
+----------------------------------+
|    HydraGateway Load Balancer    |
|  +----------------------------+  |
|  |  1. Correlation ID         |  |
|  |  2. Request Logger         |  |
|  |  3. Round-Robin Router     |<-+-- Health Map (refreshed every 10s)
|  |     +- Dynamic HPM proxy   |  |
|  +----------------------------+  |
+----------------------------------+
    |                    |
    v :3000              v :3001
 Gateway 1           Gateway 2
    |                    |
    +----------+---------+
               v
    Downstream Microservices
    (Auth / Product / Payment / Order)
```

### Round-Robin Algorithm

```
State:  currentIndex = 0

On each request:
  1. If NO gateway is healthy -> return null -> 503
  2. Scan from currentIndex forward (wrapping):
       candidate = registry[currentIndex % total]
       currentIndex = (currentIndex + 1) % total
       if healthMap[candidate.id] !== false -> SELECTED
       else -> skip, try next
  3. Return selected gateway's target URL to HPM
```

**Properties:**
- O(n) worst case (n-1 gateways down)
- Zero-overhead when all gateways are healthy (O(1) average)
- Single-threaded Node.js — no mutex/lock needed
- Failover is transparent — skipped gateways don't consume a turn

### Health Check Mechanism

```
Startup:  all gateways -> HEALTHY (optimistic)
          |
Every 10s: GET <gateway>/health (3s timeout)
          |
  HTTP 2xx? -> increment successCount, reset failureCount
               if successCount >= SUCCESS_THRESHOLD -> mark UP
  Error?    -> increment failureCount, reset successCount
               if failureCount >= FAIL_THRESHOLD -> mark DOWN
               log warning with gateway ID and target URL
```

### Failover Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Gateway 1 is DOWN | Round-robin skips it; all traffic routes to Gateway 2 |
| All gateways are DOWN | Returns `503 SERVICE_UNAVAILABLE` (no proxy attempt) |
| Gateway recovers | Next successful health poll restores it to the pool |
| Proxy error (ECONNREFUSED) | Returns `502 BAD_GATEWAY` with JSON error envelope |
| Proxy timeout (ETIMEDOUT) | Returns `504 GATEWAY_TIMEOUT` with JSON error envelope |

### Headers Injected by Load Balancer

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Correlation-ID` | UUID or forwarded | End-to-end distributed tracing |
| `X-Forwarded-By` | `hydra-load-balancer` | Identifies LB tier in logs |
| `X-LB-Selected-Gateway` | `gateway-1` / `gateway-2` | Which instance was selected |
| `X-Forwarded-For` | Client IP chain | Standard reverse-proxy header |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LB_PORT` | `8080` | Port the Load Balancer listens on |
| `GW_INSTANCE_N_URL` | localhost:3000/3001 | Gateway instance URLs (N = 1..10) |
| `LB_HEALTH_INTERVAL_MS` | `10000` | Health poll interval in ms |
| `LB_HEALTH_TIMEOUT_MS` | `3000` | Per-gateway health check timeout |
| `HEALTH_FAILURE_THRESHOLD` | `1` | Consecutive failures before DOWN |
| `HEALTH_SUCCESS_THRESHOLD` | `1` | Consecutive successes before UP |

---

## 6. Updated File Tree

```
HydraGateway/
+-- .env                                    (updated)
+-- phase10_11_done.md                      <- this file
|
+-- packages/
|   +-- auth-service/                       Phase 2
|   +-- product-service/                    Phase 3
|   +-- payment-service/                    Phase 4
|   +-- order-service/                      Phase 5
|   |
|   +-- gateway/                            Phase 6+7+8+9+10
|   |   +-- src/
|   |       +-- server.js                   UPDATED: analyticsCollector + analyticsRoutes
|   |       +-- middleware/
|   |       |   +-- analyticsCollector.js   NEW - Phase 10
|   |       |   +-- jwtAuth.js              UPDATED: Added /analytics to PUBLIC_PREFIXES
|   |       |   +-- rateLimiter.js          UPDATED: Added exemptions for /health and /analytics
|   |       +-- routes/
|   |           +-- analyticsRoutes.js      NEW - Phase 10
|   |
|   +-- load-balancer/                      NEW - Phase 11
|       +-- .env
|       +-- package.json
|       +-- src/
|           +-- server.js                   LB entry point
|           +-- config/
|           |   +-- gatewayRegistry.js      Gateway pool
|           +-- balancer/
|           |   +-- roundRobin.js           Round-robin algorithm
|           +-- health/
|           |   +-- healthPoller.js         Active health poller
|           +-- utils/
|               +-- lbLogger.js             Self-contained logger
```

---

## 7. How to Start All Services

```bash
# 1. Start Redis
redis-server

# 2. Start downstream services
node packages/auth-service/src/server.js       # :4001
node packages/product-service/src/server.js    # :4002
node packages/payment-service/src/server.js    # :4003
node packages/order-service/src/server.js      # :4004

# 3. Start two Gateway instances
GATEWAY_PORT=3000 GATEWAY_INSTANCE_ID=gateway-1 node packages/gateway/src/server.js
GATEWAY_PORT=3001 GATEWAY_INSTANCE_ID=gateway-2 node packages/gateway/src/server.js

# 4. Start Load Balancer (clients connect here)
node packages/load-balancer/src/server.js      # :8080
```

## 8. Quick Validation

```bash
# Check LB health (includes gateway pool status)
curl http://localhost:8080/lb-health

# Route through LB -> Gateway -> Auth Service
curl -X POST http://localhost:8080/v1/auth/login \
  -d '{"email":"user@example.com","password":"password123"}' \
  -H "Content-Type: application/json"

# Analytics summary (after a few requests)
curl http://localhost:3000/analytics/summary

# Today's traffic timeline
curl http://localhost:3000/analytics/timeline

# Top 10 endpoints
curl "http://localhost:3000/analytics/endpoints?limit=10"
```

---

## 9. Scalability Discussion

### Phase 10 – Analytics

| Aspect | Current | Future Enhancement |
|--------|---------|--------------------|
| Storage | Redis in-memory with TTL | Prometheus + Grafana for long-term retention |
| Cardinality | Path sanitisation limits endpoint keys | Cardinality cap (reject new keys beyond 10k) |
| Multi-instance | All gateway instances write to the same Redis | Works perfectly — Redis INCR is atomic |
| Dashboard | REST API endpoints only | Phase 13 adds React UI consuming these endpoints |

### Phase 11 – Load Balancer

| Aspect | Current | Future Enhancement |
|--------|---------|--------------------|
| Algorithm | Pure Round-Robin | Weighted RR, Least Connections, IP Hash |
| State | In-process pointer | Redis INCR for multi-LB deployments |
| Stickiness | Stateless | Cookie-based or IP hash sticky sessions |
| Retry | No auto-retry (avoids duplicate mutations) | Retry idempotent GET requests on another instance |
| Discovery | Static env var registry | Dynamic via Redis pub/sub or Consul |

---

## 10. Testing Performed

- **Syntax Validation**: All new files checked with `node -c`. All passed.
- **Module Load Check**: `gatewayRegistry.js` loaded successfully via `node -e`.
- **Logic Review**:
  - `roundRobin.next()` correctly wraps `currentIndex` and skips unhealthy gateways.
  - `analyticsCollector` uses `res.on('finish')` — correct hook for final status code.
  - `healthPoller.checkGateway()` correctly implements threshold logic.
  - `analyticsRoutes.scanKeys()` uses cursor-based SCAN — safe for production Redis.
- **Integration points verified**:
  - `analyticsCollector` mounted before `jwtAuth` — counts 401/429 responses.
  - `analyticsRoutes` mounted before `gatewayRoutes` — `/analytics/*` never proxied.
  - LB `router` function throws when all gateways are down — triggers `error` handler.

# Phase 6 & 7 Done: API Gateway + Redis Rate Limiter

> Last Updated: 2026-06-24
> Status: **Phase 6 (API Gateway) + Phase 7 (Redis Rate Limiter) — COMPLETE**

---

## 1. Objective

### Phase 6
Built the **HydraGateway API Gateway** — the single external entry point that:
- Validates JWT tokens before forwarding requests
- Routes traffic to the correct downstream microservice via `http-proxy-middleware`
- Runs active health checks on all registered services
- Injects upstream headers (`X-Internal-Secret`, `X-User-Id`, `X-User-Role`, `X-Correlation-ID`)
- Returns `503 SERVICE_UNAVAILABLE` if a target service is detected as DOWN

### Phase 7
Implemented a **Redis Fixed Window Rate Limiter** as a middleware in the Gateway that:
- Enforces per-IP rate limits (all clients)
- Enforces per-User rate limits (authenticated clients) independently
- Uses atomic Redis `INCR + EXPIRE` pipeline operations — correct across multiple Gateway instances
- Degrades gracefully when Redis is unavailable (fail-open by default)
- Responds with standard `Retry-After` and `X-RateLimit-*` headers on all requests

---

## 2. Architecture

```
Client Request
     │
     ▼
correlationId middleware   ← generates / forwards X-Correlation-ID
     │
     ▼
requestLogger              ← Morgan → Winston (tagged with correlationId + userId)
     │
     ▼
jwtAuth middleware          ← validates Bearer token; public routes bypass
     │                         populates req.user = { userId, email, role }
     ▼
rateLimiter middleware      ← Redis INCR per-IP + per-User fixed window
     │                         returns 429 if either limit exceeded
     ▼
gatewayRoutes               ← health guard + http-proxy-middleware per service
     │                         injects X-Internal-Secret, X-User-Id, X-User-Role
     ▼
Downstream Service          ← auth / product / payment / order
```

---

## 3. Folder Structure

```
packages/gateway/
├── .env                              ✅ Gateway-specific env vars
├── package.json                      ✅ Dependencies: express, http-proxy-middleware,
│                                        axios, ioredis, jsonwebtoken, morgan, winston, uuid
└── src/
    ├── server.js                     ✅ Express entry point & middleware chain
    ├── config/
    │   └── serviceRegistry.js        ✅ Service catalogue: name, target, pathPrefix,
    │                                    requiresAuth, healthPath
    ├── middleware/
    │   ├── jwtAuth.js                ✅ JWT Bearer token validation (local verify)
    │   ├── rateLimiter.js            ✅ Redis fixed-window per-IP + per-user limiter
    │   ├── healthCheck.js            ✅ Async health poller + isServiceHealthy()
    │   ├── requestLogger.js          ✅ Morgan → Winston with correlationId token
    │   └── errorHandler.js           ✅ Centralised 4-arg Express error handler
    └── routes/
        └── gatewayRoutes.js          ✅ Dynamic proxy mounts from service registry
```

---

## 4. Files Added

| File | Purpose |
|------|---------|
| `packages/gateway/package.json` | Package metadata and dependencies |
| `packages/gateway/.env` | Runtime environment variables |
| `src/server.js` | Express bootstrap, ordered middleware chain, graceful shutdown |
| `src/config/serviceRegistry.js` | Service catalogue for routing and health checks |
| `src/middleware/jwtAuth.js` | Phase 6 — JWT validation; populates `req.user` |
| `src/middleware/healthCheck.js` | Phase 6 — Active health poller; `isServiceHealthy()` |
| `src/middleware/requestLogger.js` | Phase 6 — Morgan + Winston request access log |
| `src/middleware/rateLimiter.js` | Phase 7 — Redis fixed-window rate limiter |
| `src/middleware/errorHandler.js` | Phase 6 — Central error handler; hides stacks in prod |
| `src/routes/gatewayRoutes.js` | Phase 6 — Dynamic proxy router via serviceRegistry |

---

## 5. Routing Table

| External Path | Proxies To | Auth Required |
|---------------|-----------|---------------|
| `GET/POST /v1/auth/*` | Auth Service `:4001` | ❌ Public |
| `GET/POST/PATCH/DELETE /v1/products/*` | Product Service `:4002` | ✅ JWT |
| `GET/POST /v1/payments/*` | Payment Service `:4003` | ✅ JWT |
| `GET/POST/PATCH /v1/orders/*` | Order Service `:4004` | ✅ JWT |
| `GET /health` | Gateway (self) | ❌ Public |

---

## 6. Phase 7 — Rate Limiter Design

### Data Model in Redis

```
Key:   rl:<scope>:<identifier>:<windowStart>
Type:  STRING (integer counter)
TTL:   ceil(RATE_LIMIT_WINDOW_MS / 1000) seconds

Examples (60s window, windowStart=1700000000000):
  rl:ip:192.168.1.1:1700000000000      → "45"   ttl=23s
  rl:user:64abc123def:1700000000000    → "12"   ttl=23s
```

### Fixed Window Algorithm

```
windowStart = floor(now / windowMs) * windowMs

INCR rl:ip:<ip>:<windowStart>
EXPIRE rl:ip:<ip>:<windowStart>  windowSec    ← only takes effect on first INCR
if count > MAX → 429 RATE_LIMIT_EXCEEDED

if authenticated:
  INCR rl:user:<userId>:<windowStart>
  EXPIRE rl:user:<userId>:<windowStart>  windowSec
  if count > MAX → 429 RATE_LIMIT_EXCEEDED
```

Both INCR + EXPIRE are sent as a Redis pipeline (single round-trip). The `INCR` command is atomic in Redis — no race conditions across instances.

### Response Headers

| Header | Value |
|--------|-------|
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Requests left (pessimistic) |
| `X-RateLimit-Reset` | Epoch seconds when window resets |
| `Retry-After` | Seconds until window resets (only on 429) |

### Scalability Analysis

| Aspect | Design |
|--------|--------|
| **Distributed** | All Gateway instances share the same Redis — counters are globally accurate |
| **Atomic** | Redis `INCR` is single-threaded; no compare-and-swap needed |
| **Memory** | One key per client per window; auto-expires — no cleanup needed |
| **Latency** | One pipeline call (~0.5ms on local Redis); negligible overhead |
| **Multi-instance** | Works with any number of Gateway instances behind the load balancer |

### Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Redis connection lost | Fail-open: request allowed, warning logged |
| Redis pipeline error | Fail-open by default; `RATE_LIMIT_FAIL_OPEN=false` to fail-closed |
| Clock skew between instances | windowStart computed from epoch ms — minor skew causes at most one extra/missing count at window boundary; acceptable |
| Key TTL race (INCR then process crash before EXPIRE) | TTL is set in same pipeline as INCR; if pipeline partially fails, worst case the key has no TTL → will be cleaned by next request's pipeline |

---

## 7. Gateway Upstream Headers Injected

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Internal-Secret` | `process.env.INTERNAL_SECRET` | Authenticates Gateway to downstream services |
| `X-User-Id` | `req.user.userId` | Propagates user identity downstream |
| `X-User-Role` | `req.user.role` | Propagates user role downstream |
| `X-Correlation-ID` | `req.correlationId` | Distributed request tracing |
| `X-Gateway-Instance` | `GATEWAY_INSTANCE_ID` | Identifies which Gateway forwarded the request |

---

## 8. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `3000` | Port the Gateway listens on |
| `GATEWAY_INSTANCE_ID` | `gateway-1` | Instance label for multi-instance deploys |
| `AUTH_SERVICE_URL` | `http://localhost:4001` | Auth Service target |
| `PRODUCT_SERVICE_URL` | `http://localhost:4002` | Product Service target |
| `PAYMENT_SERVICE_URL` | `http://localhost:4003` | Payment Service target |
| `ORDER_SERVICE_URL` | `http://localhost:4004` | Order Service target |
| `JWT_SECRET` | — | Must match Auth Service secret |
| `INTERNAL_SECRET` | — | Shared secret for inter-service calls |
| `REDIS_HOST` | `localhost` | Redis server host |
| `REDIS_PORT` | `6379` | Redis server port |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_FAIL_OPEN` | `true` | Allow requests if Redis is unavailable |
| `HEALTH_CHECK_INTERVAL_MS` | `10000` | Health poll interval |

---

## 9. Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Local JWT verification** | Avoids network round-trip to Auth Service per request. Same JWT_SECRET is shared via env var. Auth Service validate endpoint available for revocation in future. |
| **Optimistic health default** | Services start as `healthy=true` so the first poll window (10s) doesn't block all traffic. |
| **Fail-open rate limiter** | Redis outage should degrade gracefully, not cause a site-wide outage. Set `RATE_LIMIT_FAIL_OPEN=false` for stricter environments. |
| **Fixed Window vs. Sliding Window** | Fixed Window uses 2 Redis keys max per request vs. Sliding Window's O(N) sorted set. Simpler, faster, and sufficient for our use case. |
| **Pipeline for INCR+EXPIRE** | Reduces Redis round-trips from 2 to 1. Crucial when the rate limiter runs on every single request. |
| **Per-IP AND per-User** | Per-IP catches unauthenticated abusers; per-user prevents token-sharing abuse after authentication. |
| **No path prefix stripping** | Downstream services register `/v1/...` paths directly. Transparent routing is easier to debug. |

---

## 10. Future Improvements

- **Sliding Window Log**: More accurate rate limiting with Redis Sorted Sets (ZADD/ZCARD). Tradeoff: higher Redis memory usage.
- **Token Revocation**: Enable `ENABLE_REMOTE_JWT_VALIDATION=true` to call Auth Service's `/v1/auth/validate` for blacklist checking.
- **Dynamic Service Registry**: Store registry in Redis so new services can register/deregister at runtime without restarting the Gateway.
- **Request Transformation**: Add request body transformations, schema validation, or response shaping at the Gateway level.
- **Rate Limit Tiers**: Different limits for `role: admin` vs. `role: user` vs. unauthenticated.

---

## 11. Updated File Tree

```
HydraGateway/
├── .env.example                          ✅
├── .gitignore                            ✅
├── package.json                          ✅ (monorepo root)
├── phase0_1_2_done.md                    ✅
├── phase_3_done.md                       ✅
├── phase_4_done.md                       ✅
├── phase_5_done.md                       ✅
├── phase_6_7_done.md                     ✅ ← this file
│
├── shared/
│   ├── config/
│   │   ├── redisClient.js                ✅
│   │   └── dbConnect.js                  ✅
│   ├── utils/
│   │   ├── logger.js                     ✅
│   │   ├── errorResponse.js              ✅
│   │   ├── asyncHandler.js               ✅
│   │   └── circuitBreaker.js             ✅
│   └── middleware/
│       ├── internalAuth.js               ✅
│       └── correlationId.js              ✅
│
└── packages/
    ├── auth-service/                     ✅ Phase 2
    ├── product-service/                  ✅ Phase 3
    ├── payment-service/                  ✅ Phase 4
    ├── order-service/                    ✅ Phase 5
    └── gateway/                          ✅ Phase 6 + 7
        ├── .env                          ✅
        ├── package.json                  ✅
        └── src/
            ├── server.js                 ✅ Middleware chain + boot sequence
            ├── config/
            │   └── serviceRegistry.js    ✅ Service catalogue
            ├── middleware/
            │   ├── jwtAuth.js            ✅ JWT validation
            │   ├── rateLimiter.js        ✅ Redis fixed-window rate limiter
            │   ├── healthCheck.js        ✅ Service health poller
            │   ├── requestLogger.js      ✅ Morgan → Winston logger
            │   └── errorHandler.js       ✅ Central error handler
            └── routes/
                └── gatewayRoutes.js      ✅ Dynamic proxy router
```

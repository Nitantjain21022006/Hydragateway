I need you to debug a Redis caching issue in my HydraGateway microservices project.

## Current Behaviour

1. `POST /v1/products` works correctly.
2. `GET /v1/products` returns the products successfully.
3. Gateway logs show:

```
[gateway-cache] info: [Cache] MISS: cache:products:all
```

4. Product Service is called and returns HTTP 200.
5. MongoDB returns the products successfully.
6. However, after the request completes, running:

```
KEYS *
```

in Redis (Memurai) does **not** show:

```
cache:products:all
```

or any similar cache key.

If I immediately send another `GET /v1/products`, Product Service is called again, indicating the response was never cached.

---

## Expected Behaviour

The first request should execute:

```
Redis GET cache:products:all
↓
MISS
↓
Call Product Service
↓
Receive response
↓
Redis SET cache:products:all
↓
Return response
```

The second request should execute:

```
Redis GET cache:products:all
↓
HIT
↓
Return cached response
```

without contacting Product Service.

---

## What I want you to inspect

Please inspect the complete caching flow and identify exactly where it breaks.

Specifically verify:

### 1. Cache Middleware

Locate the middleware responsible for product caching.

Check whether:

* Redis GET is executed.
* Redis SET is ever executed after a cache miss.
* The middleware returns the response before calling SET.
* The middleware monkey-patches `res.send()` or `res.json()` correctly.
* The response body is actually available when attempting to cache it.

---

### 2. Redis Client

Verify:

* Redis client connects successfully.
* `SET` commands succeed.
* No exceptions are swallowed.
* Any errors are logged.
* Connection is not read-only.

---

### 3. Response Flow

Trace the request from:

Gateway

↓

Cache Middleware

↓

Proxy

↓

Product Service

↓

Gateway

↓

Redis SET

↓

Client

Determine whether the response ever passes back through the cache middleware after proxying.

---

### 4. Proxy Middleware

If the Gateway uses `http-proxy-middleware`, verify whether the proxy streams the response directly to the client.

If so, determine whether the cache middleware can no longer intercept the response body.

Check whether `selfHandleResponse`, `responseInterceptor`, or similar mechanisms are required.

---

### 5. Cache Keys

Search the entire project for:

```
cache:products
```

```
products:all
```

```
cache:
```

```
redis.set(
```

```
client.set(
```

```
setEx(
```

```
SETEX
```

Confirm that the same key used for GET is also used for SET.

---

### 6. Configuration

Check whether caching is disabled by:

* environment variables
* feature flags
* middleware order
* conditional statements

Examples:

```
ENABLE_CACHE
CACHE_ENABLED
NODE_ENV
```

---

### 7. Middleware Order

Verify that the cache middleware executes before the proxy and that it has an opportunity to store the downstream response.

---

### 8. Logging

Add temporary debug logs showing:

* Redis GET key
* Redis GET result
* Entering cache miss branch
* Calling Product Service
* Response received
* Redis SET key
* Redis SET success
* Redis SET failure

---

## Final Deliverables

Please provide:

1. The exact root cause.
2. The file(s) responsible.
3. The specific line(s) causing the issue.
4. The corrected code.
5. An explanation of why `cache:products:all` never appears in Redis.
6. Confirmation that after the fix:

* First GET = Cache MISS
* Second GET = Cache HIT
* Product Service is skipped on the second request.

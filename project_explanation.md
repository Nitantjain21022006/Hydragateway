# 📂 HydraGateway – Project Files & Directories Explanation

This document provides a detailed, folder-by-folder and file-by-file breakdown of the **HydraGateway** monorepo workspace. The files are arranged in a **logical architectural order**: starting from global workspace structures, moving to shared utilities and middleware, followed by the entry API Gateway, and finally detailing the downstream business microservices.

---

## 🏗️ 1. Root Level Workspace Config

The root level manages package workspace routing, repository exclusions, environment parameter presets, and end-to-end orchestration tests.

*   **[package.json](file:///c:/Users/admin/Desktop/Projects/ProjectSec/package.json)**:
    *   **Purpose**: Defines the npm Workspaces configuration mapping all packages under `./packages/*`.
    *   **Details**: Allows shared dependency installation and exposes orchestrator startup scripts (e.g., `npm run dev:gateway`, `npm run dev:auth`) to run services individually.
*   **[.env.example](file:///c:/Users/admin/Desktop/Projects/ProjectSec/.env.example)**:
    *   **Purpose**: The master configuration template containing all database URIs, port configurations, cache lifetimes, rate limit windows, and application secrets.
*   **[.env](file:///c:/Users/admin/Desktop/Projects/ProjectSec/.env)**:
    *   **Purpose**: The active runtime environment file. Each service copies relevant parameters from this root file or reads them directly during dynamic startups.
*   **[.gitignore](file:///c:/Users/admin/Desktop/Projects/ProjectSec/.gitignore)**:
    *   **Purpose**: Prevents version-controlling sensitive files (`.env`), dependency folders (`node_modules`), logs (`logs/`), and database artifacts.
*   **[test-flow.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/test-flow.js)**:
    *   **Purpose**: The master end-to-end integration testing script.
    *   **Details**: Spawns all five microservice processes asynchronously, polls their `/health` routes, fires test HTTP queries through the Gateway, asserts compliance (Auth registration/login, Product CRUD, Order orchestration, Rate limiter activation), cleans up generated testing data, and terminates background processes gracefully.
*   **[test-services.log](file:///c:/Users/admin/Desktop/Projects/ProjectSec/test-services.log)**:
    *   **Purpose**: Output log generated during E2E test-flow execution, containing combined console outputs from all services.

---

## 📚 2. Shared Core Infrastructure (`shared/`)

This directory represents the system backbone. All code inside `shared/` is service-agnostic and is directly imported by the microservices using relative monorepo paths.

### ⚙️ Config Layer (`shared/config/`)
Handles low-level connections and client lifecycle management for the underlying database and cache.

*   **[dbConnect.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/config/dbConnect.js)**:
    *   **Purpose**: MongoDB connection factory using Mongoose.
    *   **Details**: Exports a connection function that takes a database URI, sets up connection pooling (configurable via `MONGO_POOL_SIZE`), listens to MongoDB events (`disconnected`, `error`), and exits the process gracefully if the initial connection fails.
*   **[redisClient.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/config/redisClient.js)**:
    *   **Purpose**: Singleton Redis driver factory using `ioredis`.
    *   **Details**: Provides an active connection with custom retry strategies (exponential back-off and retry limits) so that temporary Redis outages degrade gracefully instead of throwing unhandled process failures.

### 🛠️ Utilities Layer (`shared/utils/`)
Reusable utility classes and wrapper functions.

*   **[logger.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/utils/logger.js)**:
    *   **Purpose**: Winston logging instance builder.
    *   **Details**: Standardizes log structures. In development, it formats messages with colors on console stdout. In production, it formats messages into structured JSON and writes them into files inside a `logs/` directory, tagging every entry with its respective service identifier.
*   **[errorResponse.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/utils/errorResponse.js)**:
    *   **Purpose**: Application-wide error wrapper.
    *   **Details**: Defines the `AppError` class (which extends native `Error` and records HTTP status codes). Exports helper functions `sendError` and `sendSuccess` to guarantee that all microservices respond with a standardized JSON envelope:
        *   Success: `{ success: true, data: { ... } }`
        *   Failure: `{ success: false, error: { code, message, details } }`
*   **[asyncHandler.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/utils/asyncHandler.js)**:
    *   **Purpose**: Express router middleware controller helper.
    *   **Details**: Wraps asynchronous Express router functions. It catches promise rejections and forwards them to the Express error handler (`next(err)`), eliminating the need for repetitive `try/catch` blocks in controllers.
*   **[circuitBreaker.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/utils/circuitBreaker.js)**:
    *   **Purpose**: State machine implementing the Circuit Breaker pattern.
    *   **Details**: Protects inter-service communication by shifting states:
        *   `CLOSED`: Request proceeds normally.
        *   `OPEN`: Downstream service is failing; rejects incoming requests immediately with a 503 error to save resources.
        *   `HALF_OPEN`: Timeout elapsed; allows a single probe request to check if the downstream service has recovered.

### 🚦 Shared Middlewares (`shared/middleware/`)
Reusable Express middlewares shared across the services.

*   **[correlationId.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/middleware/correlationId.js)**:
    *   **Purpose**: Injects or propagates request correlation IDs.
    *   **Details**: Looks for an incoming `X-Correlation-ID` header. If missing, it generates a unique UUID and attaches it to the request and response objects. This correlation ID is passed to subsequent inter-service calls, enabling distributed tracing across log files.
*   **[internalAuth.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/middleware/internalAuth.js)**:
    *   **Purpose**: Secures inter-service REST calls.
    *   **Details**: Validates that incoming requests contain a header `X-Internal-Secret` matching the system configuration. Blocks external clients from calling internal endpoints (like Order calling Product/Payment).
*   **[requestLogger.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/shared/middleware/requestLogger.js)**:
    *   **Purpose**: Standardized HTTP request logger using Morgan.
    *   **Details**: Streams HTTP request details (IP, method, URL, status code, latency, user ID, correlation ID) into the Winston logger.

---

## 🔀 3. API Gateway Service (`packages/gateway/`)

The Gateway is the single point of entry. It exposes public health checking on `/health` and routes versioned routes to microservices.

### ⚙️ Configuration & Gateway Entry
*   **[package.json](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/package.json)**:
    *   **Purpose**: Manages Gateway dependencies: `http-proxy-middleware`, `axios`, `jsonwebtoken`, and rate limiter configurations.
*   **[.env](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/.env)**:
    *   **Purpose**: Service-specific environment values (Gateway Port, JWT secret key, rate limit windows, and downstream microservice target URLs).
*   **[src/server.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/server.js)**:
    *   **Purpose**: Entry point for the Gateway.
    *   **Details**: Mounts global middlewares, registers dynamic reverse-proxy routes, starts health checks, and handles graceful shutdowns on SIGINT/SIGTERM.
*   **[src/config/serviceRegistry.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/config/serviceRegistry.js)**:
    *   **Purpose**: Service registry catalog mapping route prefixes to target ports and authentication rules.
    *   **Details**: Used by the gateway router and health prober. For example, requests starting with `/v1/auth` do not require authentication, whereas `/v1/products` does.

### 🛡️ Gateway Middlewares
*   **[src/middleware/jwtAuth.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/middleware/jwtAuth.js)**:
    *   **Purpose**: Local JWT validation middleware.
    *   **Details**: Extracts Bearer token from the `Authorization` header, decodes and validates it using `jsonwebtoken` and the shared `JWT_SECRET`, and attaches `req.user` to the request object. Bypasses public routes.
*   **[src/middleware/rateLimiter.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/middleware/rateLimiter.js)**:
    *   **Purpose**: Redis-based rate limiting middleware.
    *   **Details**: Implements a fixed-window rate limiting strategy checking IP and User ID (if authenticated) using Redis pipelines. Attaches limit headers (`X-RateLimit-*`) and fails open if Redis goes down.
*   **[src/middleware/cacheMiddleware.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/middleware/cacheMiddleware.js)**:
    *   **Purpose**: Gateway-level caching for product endpoints.
    *   **Details**: Checks Redis for cached GET responses. On a miss, it intercepts downstream service payloads, caches them in Redis with a configurable TTL, and returns them to the client.
*   **[src/middleware/healthCheck.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/middleware/healthCheck.js)**:
    *   **Purpose**: Active health prober.
    *   **Details**: Periodically pings the `/health` endpoint of each service registered in `serviceRegistry.js` and caches their status. Prevents proxying to services that are down.
*   **[src/middleware/errorHandler.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/middleware/errorHandler.js)**:
    *   **Purpose**: Centralized gateway error handler formatting all gateway failures to match the standard API error payload.

### 🛣️ Routes
*   **[src/routes/gatewayRoutes.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/gateway/src/routes/gatewayRoutes.js)**:
    *   **Purpose**: Dynamic routing proxy mount layer.
    *   **Details**: Uses `http-proxy-middleware` to map incoming requests to downstream services based on `serviceRegistry.js`. Injects headers like `X-Correlation-ID`, `X-User-Id`, `X-User-Role`, and `X-Internal-Secret` into proxied requests.

---

## 🔐 4. Auth Service (`packages/auth-service/`)

Manages client user accounts, password security, and JWT sign-off.

*   **[package.json](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/auth-service/package.json)**:
    *   **Purpose**: Configures service dependencies like `bcryptjs` and `jsonwebtoken`.
*   **[src/server.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/auth-service/src/server.js)**:
    *   **Purpose**: Express entry point. Connects to MongoDB, configures middlewares, and starts the listener on port `4001`.
*   **[src/models/User.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/auth-service/src/models/User.js)**:
    *   **Purpose**: Defines the Mongoose Schema for user profiles.
    *   **Details**: Implements password hashing via `bcryptjs` in a pre-save hook, strips credentials on JSON serialization (`toJSON`), and registers a helper method (`comparePassword`) to check login attempts.
*   **[src/controllers/authController.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/auth-service/src/controllers/authController.js)**:
    *   **Purpose**: Contains controller handlers for `/register`, `/login`, `/me`, and `/validate`.
    *   **Details**: Generates JWT payloads upon successful logins and registrations.
*   **[src/routes/authRoutes.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/auth-service/src/routes/authRoutes.js)**:
    *   **Purpose**: Registers Auth Service endpoints. Includes validation middleware for request schemas.
*   **[src/middleware/validateRequest.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/auth-service/src/middleware/validateRequest.js)**:
    *   **Purpose**: Performs express-validation schema assertions, returning `422 Unprocessable Entity` on input error.
*   **[src/middleware/errorHandler.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/auth-service/src/middleware/errorHandler.js)**:
    *   **Purpose**: Catches Mongoose errors (duplicate keys, cast errors, validation errors) and returns formatted API responses.

---

## 📦 5. Product Service (`packages/product-service/`)

Manages the catalog database, provides items validation, and issues cache clearing calls to Redis.

*   **[package.json](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/product-service/package.json)**:
    *   **Purpose**: Configures service dependencies (Mongoose, Express).
*   **[src/server.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/product-service/src/server.js)**:
    *   **Purpose**: Express entry point. Initializes database connections and logs startup info on port `4002`.
*   **[src/models/Product.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/product-service/src/models/Product.js)**:
    *   **Purpose**: Defines the Mongoose Schema for products.
    *   **Details**: Configures text search indexes on name and description, and sets up soft delete tracking using `isActive` (default `true`).
*   **[src/services/productService.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/product-service/src/services/productService.js)**:
    *   **Purpose**: Encapsulates DB product operations. Contains methods for listing, creating, fetching, updating, and soft-deleting products.
*   **[src/controllers/productController.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/product-service/src/controllers/productController.js)**:
    *   **Purpose**: Handles product HTTP routes.
    *   **Details**: Triggers database changes through the service layer and invalidates Redis keys (`cache:products:all` and `cache:products:<id>`) on updates, deletions, or new insertions.
*   **[src/routes/productRoutes.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/product-service/src/routes/productRoutes.js)**:
    *   **Purpose**: Registers product REST paths. Secures mutation endpoints (`POST`, `PATCH`, `DELETE`) with validation rules.
*   **[src/middleware/errorHandler.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/product-service/src/middleware/errorHandler.js)**:
    *   **Purpose**: Maps database errors to formatted JSON error envelopes.

---

## 💳 6. Payment Service (`packages/payment-service/`)

Processes credit card payments using simulations, logs outcomes, and tracks payments via UUID transaction identifiers.

*   **[package.json](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/package.json)**:
    *   **Purpose**: Service dependencies configuration.
*   **[src/server.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/src/server.js)**:
    *   **Purpose**: Express startup entry point. Connects Mongoose and launches HTTP listener on port `4003`.
*   **[src/models/Payment.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/src/models/Payment.js)**:
    *   **Purpose**: Mongoose Schema for transaction tracking.
    *   **Details**: Fields include user ID, order ID, amount, method, status (`PENDING`, `COMPLETED`, `FAILED`), and unique transaction UUID.
*   **[src/services/paymentService.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/src/services/paymentService.js)**:
    *   **Purpose**: Encapsulates payment logic.
    *   **Details**: Implements an asynchronous payment simulator (90% success probability) with a 1-second processing latency.
*   **[src/controllers/paymentController.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/src/controllers/paymentController.js)**:
    *   **Purpose**: Handles POST requests to `/v1/payments` and GET requests for payment history and status.
*   **[src/routes/paymentRoutes.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/src/routes/paymentRoutes.js)**:
    *   **Purpose**: Defines HTTP routing rules for payment operations.
*   **[src/middleware/validateRequest.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/src/middleware/validateRequest.js)**:
    *   **Purpose**: Validates fields like amount format and supported payment channels (e.g. `CREDIT_CARD`).
*   **[src/middleware/errorHandler.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/payment-service/src/middleware/errorHandler.js)**:
    *   **Purpose**: Standardizes Payment Service errors.

---

## 🛒 7. Order Service (`packages/order-service/`)

Acts as an orchestrator, managing the lifecycle of customer orders and coordinating with the Product and Payment services.

*   **[package.json](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/package.json)**:
    *   **Purpose**: Service dependencies configuration.
*   **[src/server.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/src/server.js)**:
    *   **Purpose**: Express entry point. Connects to MongoDB and starts listening on port `4004`.
*   **[src/models/Order.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/src/models/Order.js)**:
    *   **Purpose**: Defines the Mongoose Schema for orders.
    *   **Details**: Tracks user IDs, shipping addresses, payment status, order items (product ID, name, price, quantity), and order status (`PENDING`, `PAID`, `FAILED`, `PROCESSING`, `SHIPPED`, `DELIVERED`).
*   **[src/services/orderService.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/src/services/orderService.js)**:
    *   **Purpose**: The central microservices orchestrator.
    *   **Details**: Communicates with the Product Service (calling `GET /v1/products/:id`) to validate items and prices, saves the initial order status as `PENDING`, calls the Payment Service (`POST /v1/payments`) to charge the customer, and updates the order status to `PAID` or `FAILED` based on the response.
*   **[src/controllers/orderController.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/src/controllers/orderController.js)**:
    *   **Purpose**: Handles order routes like placement, retrieving details, and listing order history.
*   **[src/routes/orderRoutes.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/src/routes/orderRoutes.js)**:
    *   **Purpose**: Defines order REST routes.
*   **[src/middleware/validateRequest.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/src/middleware/validateRequest.js)**:
    *   **Purpose**: Validates incoming order placement payloads.
*   **[src/middleware/errorHandler.js](file:///c:/Users/admin/Desktop/Projects/ProjectSec/packages/order-service/src/middleware/errorHandler.js)**:
    *   **Purpose**: Standardizes Order Service errors.

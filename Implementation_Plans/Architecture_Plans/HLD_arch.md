# HydraGateway – High-Level Architecture Diagram

## 1. Full System Architecture

```mermaid
graph TB
    subgraph CLIENT["🌐 Client Layer"]
        C1["Browser / Mobile App"]
        C2["API Client / cURL"]
    end

    subgraph LB["⚖️ Load Balancer · Port 8080"]
        LB1["Round-Robin Algorithm"]
        LB2["Health Check Prober"]
        LB3["Instance Registry"]
        LB1 --> LB2
        LB2 --> LB3
    end

    subgraph GW["🔀 API Gateway Layer · Ports 3000 / 3001"]
        GW1["Gateway Instance 1"]
        GW2["Gateway Instance 2"]

        subgraph MW["Middleware Chain"]
            M1["correlationId"]
            M2["Morgan Logger"]
            M3["JWT Validator"]
            M4["Rate Limiter"]
            M5["Cache Layer"]
            M6["Circuit Breaker"]
            M7["Proxy Router"]
            M1 --> M2 --> M3 --> M4 --> M5 --> M6 --> M7
        end
    end

    subgraph REDIS["🔴 Redis Infrastructure · Port 6379"]
        R1["Rate Limit Counters\n(Sliding Window / Sorted Sets)"]
        R2["Response Cache\n(GET /products)"]
        R3["Analytics Metrics\n(HINCRBY + Sorted Sets)"]
    end

    subgraph SERVICES["⚙️ Microservices Layer"]
        AUTH["🔐 Auth Service\nPort 4001\n\nRegister / Login / Logout\nJWT Issue & Validate\nbcrypt + Mongoose"]
        PROD["📦 Product Service\nPort 4002\n\nCRUD Products\nService Layer\nRedis Cache Invalidation"]
        PAY["💳 Payment Service\nPort 4003\n\nSimulated Payment\nTransaction Tracking\nCircuit Breaker Target"]
        ORD["🛒 Order Service\nPort 4004\n\nCreate & View Orders\nOrchestrates Product + Payment"]
    end

    subgraph DB["🗄️ MongoDB Databases"]
        DB1[("hydra_auth\nUsers Collection")]
        DB2[("hydra_products\nProducts Collection")]
        DB3[("hydra_payments\nTransactions Collection")]
        DB4[("hydra_orders\nOrders Collection")]
    end

    subgraph SHARED["📚 Shared Library"]
        S1["redisClient.js"]
        S2["dbConnect.js"]
        S3["logger.js\n(Winston Factory)"]
        S4["errorResponse.js"]
        S5["asyncHandler.js"]
        S6["circuitBreaker.js\n(FSM: CLOSED→OPEN→HALF_OPEN)"]
        S7["internalAuth.js\n(X-Internal-Secret)"]
        S8["correlationId.js\n(X-Correlation-ID)"]
    end

    subgraph DASH["📊 Monitoring Dashboard · Port 5173"]
        D1["React + Tailwind"]
        D2["MetricsCard"]
        D3["ServiceHealth"]
        D4["RequestChart"]
        D5["ResponseTimeChart"]
    end

    subgraph INFRA["🐳 Docker Infrastructure"]
        DOC1["docker-compose.yml\n(hydra-net bridge network)"]
        DOC2["Per-service Dockerfiles"]
    end

    %% Request Flow
    C1 & C2 -->|HTTP Request| LB
    LB -->|Distribute| GW1 & GW2
    GW1 & GW2 --- MW
    MW -->|Proxy to service| AUTH
    MW -->|Proxy to service| PROD
    MW -->|Proxy to service| PAY
    MW -->|Proxy to service| ORD

    %% Redis connections
    GW1 & GW2 <-->|Rate check| R1
    GW1 & GW2 <-->|Cache hit/miss| R2
    GW1 & GW2 -->|Record metrics| R3

    %% DB connections
    AUTH --> DB1
    PROD --> DB2
    PAY --> DB3
    ORD --> DB4

    %% Inter-service calls
    ORD -->|HTTP + X-Internal-Secret| PROD
    ORD -->|HTTP + X-Internal-Secret| PAY

    %% Product cache invalidation
    PROD -->|DELETE cache key on write| R2

    %% Dashboard reads analytics
    D1 -->|REST / SSE| R3

    %% Shared library usage
    SHARED -.->|used by| AUTH
    SHARED -.->|used by| PROD
    SHARED -.->|used by| PAY
    SHARED -.->|used by| ORD
    SHARED -.->|used by| GW1
    SHARED -.->|used by| GW2

    %% Docker wraps everything
    INFRA -.->|containerises| LB
    INFRA -.->|containerises| GW
    INFRA -.->|containerises| SERVICES
    INFRA -.->|containerises| REDIS
    INFRA -.->|containerises| DB
```

---

## 2. Request Flow – Happy Path

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant LB as Load Balancer<br/>:8080
    participant GW as API Gateway<br/>:3000
    participant Redis
    participant Auth as Auth Service<br/>:4001
    participant Product as Product Service<br/>:4002
    participant Order as Order Service<br/>:4004
    participant Payment as Payment Service<br/>:4003
    participant MongoDB

    Client->>LB: POST /v1/auth/login
    LB->>GW: Round-robin forward + X-Correlation-ID injected

    GW->>GW: correlationId middleware
    GW->>GW: Morgan logger
    GW->>GW: JWT middleware (public route – skip)
    GW->>Redis: Rate limit check (sliding window)
    Redis-->>GW: OK (within limit)
    GW->>Auth: Proxy request

    Auth->>MongoDB: findOne({ email }) + password compare
    MongoDB-->>Auth: User document
    Auth-->>GW: 200 { token, user }
    GW-->>LB: Response with X-Correlation-ID
    LB-->>Client: 200 JWT Token

    Note over Client,Payment: --- Authenticated Request ---

    Client->>LB: POST /v1/orders (with JWT)
    LB->>GW: Forward

    GW->>GW: JWT Validator middleware
    GW->>Redis: Rate limit check
    Redis-->>GW: OK
    GW->>Order: Proxy request

    Order->>Product: GET /v1/products/:id (X-Internal-Secret)
    Product->>MongoDB: findById(productId)
    MongoDB-->>Product: Product document
    Product-->>Order: Product data

    Order->>Payment: POST /v1/payments (X-Internal-Secret)
    Payment->>MongoDB: Insert transaction
    MongoDB-->>Payment: Transaction created
    Payment-->>Order: Payment confirmed

    Order->>MongoDB: Insert order record
    MongoDB-->>Order: Order saved
    Order-->>GW: 201 Order created
    GW->>Redis: Increment metrics counters
    GW-->>Client: 201 Order response
```

---

## 3. Circuit Breaker State Machine

```mermaid
stateDiagram-v2
    [*] --> CLOSED

    CLOSED --> CLOSED : Request succeeds
    CLOSED --> OPEN : Failure count ≥ threshold (default 5)

    OPEN --> OPEN : Request arrives before timeout\n→ Reject immediately (503)
    OPEN --> HALF_OPEN : Timeout elapsed\n→ Allow ONE probe request

    HALF_OPEN --> CLOSED : Probe succeeds\n→ Reset failure count
    HALF_OPEN --> OPEN : Probe fails\n→ Re-trip, reset timer
```

---

## 4. Redis Data Layer Design

```mermaid
graph LR
    subgraph RateLimit["Rate Limiting (Phase 7)"]
        RL1["Key: rl:ip:{ip}:{window}\nType: Sorted Set\nScore: timestamp\nValue: request-id\n\nSliding window –\nZREMRANGEBYSCORE + ZADD + ZCARD"]
        RL2["Key: rl:user:{userId}:{window}\nSame pattern per user"]
    end

    subgraph Cache["Response Cache (Phase 8)"]
        C1["Key: cache:products:all\nType: String (JSON)\nTTL: 60s\n\nInvalidated on:\nPOST/PUT/DELETE /products"]
        C2["Key: cache:products:{id}\nType: String (JSON)\nTTL: 60s\n\nInvalidated on:\nPUT/DELETE /products/:id"]
    end

    subgraph Analytics["Analytics (Phase 10)"]
        A1["Key: metrics:requests:total\nType: String (INCR)"]
        A2["Key: metrics:requests:failed\nType: String (INCR)"]
        A3["Key: metrics:service:{name}:calls\nType: Hash (HINCRBY)"]
        A4["Key: metrics:latency:{service}\nType: Sorted Set\n(Score=latency, Value=timestamp)\nEnables p50/p99 percentiles"]
    end
```

---

## 5. Middleware Chain (Gateway)

```mermaid
flowchart LR
    REQ["Incoming\nRequest"] --> CID["correlationId\nInject X-Correlation-ID"]
    CID --> LOG["Morgan Logger\nLog method + path"]
    LOG --> JWT["JWT Validator\nVerify Bearer token\n(skip public routes)"]
    JWT --> RL["Rate Limiter\nSliding window check\nper IP + per User"]
    RL --> CACHE["Cache Check\nGET only – Redis hit?"]
    CACHE -->|Cache Hit| RES1["Return cached\nresponse 200"]
    CACHE -->|Cache Miss| CB["Circuit Breaker\nIs downstream healthy?"]
    CB -->|OPEN| RES2["Return 503\nService Unavailable"]
    CB -->|CLOSED / HALF_OPEN| PROXY["Proxy Router\nhttp-proxy-middleware"]
    PROXY --> SVC["Downstream\nMicroservice"]
    SVC --> METRIC["Metrics Collector\nIncrement Redis counters"]
    METRIC --> RES3["Return response\nto client"]
```

---

## 6. Port Allocation

```mermaid
graph TD
    subgraph Ports["Port Map"]
        P0["8080 – Load Balancer"]
        P1["3000 – Gateway Instance 1"]
        P2["3001 – Gateway Instance 2"]
        P3["4001 – Auth Service"]
        P4["4002 – Product Service"]
        P5["4003 – Payment Service"]
        P6["4004 – Order Service"]
        P7["5173 – Dashboard (Vite)"]
        P8["6379 – Redis (internal)"]
        P9["27017 – MongoDB (internal)"]
    end
```

---

## 7. Docker Network Topology

```mermaid
graph TB
    subgraph hydra_net["Docker Bridge Network: hydra-net"]
        LB_C["load-balancer\n:8080"]
        GW1_C["gateway-1\n:3000"]
        GW2_C["gateway-2\n:3001"]
        AUTH_C["auth-service\n:4001"]
        PROD_C["product-service\n:4002"]
        PAY_C["payment-service\n:4003"]
        ORD_C["order-service\n:4004"]
        REDIS_C["redis\n:6379 (internal only)"]
        MONGO_C["mongodb\n:27017 (internal only)"]
        DASH_C["dashboard\n:5173"]
    end

    HOST["Host Machine\n(your laptop / server)"]

    HOST -->|":8080"| LB_C
    HOST -->|":5173"| DASH_C
    LB_C --> GW1_C & GW2_C
    GW1_C & GW2_C --> AUTH_C & PROD_C & PAY_C & ORD_C
    GW1_C & GW2_C <--> REDIS_C
    AUTH_C & PROD_C & PAY_C & ORD_C --> MONGO_C
    ORD_C --> PROD_C & PAY_C
    PROD_C --> REDIS_C
    DASH_C --> GW1_C
```

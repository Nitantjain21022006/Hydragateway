<div align="center">
  <h1>⚡ HydraGateway</h1>
  <p><b>Enterprise-Grade Microservices Platform & API Gateway</b></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-18.x-green.svg" alt="Node.js" />
    <img src="https://img.shields.io/badge/Express-4.x-lightgrey.svg" alt="Express" />
    <img src="https://img.shields.io/badge/Redis-In--Memory_Cache-red.svg" alt="Redis" />
    <img src="https://img.shields.io/badge/MongoDB-NoSQL-brightgreen.svg" alt="MongoDB" />
    <img src="https://img.shields.io/badge/React-Dashboard-blue.svg" alt="React" />
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  </p>
</div>

---

## 📖 Overview

**HydraGateway** is a high-performance, highly available, and resilient API Gateway & Microservices ecosystem built with **Node.js**. Designed for scale and fault tolerance, it showcases industry-standard distributed systems patterns.

The platform handles everything from dynamic request routing and distributed tracing to atomic rate-limiting, centralized structured logging, and robust Circuit Breaker failure management. 

---

## 🏗️ System Architecture

Our architecture ensures zero single points of failure, leveraging a custom Layer 7 load balancer, an active/active API gateway tier, and isolated microservices.

```mermaid
graph TD
    %% Client Layer
    Client([🌐 Client / Frontend]) -->|HTTP Requests| LB[⚖️ Custom Load Balancer :8080]
    
    %% Gateway Tier
    subgraph Gateway Tier [Edge Network]
        LB -.->|Active Health Polling & Round-Robin| GW1(🛡️ API Gateway Node 1 :3000)
        LB -.->|Active Health Polling & Round-Robin| GW2(🛡️ API Gateway Node 2 :3001)
    end
    
    %% Middleware Pipeline
    subgraph Middleware Pipeline [Gateway Internals]
        GW1 --> Corr[Trace ID Injection]
        Corr --> Anal[Async Analytics Collector]
        Anal --> Auth[Stateless JWT Auth]
        Auth --> Rate[Redis Rate Limiter]
        Rate --> Cache[Redis Response Cache]
    end

    %% Microservices Tier
    subgraph Microservices Tier [Internal Network]
        Cache -->|Context Propagation| AuthSvc(🔐 Auth Service :4001)
        Cache -->|Context Propagation| ProdSvc(📦 Product Service :4002)
        Cache -->|Context Propagation| PaySvc(💳 Payment Service :4003)
        Cache -->|Context Propagation| OrdSvc(🛒 Order Service :4004)
        
        OrdSvc -->|Circuit Breaker (Fail-Fast)| ProdSvc
        OrdSvc -->|Circuit Breaker (Fail-Fast)| PaySvc
    end

    %% Persistence Tier
    subgraph Persistence Tier [Data & State]
        AuthSvc & ProdSvc & PaySvc & OrdSvc ===> Mongo[(🍃 MongoDB Atlas)]
        Anal & Rate & Cache ===> Redis[(🔴 Redis Cluster)]
    end

    %% Monitoring Dashboard
    subgraph Monitoring [Observability]
        Dash[📈 React Monitoring Dashboard] -.->|Fetches Metrics| GW1
    end

    %% Styling
    classDef lb fill:#2D3748,color:#fff,stroke:#4A5568,stroke-width:2px;
    classDef gw fill:#2B6CB0,color:#fff,stroke:#2C5282,stroke-width:2px;
    classDef pipeline fill:#EBF8FF,color:#2B6CB0,stroke:#90CDF4,stroke-width:1px;
    classDef svc fill:#C6F6D5,color:#22543D,stroke:#68D391,stroke-width:1px;
    classDef db fill:#FED7D7,color:#742A2A,stroke:#FC8181,stroke-width:1px;
    classDef dash fill:#FEFCBF,color:#744210,stroke:#F6E05E,stroke-width:2px;
    
    class LB lb;
    class GW1,GW2 gw;
    class Corr,Anal,Auth,Rate,Cache pipeline;
    class AuthSvc,ProdSvc,PaySvc,OrdSvc svc;
    class Mongo,Redis db;
    class Dash dash;
```

---

## ✨ Enterprise Features

- **Custom Application Load Balancer**: A Node.js Layer 7 Load Balancer featuring Round-Robin distribution, active background health polling (`/health`), and automated failover when gateway instances drop.
- **Circuit Breaker Pattern**: Internal state machines (`CLOSED` ⇄ `OPEN` ⇄ `HALF_OPEN`) wrap critical service-to-service calls (e.g., Order ➔ Payment) to prevent cascading failures, thread pool exhaustion, and latency spikes. Includes retry logic for transient errors.
- **Zero-Latency Analytics**: Middleware utilizing the `res.on('finish')` event hook and Redis pipelining (`INCR`) to capture traffic metrics asynchronously, without delaying the client response.
- **Monitoring Dashboard**: A standalone React/Vite Single Page Application (SPA) utilizing Tailwind CSS and Recharts to visualize live system health, API latency, and traffic volume.
- **Centralized Distributed Logging**: Unified `Winston` and `Morgan` logging. Every request receives a globally unique `X-Correlation-ID` allowing seamless request tracing across all internal microservice hops.
- **Redis Response Caching**: Accelerates heavy read operations (e.g., Product Catalogs) via Gateway-level caching with automatic write-through cache busting handled by the origin services.
- **Security & Rate Limiting**: Distributed rate limiting backed by Redis, and stateless JWT authentication with context propagation (stripping tokens and injecting `X-User-Id` headers).

---

## 🗂️ Monorepo Structure

The repository is built as an npm workspace monorepo, keeping boundaries strict while allowing shared infrastructure code.

```text
HydraGateway/
├── packages/
│   ├── load-balancer/      # L7 Router & Health Poller (:8080)
│   ├── gateway/            # API Gateway & Middleware pipeline (:3000/:3001)
│   ├── auth-service/       # Identity, Registration & JWT issuer (:4001)
│   ├── product-service/    # Product catalog with cache invalidation (:4002)
│   ├── payment-service/    # Payment processor (with simulated latency/faults) (:4003)
│   ├── order-service/      # Order orchestrator utilizing Circuit Breakers (:4004)
│   └── dashboard/          # React SPA for live metrics and monitoring (:5173)
│
├── shared/                 # Core utilities shared dynamically
│   ├── config/             # Connection pooling for MongoDB & Redis
│   ├── middleware/         # Trace ID injection & Internal Auth guards
│   └── utils/              # Winston loggers, Error formats, Circuit Breaker FSM
│
├── test-flow.js            # Automated E2E integration test suite
├── test-cb-flow.js         # Automated Circuit Breaker resilience tests
└── .env.example            # Environment variables template
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18+)
- **MongoDB** (Local or Atlas)
- **Redis** (Local instance on `6379`)

### 1. Installation
Clone the repository and install all workspace dependencies:
```bash
git clone https://github.com/your-org/hydragateway.git
cd hydragateway
npm install
```

### 2. Configuration
Copy the environment template and configure your database URIs:
```bash
cp .env.example .env
```
Ensure `MONGO_URI` and `REDIS_HOST` point to your running database instances.

### 3. Launching the Ecosystem

**Option A: Automated Start & Test (Recommended for CI/CD)**
Run the automated End-to-End suite which spins up all services, runs integration tests, validates caching and circuit breakers, and safely tears down the environment.
```bash
node test-flow.js
```

**Option B: Manual Execution**
To run the system interactively, start the services in separate terminal sessions:
```bash
# 1. Start internal microservices
npm run dev:auth
npm run dev:product
npm run dev:payment
npm run dev:order

# 2. Start API Gateway (Run 2 instances for LB failover testing)
$env:GATEWAY_PORT=3000; $env:GATEWAY_INSTANCE_ID="gateway-1"; npm run dev:gateway
$env:GATEWAY_PORT=3001; $env:GATEWAY_INSTANCE_ID="gateway-2"; npm run dev:gateway

# 3. Start Load Balancer
npm run dev:lb

# 4. Start Monitoring Dashboard
npm run dev:dashboard
```

---

## 🔬 Observability & Validation

Once the system is running, you can validate the architecture:

### 1. View the Monitoring Dashboard
Open `http://localhost:5173` in your browser to view real-time traffic, latency charts, and live microservice health statuses.

### 2. Test the Load Balancer
Direct all traffic to `http://localhost:8080`.
```bash
curl http://localhost:8080/lb-health
```
*(Check the `X-LB-Selected-Gateway` response header on subsequent requests to see traffic alternating between Gateway instances).*

### 3. Distributed Tracing
Open `logs/gateway-combined.log` and `logs/order-combined.log`. Track any request end-to-end by filtering for its unique `correlationId`.

---

## 👥 Authors & License

Developed and maintained by **Team Vision21**.

This project is licensed under the MIT License - see the LICENSE file for details.

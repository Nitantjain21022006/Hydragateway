# 🚀 Running HydraGateway with Apache Kafka in Docker

This guide details the step-by-step instructions for running the complete HydraGateway microservices platform — including Apache Kafka (KRaft mode), Redis, API Gateway, Load Balancer, internal services, Analytics Consumer, and the React Dashboard — using Docker Compose.

---

## 📋 Prerequisites

Before starting, ensure you have:
1. **Docker Desktop** installed and running on your system.
2. **MongoDB Atlas Connection URI** (or an accessible MongoDB instance).

---

## 🛠️ Step-by-Step Running Guide

### Step 1: Set the MongoDB Connection URI

HydraGateway services connect to MongoDB Atlas for persistence. Set your `MONGO_URI` environment variable before launching Docker Compose.

#### On Windows (PowerShell):
```powershell
$env:MONGO_URI="mongodb+srv://<username>:<password>@cluster0.vydfppu.mongodb.net/hydragateway?retryWrites=true&w=majority"
```

#### On Windows (Command Prompt):
```cmd
set MONGO_URI=mongodb+srv://<username>:<password>@cluster0.vydfppu.mongodb.net/hydragateway?retryWrites=true&w=majority
```

#### On Linux / macOS (Bash / Zsh):
```bash
export MONGO_URI="mongodb+srv://<username>:<password>@cluster0.vydfppu.mongodb.net/hydragateway?retryWrites=true&w=majority"
```

> **Note:** If `MONGO_URI` is already configured inside `.env.docker`, Docker Compose will automatically fall back to the `.env.docker` configuration.

---

### Step 2: Build and Launch the Entire Stack

Run the following command from the project root directory:

```bash
docker compose up --build
```

This command will:
1. Initialize the **Kafka (KRaft mode)** container (`hydra-kafka`).
2. Start the **Redis** cache container (`hydra-redis`).
3. Build and launch all microservices:
   - `auth-service` (Port 4001)
   - `product-service` (Port 4002)
   - `payment-service` (Port 4003)
   - `order-service` (Port 4004)
   - `gateway-1` (Port 3000) & `gateway-2` (Port 3001)
   - `load-balancer` (Port 8080)
   - `analytics-consumer` (Background Kafka consumer)
   - `dashboard` (Port 5173 - React SPA)

> ⏳ **Startup Note:** Kafka KRaft mode takes ~20–30 seconds to initialize and pass health checks. Downstream services will wait for Kafka and Redis to become healthy before starting up automatically.

---

## 🌐 Endpoints & Web Interfaces

Once all containers show `healthy` status, access the platform at:

| Component | URL / Endpoint | Description |
|---|---|---|
| **Monitoring Dashboard** | `http://localhost:5173` | React Observability SPA |
| **Kafka Observability Page** | `http://localhost:5173/kafka` | Real-Time Kafka Metrics & Live Event Stream |
| **Load Balancer** | `http://localhost:8080` | Public Ingress Entry Point |
| **API Gateway 1** | `http://localhost:3000/health` | Gateway 1 Health & CB Snapshot |
| **API Gateway 2** | `http://localhost:3001/health` | Gateway 2 Health & CB Snapshot |
| **Kafka Broker** | `localhost:9092` | Internal Kafka Ingress |

---

## 🧪 Testing Kafka Asynchronous Event Flows

To see Kafka events published and consumed in real-time:

### 1. Open the Kafka Dashboard
Navigate to **`http://localhost:5173/kafka`** in your browser. You will see:
- Connection Status (`Connected`)
- Total Events Consumed counter
- Events per second rate
- Per-topic distribution bars (`order.created`, `payment.completed`, `payment.failed`, `inventory.updated`, `analytics.event`)
- Live event SSE feed stream

---

### 2. Trigger Events

#### Scenario A: Create an Order (Triggers `order.created` → `payment.completed` / `payment.failed` → `inventory.updated`)
Send a `POST` request to the Load Balancer endpoint:
```bash
curl -X POST http://localhost:8080/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "60d5ecb8b3b7c82b488a0322",
    "items": [
      { "productId": "60d5ecb8b3b7c82b488a0311", "quantity": 1 }
    ],
    "paymentMethod": "CREDIT_CARD",
    "shippingAddress": "123 Tech Lane"
  }'
```
**What happens behind the scenes:**
1. Order Service creates the order synchronously and returns an HTTP response immediately.
2. Asynchronously, Order Service publishes `order.created` to Kafka.
3. Payment Service consumes `order.created` and publishes `payment.completed` or `payment.failed`.
4. Product Service consumes `payment.completed` and automatically decrements stock, then publishes `inventory.updated`.
5. Analytics Consumer updates metric counters in Redis.
6. The dashboard at `http://localhost:5173/kafka` updates live without reloading!

---

#### Scenario B: User Login (Triggers `analytics.event` - `user.login`)
```bash
curl -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123!"
  }'
```

---

#### Scenario C: Product View (Triggers `analytics.event` - `product.viewed`)
```bash
curl -X GET http://localhost:8080/v1/products/60d5ecb8b3b7c82b488a0311
```

---

## 🛑 Stopping the Stack

To stop and remove all containers and networks:

```bash
docker compose down
```

To stop containers and also remove persistent volume data (Redis & Kafka storage):

```bash
docker compose down -v
```

---

## 🔍 Useful Diagnostic Commands

```bash
# Check container status
docker compose ps

# View live logs for Kafka
docker compose logs -f kafka

# View live logs for Analytics Consumer
docker compose logs -f analytics-consumer

# View logs for Order Service
docker compose logs -f order-service
```

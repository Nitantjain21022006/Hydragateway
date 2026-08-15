# 🐳 HydraGateway – Docker Implementation Guide

> **You are using Docker Desktop on Windows for the first time.**  
> This guide covers every step from installing Docker to running the full HydraGateway stack.

---

## 📚 Table of Contents

1. [What is Docker?](#1-what-is-docker)
2. [Prerequisites – Install & Verify](#2-prerequisites--install--verify)
3. [Understanding the Files Created](#3-understanding-the-files-created)
4. [Networking Design](#4-networking-design)
5. [Running the Full Stack](#5-running-the-full-stack)
6. [Verifying Everything Works](#6-verifying-everything-works)
7. [Useful Docker Commands](#7-useful-docker-commands)
8. [Stopping and Cleaning Up](#8-stopping-and-cleaning-up)
9. [Troubleshooting Common Issues](#9-troubleshooting-common-issues)

---

## 1. What is Docker?

| Concept | Simple Explanation |
|---|---|
| **Image** | A recipe/blueprint for a container (like a class in code) |
| **Container** | A running instance of an image (like an object from a class) |
| **Dockerfile** | A text file that defines how to build an image |
| **docker-compose.yml** | A file that defines multiple containers and how they connect |
| **Volume** | Persistent storage so your data survives container restarts |
| **Network** | A private virtual network containers use to talk to each other |

**Why use Docker for HydraGateway?**  
Instead of manually starting 10 processes (MongoDB, Redis, 2 gateways, load balancer, 4 services, dashboard), Docker starts all of them with **one command**. They are isolated, reproducible, and can be shared with your team.

---

## 2. Prerequisites – Install & Verify

### Step 1: Install Docker Desktop

1. Go to: **https://www.docker.com/products/docker-desktop/**
2. Click **"Download for Windows"**
3. Run the installer (`Docker Desktop Installer.exe`)
4. During install, make sure **"Use WSL 2"** is checked (recommended)
5. After install, **restart your PC**
6. Open **Docker Desktop** from the Start menu – wait for it to say **"Engine running"** (green circle icon in taskbar)

### Step 2: Verify Installation

Open **PowerShell** (or Windows Terminal) and run:

```powershell
docker --version
```
Expected output (version may differ):
```
Docker version 26.x.x, build xxxxxxx
```

```powershell
docker compose version
```
Expected output:
```
Docker Compose version v2.x.x
```

> **If these commands fail:** Make sure Docker Desktop is open and the engine is running (green icon in taskbar).

---

## 3. Understanding the Files Created

Here is what was created in your project:

```
proj/
├── .dockerignore              ← Tells Docker what files to IGNORE when building
├── .env.docker                ← Environment variables for Docker (localhost → service names)
├── docker-compose.yml         ← Orchestrates all 10 containers
│
├── packages/
│   ├── load-balancer/
│   │   └── Dockerfile         ← Builds the load balancer container
│   ├── gateway/
│   │   └── Dockerfile         ← Builds the gateway container (used twice)
│   ├── auth-service/
│   │   └── Dockerfile         ← Builds auth service container
│   ├── product-service/
│   │   └── Dockerfile         ← Builds product service container
│   ├── payment-service/
│   │   └── Dockerfile         ← Builds payment service container
│   ├── order-service/
│   │   └── Dockerfile         ← Builds order service container
│   └── dashboard/
│       ├── Dockerfile         ← Multi-stage: builds React, then serves via Nginx
│       └── nginx.conf         ← Nginx configuration for the dashboard
```

### Why `.env.docker` and not `.env`?

In your `.env`, services connect like this:
```
REDIS_HOST=localhost
MONGO_URI=mongodb://localhost:27017/hydragateway
```

Inside Docker, `localhost` means **the container itself**, not Redis or MongoDB.  
In `.env.docker`, we use **Docker service names** (which Docker DNS resolves):
```
REDIS_HOST=redis
MONGO_URI=mongodb://mongodb:27017/hydragateway
```

Your original `.env` remains **untouched** for local development.

---

## 4. Networking Design

All 10 containers are on a private bridge network called **`hydra-net`**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Docker Network: hydra-net                         │
│                                                                         │
│  Your Browser ──► dashboard:80        (you access → localhost:5173)     │
│                       │ (Nginx reverse proxy for /api/*)                │
│  Your Browser ──► load-balancer:8080  (you access → localhost:8080)     │
│                       │                                                 │
│              ┌────────┴────────┐                                        │
│           gateway:3000    gateway-2:3001                                │
│              │                                                          │
│    ┌─────────┼──────────┐                                               │
│    ▼         ▼          ▼          ▼                                    │
│  auth:4001  product:4002  payment:4003  order:4004                      │
│                                                                         │
│  redis:6379   (rate limiting, caching, analytics)                       │
│  mongodb:27017 (user data, orders, products, payments)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Port Mapping** (host:container):

| Service | Host Port | Container Port | URL to visit |
|---|---|---|---|
| Dashboard | 5173 | 80 | http://localhost:5173 |
| Load Balancer | 8080 | 8080 | http://localhost:8080 |
| Gateway 1 | 3000 | 3000 | http://localhost:3000 |
| Gateway 2 | 3001 | 3001 | http://localhost:3001 |
| Auth Service | 4001 | 4001 | http://localhost:4001 |
| Product Service | 4002 | 4002 | http://localhost:4002 |
| Payment Service | 4003 | 4003 | http://localhost:4003 |
| Order Service | 4004 | 4004 | http://localhost:4004 |
| Redis | 6379 | 6379 | (no browser, CLI only) |
| MongoDB | 27017 | 27017 | MongoDB Compass → localhost:27017 |

---

## 5. Running the Full Stack

> **Important:** Make sure Docker Desktop is **open and running** before running any Docker command.

### Open PowerShell and navigate to your project

```powershell
cd "C:\Users\Moksha Sheth\Desktop\project\proj"
```

### Step 1: Build all images and start all containers

This is the **main command** you'll run:

```powershell
docker compose up --build
```

**What this does:**
- Reads `docker-compose.yml`
- Builds a Docker image for each service (from their Dockerfiles)
- Starts all 10 containers in the correct order
- Shows combined logs from all services in your terminal

**First run will take 3–10 minutes** (it downloads Node, Nginx, MongoDB, Redis base images). Subsequent runs are much faster because Docker caches layers.

### Step 2: Watch the logs

You will see coloured logs from all services. Look for lines like:
```
hydra-auth      | Auth Service listening on port 4001
hydra-product   | Product Service listening on port 4002
hydra-gateway-1 | API Gateway [gateway-1] listening on port 3000
hydra-gateway-2 | API Gateway [gateway-2] listening on port 3001
hydra-lb        | Load Balancer listening on port 8080
```

Once you see all services start, open your browser and go to:
- **Dashboard:** http://localhost:5173
- **Load Balancer health:** http://localhost:8080/lb-health

### Step 3 (Optional): Run in background (detached mode)

If you don't want to keep the terminal open:

```powershell
docker compose up --build -d
```

The `-d` flag runs everything in the background. You can close the terminal.

---

## 6. Verifying Everything Works

### Check all containers are running

```powershell
docker compose ps
```

Expected output (all should show `Up` or `healthy`):

```
NAME                 STATUS          PORTS
hydra-mongodb        Up (healthy)    0.0.0.0:27017->27017/tcp
hydra-redis          Up (healthy)    0.0.0.0:6379->6379/tcp
hydra-auth           Up (healthy)    0.0.0.0:4001->4001/tcp
hydra-product        Up (healthy)    0.0.0.0:4002->4002/tcp
hydra-payment        Up (healthy)    0.0.0.0:4003->4003/tcp
hydra-order          Up (healthy)    0.0.0.0:4004->4004/tcp
hydra-gateway-1      Up (healthy)    0.0.0.0:3000->3000/tcp
hydra-gateway-2      Up (healthy)    0.0.0.0:3001->3001/tcp
hydra-lb             Up (healthy)    0.0.0.0:8080->8080/tcp
hydra-dashboard      Up (healthy)    0.0.0.0:5173->80/tcp
```

### Quick health checks (open these URLs in your browser)

| URL | Expected Response |
|---|---|
| http://localhost:8080/lb-health | `{"status":"ok","service":"load-balancer",...}` |
| http://localhost:3000/health | `{"status":"ok","service":"api-gateway","instance":"gateway-1",...}` |
| http://localhost:3001/health | `{"status":"ok","service":"api-gateway","instance":"gateway-2",...}` |
| http://localhost:4001/health | `{"status":"ok","service":"auth-service",...}` |
| http://localhost:4002/health | `{"status":"ok","service":"product-service",...}` |
| http://localhost:4003/health | `{"status":"ok","service":"payment-service",...}` |
| http://localhost:4004/health | `{"status":"ok","service":"order-service",...}` |
| http://localhost:5173 | HydraGateway Dashboard UI |

### Test user registration via Load Balancer

Use PowerShell:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8080/v1/auth/register" `
  -ContentType "application/json" `
  -Body '{"name":"Test User","email":"test@example.com","password":"Password123!"}'
```

---

## 7. Useful Docker Commands

### View logs from a specific service

```powershell
# See logs from gateway
docker compose logs gateway

# See logs from all services, follow live
docker compose logs -f

# See last 50 lines from load balancer
docker compose logs --tail=50 load-balancer
```

### Restart a single service (without rebuilding)

```powershell
docker compose restart gateway
```

### Rebuild and restart one specific service

```powershell
docker compose up --build -d gateway
```

### Open a shell inside a running container (for debugging)

```powershell
# Open shell in the gateway container
docker compose exec gateway sh

# Check environment variables inside the container
docker compose exec gateway env

# Exit the container shell
exit
```

### See all Docker images built

```powershell
docker images
```

### See how much disk space Docker is using

```powershell
docker system df
```

### View Docker Desktop

Open **Docker Desktop** app — it has a GUI showing all containers, logs, and resource usage. Very useful for beginners!

---

## 8. Stopping and Cleaning Up

### Stop all containers (keeps data volumes intact)

```powershell
docker compose down
```

### Stop and remove data volumes (⚠️ deletes MongoDB and Redis data)

```powershell
docker compose down -v
```

> **Warning:** `-v` deletes all stored data. Only use if you want a completely fresh start.

### Stop and remove everything including built images

```powershell
docker compose down --rmi all -v
```

### Free up disk space (remove unused images, containers, caches)

```powershell
docker system prune -a
```

> This removes ALL unused Docker resources. Use only when you want to clean up disk space.

---

## 9. Troubleshooting Common Issues

### ❌ `Cannot connect to the Docker daemon`

**Cause:** Docker Desktop is not running.  
**Fix:** Open Docker Desktop from the Start menu. Wait for the green icon in the taskbar.

---

### ❌ `Port is already in use` (e.g., `Bind for 0.0.0.0:3000 failed`)

**Cause:** A service is already running locally on that port (your non-Docker dev server).  
**Fix:** Stop your local services first:
```powershell
# Kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```
Or change the host port in `docker-compose.yml` (e.g., `"13000:3000"`).

---

### ❌ A service keeps restarting (`Restarting` status)

**Cause:** The service crashed (missing env var, can't connect to MongoDB/Redis).  
**Fix:** Check the logs:
```powershell
docker compose logs auth-service
```
Look for error messages (e.g., `MongoNetworkError`, `Redis connection refused`).

---

### ❌ Dashboard shows blank page or network errors

**Cause:** The React app may be trying to reach `localhost:8080` which doesn't work from inside Docker.  
**Fix:** The Nginx config (`nginx.conf`) proxies `/api/*` to `http://load-balancer:8080`. Make sure the dashboard's API calls use a relative path `/api/` or the env var is set correctly.

---

### ❌ `service "gateway-2" uses image "hydra/gateway:latest" which doesn't exist`

**Cause:** `gateway` service wasn't built before `gateway-2` tried to use its image.  
**Fix:** Always use `docker compose up --build` (not `docker compose up`) on the first run.

---

### ❌ Health check failing – container shows `unhealthy`

**Cause:** The service is starting up slowly.  
**Fix:** Health checks have a `start_period` configured. Wait 30–60 seconds. If it stays `unhealthy`:
```powershell
docker compose logs <service-name>
```

---

### ❌ `ECONNREFUSED` errors in service logs

**Cause:** A service started before its dependency was ready (e.g., gateway before MongoDB).  
**Fix:** This is handled by `depends_on` with `condition: service_healthy`. If it persists, restart:
```powershell
docker compose restart auth-service
```

---

## 🎉 You're Done!

Your entire HydraGateway microservices platform is now running in Docker.

| What you built | Containers |
|---|---|
| Infrastructure | MongoDB, Redis |
| Backend Services | Auth, Product, Payment, Order |
| API Layer | Gateway (×2 instances) |
| Traffic Management | Load Balancer |
| Frontend | Dashboard (React + Nginx) |

**Total: 10 containers, 1 command to start them all.**

```powershell
docker compose up --build
```

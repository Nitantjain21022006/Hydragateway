# Manual Test Plan – HydraGateway Observability Dashboard

This document provides a step-by-step manual test plan to verify all features of the new **Gateway Observability Dashboard** frontend and its integration with the Gateway backend.

---

## 📋 Prerequisites & Setup

Ensure all services are running before starting the tests. Open separate terminals and run:

1. **Redis & MongoDB:** Make sure local Redis is running on port `6379` and MongoDB is accessible (as configured in `.env`).
2. **Start Services:**
   * **Load Balancer:** `npm run dev:lb` (Port 8080)
   * **Gateway Instance 1:** `npm run dev:gateway` (Port 3000)
   * **Auth Service:** `npm run dev:auth` (Port 4001)
   * **Product Service:** `npm run dev:product` (Port 4002)
   * **Payment Service:** `npm run dev:payment` (Port 4003)
   * **Order Service:** `npm run dev:order` (Port 4004)
   * **Dashboard Frontend:** `npm run dev:dashboard` (Port 5173)

Access the dashboard at **`http://localhost:5173/`** using your browser.

---

## 🧪 Test Cases

### Test Case 1: Navigation & Dark Mode Theme
* **Objective:** Verify navigation sidebar routes correctly and layout follows the dark theme design system.
* **Steps:**
  1. Open `http://localhost:5173/` in your browser.
  2. Click through each sidebar navigation link:
     * *Dashboard*
     * *Live Requests* (Verify "LIVE" green badge is visible in sidebar)
     * *Circuit Breakers*
     * *Service Health*
     * *Live Logs* (Verify "LIVE" green badge is visible in sidebar)
     * *Load Generator*
  3. Verify that the footer displays **Stream connected** with a green check/wifi icon.
* **Expected Result:** Pages load instantly with a sleek dark slate background, clear layouts, readable text, and correct highlight indicators on the active navigation menu item.

---

### Test Case 2: Dashboard Metrics & Charts
* **Objective:** Verify aggregated metrics and visualizations match gateway traffic.
* **Steps:**
  1. Navigate to the **Dashboard** page.
  2. Verify the 4 KPI cards are visible:
     * *Total Requests*
     * *Failed Requests*
     * *Success Rate*
     * *Avg Response Time*
  3. Verify the charts render correctly:
     * *Gateway Traffic* (Area Chart)
     * *Response Times* (Bar Chart)
     * *Status Code Breakdown* (Donut Chart - shows "No data yet" if total requests are 0)
     * *Per-Service Traffic* (Progress bars)
     * *Top Endpoints* (Table)
  4. Click the **Refresh** button at the top right; verify the "Updated [Timestamp]" updates.
* **Expected Result:** Charts render smoothly with no overlapping text. If there is no previous traffic, the status code donut chart shows an empty state, and other counters show default/zero values.

---

### Test Case 3: Traffic Load Generation
* **Objective:** Verify browser-side traffic generation operates concurrently and collects live metrics.
* **Steps:**
  1. Navigate to the **Load Generator** page.
  2. Click the **Endpoint Preset** dropdown and select `GET /v1/products`. Verify *Method* becomes `GET` and *Path* becomes `/v1/products`.
  3. Set *Total Requests* to `150`.
  4. Set *Concurrency* to `10`.
  5. Set *Delay Between Batches* to `100` ms.
  6. Click **Start Load Test**.
  7. **During execution:** Verify the progress bar moves, and counters (*Sent*, *Completed*, *Success Rate*, *Req/s*, *Avg Latency*) increment in real-time.
  8. **Stop test:** Click **Stop** halfway through. Verify the test halts immediately.
  9. Check the *Recent Results* table at the bottom. Verify it lists individual requests with status codes (e.g. `200`), latency (ms), and green check icons.
* **Expected Result:** Batched requests are fired cleanly. Counters update dynamically. Stopping the test halts the generation instantly.

---

### Test Case 4: Real-time Live Request Monitor
* **Objective:** Verify HTTP request metadata streams in real-time via Server-Sent Events (SSE) with interactive pipelines.
* **Steps:**
  1. Navigate to the **Live Requests** page.
  2. Verify the top right shows **Live** with a pulsing green dot.
  3. Keep this tab open or split your screen, then run a short load test from the *Load Generator* page (e.g. 50 requests).
  4. Switch back to the **Live Requests** page. Verify request rows stream in automatically from the top of the timeline.
  5. **Inspect Request Row:** Confirm it displays a Method badge (e.g., green `GET`), path, service name (`product-service`), status (`200`), and latency (e.g., `12ms`).
  6. **Interactive Pipeline:** Click on any request row to expand it.
     * Verify the *Pipeline View* renders steps: Client → Load Balancer → Gateway → JWT Auth → Rate Limiter → Cache → Circuit Breaker → target service.
     * Verify checkmarks / info details are populated for each step.
  7. **Filters:** Select a service filter (e.g. `product-service` only). Verify only matching requests are shown.
  8. **Pause/Resume:** Click **Pause**. Generate new load. Verify no new rows appear. Click **Resume**. Verify new requests resume appearing.
  9. **Clear:** Click **Clear**. Verify the table is emptied.
* **Expected Result:** Streaming requests arrive with sub-second latency. Row expansion reveals a fully styled request pipeline step visualization.

---

### Test Case 5: Circuit Breaker FSM & Visualization
* **Objective:** Verify service health failures trigger state transitions (CLOSED ➔ OPEN ➔ HALF-OPEN ➔ CLOSED) and render accurately.
* **Steps:**
  1. Navigate to the **Circuit Breakers** page.
  2. Verify all service cards (auth, product, payment, order) show **CLOSED** with a slow green pulsing ring.
  3. **Simulate Service Failure:** Go to your terminal and stop the **Product Service** (Ctrl+C).
  4. Navigate to the **Load Generator** and trigger `GET /v1/products` (10 requests, concurrency 2).
  5. Go quickly to the **Circuit Breakers** page:
     * Watch the failure progress bar fill up on the *Product Service* card.
     * Once it hits 5 failures (default threshold), the card border should flash red, and the status ring must turn **OPEN** (red flashing) with an active **Recovery Countdown** timer.
     * While **OPEN**, go to the *Load Generator* and try sending one product request. Switch to *Live Requests* and verify it fails instantly with status `503 (CIRCUIT_OPEN)` at the *Circuit Breaker* step (indicated in the pipeline detail).
  6. **Transition to HALF-OPEN:** Wait 10 seconds for the recovery countdown to reach `0`. Verify status changes to **HALF_OPEN** (amber blinking ring).
  7. **Simulate Recovery:** Restart the **Product Service** in your terminal (`npm run dev:product`).
  8. Send a few requests to `/v1/products` from the *Load Generator*.
  9. Verify the *Product Service* circuit breaker card transitions back to **CLOSED** (green pulsing) once success threshold (2 consecutive successes) is met.
* **Expected Result:** State transitions are visual, immediate, and reflect the true status of the gateway's circuit breakers.

---

### Test Case 6: Live Log Viewer
* **Objective:** Verify real-time logs stream, filter, and parse correctly.
* **Steps:**
  1. Navigate to the **Live Logs** page.
  2. Verify the live status dot at the top right is pulsing green.
  3. Send some requests using the *Load Generator* to generate activity.
  4. Verify log statements print in the console view.
  5. **Filter by Level:** Click **ERROR**. Verify only red `ERRO` logs appear. Click **INFO** to display all normal logs.
  6. **Filter by Service:** Select `gateway-proxy` or `gateway-analytics` from the dropdown. Verify logs scope to that service tag.
  7. **Text Search:** Type a keyword (e.g., "circuit-breaker") in the *Search logs...* bar. Confirm rows dynamically filter.
  8. **Auto-Scroll:** Uncheck *Auto-scroll* and scroll up. Verify new logs do not snap the screen view to the bottom. Check it again to snap back.
* **Expected Result:** Logs format as readable, level-colored lines. Filters and search inputs refine the output instantly.

---

### Test Case 7: Service Health Monitoring
* **Objective:** Verify active polling detects service outages.
* **Steps:**
  1. Navigate to the **Service Health** page.
  2. Verify all services and Gateway instances are listed as **healthy** (green badges).
  3. Stop the **Payment Service** in your terminal.
  4. Wait up to 5 seconds. Verify the *Payment Service* card updates to **down** (red badge).
  5. Restart the **Payment Service**. Wait 5 seconds. Verify it returns to **healthy**.
* **Expected Result:** Card statuses change between healthy and down to accurately match the active microservices.

---

## 📝 Test Results Log

Use this checklist during your verification session:

| Test Case | Description | Status (PASS/FAIL) | Notes |
|---|---|---|---|
| **TC-1** | Navigation & Dark Mode Theme | | |
| **TC-2** | Dashboard Metrics & Charts | | |
| **TC-3** | Traffic Load Generation | | |
| **TC-4** | Real-time Live Request Monitor | | |
| **TC-5** | Circuit Breaker FSM & Visualization | | |
| **TC-6** | Live Log Viewer | | |
| **TC-7** | Service Health Monitoring | | |

# Phase 13: Monitoring Dashboard

## 1. Objective of Phase 13
The primary objective of Phase 13 is to build a robust, real-time Monitoring Dashboard for the HydraGateway ecosystem. This dashboard serves as the visual interface for operators to track the health, performance, and traffic of the microservices platform, providing actionable insights into gateway traffic, service health, response times, and request statuses.

## 2. Dashboard Architecture
The dashboard is built as a Single Page Application (SPA) using React and Vite for fast development and optimized production builds. The UI is styled exclusively with Tailwind CSS v3.4.17 to ensure a responsive, maintainable, and modern design. It fetches analytical data directly from the gateway via a centralized Axios configuration, operating independently of the other services as a dedicated frontend client.

## 3. Component Structure
The UI is broken down into modular and reusable components:
- `App.jsx`: The root component that orchestrates state management, fetches data, and renders the dashboard layout.
- `MetricsCard.jsx`: A reusable card component to display key performance indicators (KPIs) like Total Requests, Failed Requests, Average Gateway Traffic, and Average Response Time.
- `TrafficChart.jsx`: An area chart component using Recharts to visualize gateway traffic over time.
- `ResponseTimeChart.jsx`: A bar chart component using Recharts to display average response times per microservice.
- `ServiceHealth.jsx`: A table component that lists all registered microservices along with their current health status and uptime percentage, utilizing Lucide React icons for visual cues.

## 4. API Integration
API integration is handled exclusively via Axios. Data is fetched using the `api.get('/api/analytics')` endpoint on a periodic interval (every 30 seconds). The state of the dashboard is automatically updated when the API responds. In the event of a failure, mock data is gracefully loaded for demonstration purposes, ensuring the dashboard remains informative.

## 5. Charts and Visualization
Recharts, a composable charting library built on React components, is used for data visualization:
- **Area Chart**: Displays gateway traffic, providing a clear view of load trends over time.
- **Bar Chart**: Highlights response times across different services, allowing for quick identification of bottlenecks.

## 6. Every New Folder Created
- `packages/dashboard/src/components`: Created to house all the reusable UI components for the dashboard.
- `packages/dashboard/src/services`: Created to centralize API communication logic.

## 7. Every New File Created
- `src/components/MetricsCard.jsx`: Responsible for displaying top-level metrics in a structured card format.
- `src/components/TrafficChart.jsx`: Responsible for rendering the gateway traffic area chart.
- `src/components/ResponseTimeChart.jsx`: Responsible for rendering the service response time bar chart.
- `src/components/ServiceHealth.jsx`: Responsible for displaying the service health status table.
- `src/services/axios.js`: Centralized Axios instance configuration to manage API requests.
- `phase13_done.md`: This documentation file detailing the Phase 13 implementation.

## 8. Every Existing File Modified
- `packages/dashboard/package.json`: Updated to include new dependencies (`axios`, `recharts`, `lucide-react`, `tailwindcss`, `postcss`, `autoprefixer`).
- `packages/dashboard/tailwind.config.js`: Overwritten to configure Tailwind CSS to scan the correct paths for class names.
- `packages/dashboard/src/index.css`: Modified to include Tailwind CSS directives (`@tailwind base`, `@tailwind components`, `@tailwind utilities`) and base body styles.
- `packages/dashboard/src/App.jsx`: Completely rewritten to serve as the main dashboard view, integrating all created components and managing data fetching.

## 9. Axios Integration
Axios is configured centrally in `src/services/axios.js`. An Axios instance is created with:
- `baseURL`: Extracted from the environment variable `VITE_API_URL`, falling back to `http://localhost:3000`.
- `withCredentials`: Set to `true` to ensure cross-origin requests include necessary cookies or authorization headers.
- `headers`: Explicitly setting `Content-Type: application/json`.
This centralized approach ensures all API calls across the dashboard adhere to the same rules without hardcoding URLs in components.

## 10. Environment Variables Used
- `VITE_API_URL`: Used to define the base URL for backend API requests. If this is not provided in the environment, it defaults to the local gateway address `http://localhost:3000`.

## 11. Complete Request Flow
1. The user navigates to the dashboard in their browser.
2. The `App` component mounts and triggers the `fetchMetrics` function.
3. `fetchMetrics` calls the centralized Axios instance (`api.get('/api/analytics')`).
4. Axios makes an HTTP GET request to the gateway backend (using `VITE_API_URL`).
5. The gateway processes the request, gathers analytics from Redis, and responds with JSON data.
6. The Axios instance receives the response and passes the data back to `fetchMetrics`.
7. `fetchMetrics` updates the React state (`metrics`).
8. The state change triggers a re-render of `App.jsx`, cascading down to `MetricsCard`, `TrafficChart`, `ResponseTimeChart`, and `ServiceHealth`, updating the UI with real-time data.

## 12. How the dashboard communicates with the backend
The dashboard communicates with the backend exclusively through asynchronous HTTP requests managed by Axios. The centralized Axios instance enforces consistent configuration (like base URLs and credentials). The dashboard uses relative endpoints (e.g., `/api/analytics`) when making calls, allowing the base URL to be dynamically resolved based on the environment variable `VITE_API_URL`.

## 13. Complete Explanation for Beginners
Imagine the HydraGateway platform as a busy restaurant. The different microservices (Auth, Product, Payment, Order) are the specialized chefs in the kitchen. The Gateway is the head waiter taking all orders and assigning them to the chefs.

Phase 13 is about building a **manager's monitor (Monitoring Dashboard)** that sits in the front of the restaurant. 

Instead of going into the kitchen to check on things, the manager can look at this screen to see:
- **Total Requests**: How many total orders have been placed.
- **Failed Requests**: How many orders were messed up.
- **Gateway Traffic**: A chart showing how busy the restaurant is over time.
- **Service Health**: A list showing if each chef is awake and working properly ("Healthy") or struggling ("Degraded").
- **Response Times**: A chart showing how long each chef takes to prepare an order.

We built this screen using **React** (a tool to build user interfaces), styled it to look nice with **Tailwind CSS**, and created a bridge to get information from the kitchen (the backend) using **Axios**. All the information is updated automatically every 30 seconds, so the manager always has the latest view of how the restaurant is running!

PHASE 0

You are a Senior Backend Architect.

Design the complete architecture for a project named:

HydraGateway – Scalable Microservices Platform

Goal:
Build a production-inspired backend infrastructure platform consisting of:

1. Custom Load Balancer
2. Multiple API Gateway Instances
3. Auth Service
4. Product Service
5. Payment Service
6. Order Service
7. Redis Infrastructure Layer
8. Monitoring Dashboard

Requirements:

- Node.js
- Express.js
- Redis
- JWT Authentication
- Microservices Architecture

Produce:

1. High-Level Architecture Diagram
2. Request Flow Diagram
3. Folder Structure
4. Service Responsibilities
5. API Contracts
6. Redis Usage Plan
7. Load Balancer Design
8. API Gateway Design
9. Security Design
10. Future Scalability Design

Do not generate code.

Act as Staff Software Engineer and prepare architecture documentation.



PHASE 1

Act as Senior Backend Engineer.

Create the complete folder structure for HydraGateway.

Requirements:

- Monorepo Architecture
- Independent package.json per service
- Shared Config Folder
- Shared Utils Folder
- Environment Variable Strategy

Generate:

1. Folder Structure
2. package.json for each service
3. Environment Strategy
4. Port Allocation Plan
5. Development Workflow

Do not write business logic yet.



PHASE 2

Act as Senior Node.js Engineer.

Build Auth Service for HydraGateway.

Responsibilities:

- Register User
- Login User
- Logout User
- JWT Generation
- JWT Validation

Tech Stack:

- Node.js
- Express
- MongoDB
- Mongoose
- bcrypt
- JWT

Generate:

1. Folder Structure
2. User Schema
3. Controllers
4. Routes
5. Middleware
6. Error Handling
7. Environment Variables

Follow production standards.

Explain every design decision.



PHASE 3

Act as Senior Backend Engineer.

Build Product Service for HydraGateway.

Responsibilities:

- Create Product
- Update Product
- Delete Product
- Get Product
- Get Product List

Requirements:

- Express
- MongoDB
- Mongoose

Generate:

1. Schema
2. Controllers
3. Routes
4. Validation
5. Error Handling
6. Service Layer

Use production-ready architecture.



PHASE 4

Act as Senior Backend Engineer.

Build Payment Service.

Responsibilities:

- Create Payment
- Payment History
- Transaction Status

Requirements:

- Payment Simulation Only
- MongoDB
- Proper Transaction Tracking

Generate:

1. Schema
2. Controllers
3. Routes
4. Validation
5. Error Handling
6. Architecture Explanation

Production-grade design only.



PHASE 5

Act as Senior Backend Engineer.

Build Order Service.

Responsibilities:

- Create Order
- View Orders
- Order Status

Integrations:

- Product Service
- Payment Service

Generate:

1. Schema
2. Controllers
3. Routes
4. Service Layer
5. Architecture Design

Use Microservice Principles.



PHASE 6

Act as Principal Backend Engineer.

Build HydraGateway API Gateway.

Responsibilities:

- Reverse Proxy
- Request Routing
- JWT Validation
- Request Logging
- Service Registry
- Health Checks

Services:

Auth Service
Product Service
Payment Service
Order Service

Generate:

1. Gateway Folder Structure
2. Reverse Proxy Design
3. Middleware Chain
4. Routing Architecture
5. Health Check Design
6. Service Registry Design

Use Express and http-proxy-middleware.

Explain all design choices.



PHASE 7

Act as Distributed Systems Engineer.

Design and implement Redis-based Rate Limiter for HydraGateway.

Requirements:

- Limit per User
- Limit per IP
- Distributed across multiple Gateway Instances

Tech:

- Redis
- Express Middleware

Generate:

1. Data Model in Redis
2. Fixed Window Design
3. Middleware Implementation
4. Scalability Analysis
5. Failure Scenarios

Use production standards.



PHASE 8

Act as Performance Engineer.

Implement Redis Response Cache.

Requirements:

Cache:

GET /products

GET /products/:id

Generate:

1. Cache Architecture
2. Redis Key Strategy
3. Cache Invalidation Logic
4. Middleware Design
5. Performance Analysis

Production-grade only.



PHASE 9

Act as Site Reliability Engineer.

Implement centralized logging.

Requirements:

Log:

- Request
- Response
- Latency
- Status Code
- Service Name

Use:

- Morgan
- Winston

Generate:

1. Logging Architecture
2. Log Formats
3. File Structure
4. Middleware
5. Future ELK Integration Plan



PHASE 10

Act as Backend Architect.

Build Analytics Infrastructure.

Track:

- Total Requests
- Failed Requests
- Gateway Usage
- Service Usage
- Average Response Time

Store metrics in Redis.

Generate:

1. Metrics Architecture
2. Redis Data Structures
3. Collection Pipeline
4. APIs for Dashboard



PHASE 11

Act as Distributed Systems Engineer.

Build a Custom Load Balancer for HydraGateway.

Requirements:

- Round Robin Algorithm
- Multiple Gateway Instances
- Health Checks
- Failover

Architecture:

Client
|
Load Balancer
|
Gateway 1
Gateway 2

Generate:

1. Folder Structure
2. Round Robin Algorithm
3. Health Check Mechanism
4. Failover Logic
5. Request Flow
6. Scalability Discussion

Use Express and Node.js only.



PHASE 12

Act as Reliability Engineer.

Implement Circuit Breaker Pattern.

Scenario:

Payment Service becomes unavailable.

Requirements:

- Open State
- Closed State
- Half Open State

Generate:

1. Architecture
2. State Machine
3. Middleware
4. Recovery Logic



PHASE 13

Act as Full Stack Engineer.

Build Monitoring Dashboard.

Tech:

- React
- Tailwind

Display:

- Total Requests
- Failed Requests
- Gateway Traffic
- Service Health
- Response Times

Generate:

1. UI Architecture
2. API Integration Plan
3. Component Structure
4. Charts Design



PHASE 14

Act as DevOps Engineer.

Dockerize HydraGateway.

Requirements:

- Load Balancer
- Gateway
- Redis
- All Services

Generate:

1. Dockerfiles
2. docker-compose.yml
3. Networking Design
4. Container Communication



PHASE 15

Act as Staff Software Engineer.

Perform a complete architecture review of HydraGateway.

Review:

- Scalability
- Security
- Fault Tolerance
- Reliability
- Maintainability

Suggest improvements used in real-world systems like:

Netflix
Uber
Amazon

Generate:

1. Architecture Audit
2. Bottlenecks
3. Security Risks
4. Future Enhancements
5. Interview Talking Points
# Phase 4 Done: Payment Service Implementation

## 1. Objective
Successfully implemented the **Payment Service** for the HydraGateway platform. The service provides a production-grade infrastructure for handling payments, tracking transaction history, and simulating payment processing logic.

## 2. Architecture
The Payment Service follows the established **Service-Controller-Model** pattern, ensuring consistency across the monorepo:
- **Model**: Defines the `Payment` schema with indexing on `transactionId`, `userId`, and `orderId`.
- **Service Layer**: Contains the core business logic, including the asynchronous payment simulation and history retrieval.
- **Controller Layer**: Manages the HTTP interface, extracting request data and invoking services.
- **Route Layer**: Exposes RESTful endpoints with integrated validation middleware.
- **Middleware Layer**: Handles request validation and centralized error mapping.

## 3. Folder Structure
```
packages/payment-service/
├── src/
│   ├── controllers/
│   │   └── paymentController.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── validateRequest.js
│   ├── models/
│   │   └── Payment.js
│   ├── routes/
│   │   └── paymentRoutes.js
│   ├── services/
│   │   └── paymentService.js
│   └── server.js
└── package.json
```

## 4. Files Added
- `packages/payment-service/package.json`
- `packages/payment-service/src/server.js`
- `packages/payment-service/src/models/Payment.js`
- `packages/payment-service/src/middleware/validateRequest.js`
- `packages/payment-service/src/middleware/errorHandler.js`
- `packages/payment-service/src/services/paymentService.js`
- `packages/payment-service/src/controllers/paymentController.js`
- `packages/payment-service/src/routes/paymentRoutes.js`

## 5. Endpoints Added
- `POST /v1/payments`: Initiate a simulated payment (requires `userId`, `amount`, `paymentMethod`).
- `GET /v1/payments/history/:userId`: Retrieve all transactions for a specific user.
- `GET /v1/payments/:transactionId/status`: Check the real-time status of a transaction.
- `GET /health`: Service health check.

## 6. Validation Rules
Uses `express-validator` via a custom `validateWith` middleware factory:
- **Initiate Payment**: Checks for required fields; `amount` must be a positive number; `paymentMethod` must be one of the supported types (CREDIT_CARD, DEBIT_CARD, PAYPAL, STRIPE_SIMULATION).
- **History/Status**: Ensures path parameters are provided.

## 7. Error Handling Strategy
- **Centralized Mapping**: `errorHandler.js` maps Mongoose errors (Validation, Duplicate, Cast) to the standardized `AppError` shape.
- **Operational tagging**: Differentiates between known API errors and unexpected programmer errors.
- **Logging**: Every error is logged via the centralized Winston logger with `correlationId` for traceability.

## 8. Design Decisions
- **Simulation Logic**: Implemented a realistic simulation using `Math.random()` (90% success rate) and `setTimeout` to mimic network latency.
- **Transaction UUIDs**: Used `uuid v4` for `transactionId` to ensure global uniqueness across distributed instances.
- **Internal Secret Strategy**: Ready for `internalAuth` middleware when service-to-service communication is enabled (e.g., from Order Service).
- **Port Allocation**: Assigned **4003** to follow the sequential pattern established in previous phases.

## 9. Transaction Tracking Design
- **States**: `PENDING` -> `COMPLETED` or `FAILED`.
- **Indexing**: Optimized queries for user history and specific transaction lookups using MongoDB indexes.
- **Audit Trail**: Every record includes `processedAt` and `failureReason` for post-mortems.

## 10. Future Improvements
- **Webhooks**: Implement an outgoing webhook system to notify the Order Service when a payment status changes asynchronously.
- **Real Gateway Integration**: Add adapter patterns for actual Stripe/LemonSqueezy APIs.
- **Idempotency**: Implement `X-Idempotency-Key` tracking to prevent duplicate payments on retry.

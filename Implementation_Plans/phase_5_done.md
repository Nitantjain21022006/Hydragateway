# Phase 5 Done: Order Service Implementation

## 1. Objective
Successfully implemented the **Order Service** for the HydraGateway platform. The service acts as an orchestrator, managing the order lifecycle by integrating with the **Product Service** (for validation) and the **Payment Service** (for transaction processing).

## 2. Architecture
The Order Service follows the **Service-Controller-Model** pattern:
- **Model Layer**: Defines the `Order` schema, including items, shipping details, total amount, and status tracking.
- **Service Layer**: Contains complex business logic, including cross-service communication via Axios to validate products and initiate payments.
- **Controller Layer**: Manages the REST interface and maps request data to service methods.
- **Route Layer**: Exposes endpoints for order creation, history retrieval, and status updates.
- **Middleware Layer**: Standardized request validation and centralized error handling (consistent with Payment/Product services).

## 3. Folder Structure
```
packages/order-service/
├── src/
│   ├── controllers/
│   │   └── orderController.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── validateRequest.js
│   ├── models/
│   │   └── Order.js
│   ├── routes/
│   │   └── orderRoutes.js
│   ├── services/
│   │   └── orderService.js
│   └── server.js
└── package.json
```

## 4. Files Added
- `packages/order-service/package.json`
- `packages/order-service/src/server.js`
- `packages/order-service/src/models/Order.js`
- `packages/order-service/src/middleware/validateRequest.js`
- `packages/order-service/src/middleware/errorHandler.js`
- `packages/order-service/src/services/orderService.js`
- `packages/order-service/src/controllers/orderController.js`
- `packages/order-service/src/routes/orderRoutes.js`

## 5. Endpoints Added
- **`POST /v1/orders`**: Create a new order (triggers product validation and payment initiation).
- **`GET /v1/orders/user/:userId`**: Retrieve all orders for a specific user.
- **`GET /v1/orders/:orderId`**: Retrieve detailed information for a single order.
- **`PATCH /v1/orders/:orderId/status`**: Manually update order status (Internal/Admin use).
- **`GET /health`**: Service health check.

## 6. Validation Rules
Uses `express-validator`:
- **Order Creation**: Requires `userId`, non-empty `items` array (with `productId` and `quantity`), `shippingAddress` (street, city, country), and `paymentMethod`.
- **Status Check**: Ensures `orderId` is provided in the path.

## 7. Error Handling Strategy
- **Standardized Errors**: Reuses the shared `AppError` and `sendError` utilities.
- **Inter-service Resilience**: Catches `Axios` errors when communicating with Product/Payment services and maps them to clean API responses (e.g., `PRODUCT_SERVICE_ERROR`).
- **Contextual Logging**: Errors are logged with `correlationId` for distributed tracing.

## 8. Service Layer Design
The `OrderService` is the primary orchestrator:
1.  **Product Validation**: Iterates through requested items, calling the Product Service to ensure products exist and retrieve their current prices.
2.  **Transaction Management**: Creates the order record in a `PENDING` state first to ensure data persistence before external calls.
3.  **Payment Integration**: Synchronously (in simulation) calls the Payment Service to process the payment.
4.  **State Consolidation**: Updates the order status to `PAID` or `FAILED` based on the payment response.

## 9. Product Service Integration Design
- **URL Configuration**: Managed via `PRODUCT_SERVICE_URL` environment variable.
- **Protocol**: REST over HTTP.
- **Validation**: Ensures product `isActive` and uses the live price from the Product Service to prevent price tampering in the request body.

## 10. Payment Service Integration Design
- **URL Configuration**: Managed via `PAYMENT_SERVICE_URL` environment variable.
- **Protocol**: REST over HTTP.
- **Logic**: Forwards the order's `totalAmount` and `userId` to the Payment Service.
- **Traceability**: Stores the `transactionId` returned by the Payment Service as `paymentId` in the Order record.

## 11. Order Lifecycle Design
- `PENDING`: Order created, awaiting payment result.
- `PAID`: Payment successfully processed.
- `FAILED`: Payment rejected or service unavailable.
- `PROCESSING`: Order being prepared (via PATCH status).
- `SHIPPED`: Order handed to carrier.
- `DELIVERED`: Order received by customer.

## 12. Future Improvements
- **Asynchronous Processing**: Use a message broker (Redis Pub/Sub or RabbitMQ) for more resilient inter-service communication.
- **Saga Pattern**: Implement a distributed transaction pattern (Saga) to handle complex failure scenarios and rollbacks (e.g., if payment succeeds but order update fails).
- **Idempotency**: Add idempotent keys to order creation to prevent duplicate orders on network retries.

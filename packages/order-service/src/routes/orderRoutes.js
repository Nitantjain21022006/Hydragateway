/**
 * order-service/src/routes/orderRoutes.js
 *
 * RESTful routes for Order Service.
 */

const express = require('express');
const orderController = require('../controllers/orderController');
const { validateWith, createOrderRules, userOrdersRules, orderStatusRules } = require('../middleware/validateRequest');

const router = express.Router();

// Create order
router.post(
  '/',
  validateWith(createOrderRules),
  orderController.createOrder
);

// Get user orders
router.get(
  '/user/:userId',
  validateWith(userOrdersRules),
  orderController.getUserOrders
);

// Get order details
router.get(
  '/:orderId',
  validateWith(orderStatusRules),
  orderController.getOrderDetails
);

// Update order status (Internal/Admin)
router.patch(
  '/:orderId/status',
  validateWith(orderStatusRules),
  orderController.updateStatus
);

// Get all orders
router.get(
  '/',
  orderController.getAllOrders
);

module.exports = router;

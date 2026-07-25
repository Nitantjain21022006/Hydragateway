/**
 * Express router mapping RESTful HTTP endpoints for Order Service.
 * Connects routes for creation, listing, status updates, and user history to validation and controllers.
 * Exports Express router instance.
 */

const express = require('express');
const orderController = require('../controllers/orderController');
const { validateWith, createOrderRules, userOrdersRules, orderStatusRules } = require('../middleware/validateRequest');

const router = express.Router();

router.post(
  '/',
  validateWith(createOrderRules),
  orderController.createOrder
);

router.get(
  '/user/:userId',
  validateWith(userOrdersRules),
  orderController.getUserOrders
);

router.get(
  '/:orderId',
  validateWith(orderStatusRules),
  orderController.getOrderDetails
);

router.patch(
  '/:orderId/status',
  validateWith(orderStatusRules),
  orderController.updateStatus
);

router.get(
  '/',
  orderController.getAllOrders
);

module.exports = router;

/**
 * order-service/src/controllers/orderController.js
 *
 * Express controllers for Order routes.
 */

const orderService = require('../services/orderService');
const { sendSuccess } = require('../../../../shared/utils/errorResponse');

class OrderController {
  /**
   * POST /v1/orders
   */
  async createOrder(req, res, next) {
    try {
      const order = await orderService.createOrder(req.body);
      sendSuccess(res, order, 201, 'Order created successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /v1/orders/user/:userId
   */
  async getUserOrders(req, res, next) {
    try {
      const orders = await orderService.getOrdersByUser(req.params.userId);
      sendSuccess(res, orders, 200, 'User orders retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /v1/orders/:orderId
   */
  async getOrderDetails(req, res, next) {
    try {
      const order = await orderService.getOrderById(req.params.orderId);
      sendSuccess(res, order, 200, 'Order details retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /v1/orders/:orderId/status
   */
  async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const order = await orderService.updateOrderStatus(req.params.orderId, status);
      sendSuccess(res, order, 200, 'Order status updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /v1/orders
   */
  async getAllOrders(req, res, next) {
    try {
      const orders = await orderService.getAllOrders();
      sendSuccess(res, orders, 200, 'Orders retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new OrderController();

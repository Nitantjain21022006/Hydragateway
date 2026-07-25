/**
 * Controller handling order creation, retrieval by ID or user, status updates, and listing.
 * Invokes OrderService to fulfill order management business logic.
 * Exports OrderController instance.
 */

const orderService = require('../services/orderService');
const { sendSuccess } = require('../../../../shared/utils/errorResponse');

class OrderController {
  async createOrder(req, res, next) {
    try {
      const order = await orderService.createOrder(req.body);
      sendSuccess(res, order, 201, 'Order created successfully');
    } catch (err) {
      next(err);
    }
  }

  async getUserOrders(req, res, next) {
    try {
      const orders = await orderService.getOrdersByUser(req.params.userId);
      sendSuccess(res, orders, 200, 'User orders retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async getOrderDetails(req, res, next) {
    try {
      const order = await orderService.getOrderById(req.params.orderId);
      sendSuccess(res, order, 200, 'Order details retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const order = await orderService.updateOrderStatus(req.params.orderId, status);
      sendSuccess(res, order, 200, 'Order status updated successfully');
    } catch (err) {
      next(err);
    }
  }

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

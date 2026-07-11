/**
 * order-service/src/services/orderService.js
 *
 * Business logic for Orders.
 * Orchestrates communication with Product and Payment services.
 */

const axios = require('axios');
const Order = require('../models/Order');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');
const { CircuitBreaker } = require('../../../../shared/utils/circuitBreaker');

const logger = createServiceLogger('order-service');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4003';

// ── Instantiate Circuit Breakers ──────────────────────────────────────────────
const paymentCircuitBreaker = new CircuitBreaker({ name: 'payment-service' });
const productCircuitBreaker = new CircuitBreaker({ name: 'product-service' });

class OrderService {
  /**
   * Create a new order
   */
  async createOrder(orderData) {
    const { userId, items, shippingAddress, paymentMethod } = orderData;

    logger.info(`Creating order for user: ${userId}`);

    // 1. Validate items and calculate total
    let totalAmount = 0;
    const enrichedItems = [];

    for (const item of items) {
      try {
        const response = await productCircuitBreaker.fire(async () => {
          return await axios.get(`${PRODUCT_SERVICE_URL}/v1/products/${item.productId}`);
        });
        const product = response.data.data.product;

        if (!product || !product.isActive) {
          throw new AppError(`Product ${item.productId} is not available`, 400, 'PRODUCT_UNAVAILABLE');
        }

        const priceAtTime = product.price;
        const itemTotal = priceAtTime * item.quantity;
        totalAmount += itemTotal;

        enrichedItems.push({
          productId: item.productId,
          name: product.name,
          quantity: item.quantity,
          priceAtTime: priceAtTime,
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.error(`Error validating product ${item.productId}: ${err.message}`);
        throw new AppError(`Validation failed for product ${item.productId}`, err.response?.status || 500, 'PRODUCT_SERVICE_ERROR');
      }
    }

    // 2. Create Order in PENDING state
    const order = new Order({
      userId,
      items: enrichedItems,
      totalAmount,
      shippingAddress,
      status: 'PENDING',
    });

    await order.save();
    logger.info(`Order ${order.id} saved in PENDING state`);

    // 3. Initiate Payment
    try {
      logger.info(`Initiating payment for Order: ${order.id} via ${paymentMethod}`);
      const paymentResponse = await paymentCircuitBreaker.fire(async () => {
        return await axios.post(`${PAYMENT_SERVICE_URL}/v1/payments`, {
          userId,
          amount: totalAmount,
          paymentMethod,
          orderId: order.id,
        });
      });

      const payment = paymentResponse.data.data.payment;
      order.paymentId = payment.transactionId;

      if (payment.status === 'COMPLETED') {
        order.status = 'PAID';
        logger.info(`Order ${order.id} payment COMPLETED`);
      } else {
        order.status = 'FAILED';
        logger.warn(`Order ${order.id} payment FAILED`);
      }
    } catch (err) {
      logger.error(`Payment initiation failed for Order ${order.id}: ${err.message}`, {
        code: err.code,
        status: err.status,
      });
      order.status = 'FAILED';
    }

    await order.save();
    return order;
  }

  /**
   * Get orders for a specific user
   */
  async getOrdersByUser(userId) {
    return await Order.find({ userId }).sort('-createdAt');
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND');
    }
    return order;
  }

  /**
   * Update order status manually (e.g. for SHIPPING)
   */
  async updateOrderStatus(orderId, status) {
    const order = await Order.findByIdAndUpdate(
      orderId,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND');
    }

    logger.info(`Order ${orderId} status updated to ${status}`);
    return order;
  }

  /**
   * Get all orders
   */
  async getAllOrders() {
    return await Order.find().sort('-createdAt');
  }
}

module.exports = new OrderService();

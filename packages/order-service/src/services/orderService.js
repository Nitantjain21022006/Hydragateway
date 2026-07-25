/**
 * Business logic service layer for order processing, item validation, and payment trigger integration.
 * Communicates with Product and Payment microservices using circuit breakers.
 * After order creation, publishes order.created to Kafka for async downstream processing.
 * Exports OrderService instance.
 */

'use strict';

const axios = require('axios');
const Order = require('../models/Order');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');
const { CircuitBreaker } = require('../../../../shared/utils/circuitBreaker');
const producer = require('../../../../shared/kafka/producer');
const { TOPICS } = require('../../../../shared/kafka/topics');

const logger = createServiceLogger('order-service');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:4003';

const paymentCircuitBreaker = new CircuitBreaker({ name: 'payment-service' });
const productCircuitBreaker = new CircuitBreaker({ name: 'product-service' });

class OrderService {
  async createOrder(orderData) {
    const { userId, items, shippingAddress, paymentMethod, correlationId } = orderData;

    logger.info(`Creating order for user: ${userId}`);

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
          productId:   item.productId,
          name:        product.name,
          quantity:    item.quantity,
          priceAtTime: priceAtTime,
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.error(`Error validating product ${item.productId}: ${err.message}`);
        throw new AppError(`Validation failed for product ${item.productId}`, err.response?.status || 500, 'PRODUCT_SERVICE_ERROR');
      }
    }

    const order = new Order({
      userId,
      items: enrichedItems,
      totalAmount,
      shippingAddress,
      status: 'PENDING',
    });

    await order.save();
    logger.info(`Order ${order.id} saved in PENDING state`);

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

    setImmediate(async () => {
      await producer.publish(
        TOPICS.ORDER_CREATED,
        order.id,
        {
          eventType:       'order.created',
          orderId:         order.id,
          userId,
          items:           enrichedItems,
          totalAmount,
          paymentMethod,
          shippingAddress,
          status:          order.status,
          paymentId:       order.paymentId || null,
          correlationId:   correlationId || null,
          timestamp:       new Date().toISOString(),
        }
      );
    });

    return order;
  }

  async getOrdersByUser(userId) {
    return await Order.find({ userId }).sort('-createdAt');
  }

  async getOrderById(orderId) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND');
    }
    return order;
  }

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

  async getAllOrders() {
    return await Order.find().sort('-createdAt');
  }
}

module.exports = new OrderService();

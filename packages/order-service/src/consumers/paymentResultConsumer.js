/**
 * Kafka consumer for Order Service listening to payment result events.
 * Consumes payment.failed events and reconciles order status in MongoDB asynchronously.
 * Exports start and disconnect lifecycle functions.
 */

'use strict';

const { createConsumer } = require('../../../../shared/kafka/consumer');
const { TOPICS }         = require('../../../../shared/kafka/topics');
const Order              = require('../models/Order');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('order-service-kafka');

const consumer = createConsumer(
  'order-payment-result',
  [TOPICS.PAYMENT_FAILED],
  async ({ topic, partition, offset, payload, headers }) => {
    const { orderId, transactionId, failureReason, correlationId } = payload;

    if (!orderId) {
      logger.warn('[PaymentResultConsumer] Received payment.failed without orderId — skipping', {
        topic, partition, offset,
      });
      return;
    }

    logger.info('[PaymentResultConsumer] Processing payment.failed event', {
      orderId,
      transactionId,
      failureReason,
      correlationId: correlationId || headers.correlationId,
      topic,
      partition,
      offset,
    });

    try {
      const order = await Order.findById(orderId);
      if (!order) {
        logger.warn('[PaymentResultConsumer] Order not found for payment.failed reconciliation', { orderId });
        return;
      }

      if (order.status === 'FAILED' || order.status === 'KAFKA_FAILED') {
        logger.info('[PaymentResultConsumer] Order already in failed state — skipping', {
          orderId,
          currentStatus: order.status,
        });
        return;
      }

      order.status = 'KAFKA_FAILED';
      await order.save();

      logger.info('[PaymentResultConsumer] Order status reconciled via Kafka', {
        orderId,
        newStatus: 'KAFKA_FAILED',
        correlationId: correlationId || headers.correlationId,
      });
    } catch (err) {
      logger.error('[PaymentResultConsumer] Error reconciling order status', {
        orderId,
        error: err.message,
      });
    }
  }
);

module.exports = consumer;

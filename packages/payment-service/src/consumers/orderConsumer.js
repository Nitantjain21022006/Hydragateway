/**
 * Kafka consumer for Payment Service processing order.created events asynchronously.
 * Simulates async payment processing and publishes payment.completed or payment.failed events.
 * Exports start and disconnect lifecycle functions.
 */

'use strict';

const { createConsumer } = require('../../../../shared/kafka/consumer');
const producer           = require('../../../../shared/kafka/producer');
const { TOPICS }         = require('../../../../shared/kafka/topics');
const Payment            = require('../models/Payment');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('payment-service-kafka');

const consumer = createConsumer(
  'payment-order-processor',
  [TOPICS.ORDER_CREATED],
  async ({ topic, partition, offset, payload, headers }) => {
    const { orderId, userId, totalAmount, paymentMethod, items, correlationId } = payload;

    if (!orderId || !userId || !totalAmount) {
      logger.warn('[OrderConsumer] Incomplete order.created payload — skipping', {
        topic, partition, offset, orderId,
      });
      return;
    }

    logger.info('[OrderConsumer] Processing order.created event', {
      orderId,
      userId,
      totalAmount,
      paymentMethod,
      correlationId: correlationId || headers.correlationId,
      topic,
      partition,
      offset,
    });

    const existingPayment = await Payment.findOne({ orderId });
    if (existingPayment) {
      logger.info('[OrderConsumer] Payment already exists for this order — publishing result', {
        orderId,
        status: existingPayment.status,
        transactionId: existingPayment.transactionId,
      });

      const resultTopic = existingPayment.status === 'COMPLETED'
        ? TOPICS.PAYMENT_COMPLETED
        : TOPICS.PAYMENT_FAILED;

      await producer.publish(resultTopic, orderId, {
        eventType:     resultTopic,
        orderId,
        userId,
        transactionId: existingPayment.transactionId,
        amount:        existingPayment.amount,
        status:        existingPayment.status,
        correlationId: correlationId || headers.correlationId || null,
        timestamp:     new Date().toISOString(),
      });

      return;
    }

    const payment = new Payment({
      userId,
      amount: totalAmount,
      paymentMethod: paymentMethod || 'CREDIT_CARD',
      orderId,
      status: 'PENDING',
    });
    await payment.save();

    logger.info(`[OrderConsumer] Async payment initiated for Order: ${orderId}`, {
      transactionId: payment.transactionId,
    });

    const isSuccess = Math.random() > 0.1;

    await new Promise(resolve => setTimeout(resolve, 500));

    if (isSuccess) {
      payment.status = 'COMPLETED';
      payment.processedAt = new Date();
      logger.info(`[OrderConsumer] Async transaction ${payment.transactionId} COMPLETED`);
    } else {
      payment.status = 'FAILED';
      payment.failureReason = 'Async payment gateway rejection';
      logger.warn(`[OrderConsumer] Async transaction ${payment.transactionId} FAILED`);
    }

    await payment.save();

    const resultTopic = payment.status === 'COMPLETED'
      ? TOPICS.PAYMENT_COMPLETED
      : TOPICS.PAYMENT_FAILED;

    await producer.publish(resultTopic, orderId, {
      eventType:     resultTopic,
      orderId,
      userId,
      transactionId: payment.transactionId,
      amount:        payment.amount,
      status:        payment.status,
      failureReason: payment.failureReason || null,
      items,
      correlationId: correlationId || headers.correlationId || null,
      timestamp:     new Date().toISOString(),
    });
  }
);

module.exports = consumer;

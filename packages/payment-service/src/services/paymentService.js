/**
 * payment-service/src/services/paymentService.js
 *
 * Business logic for Payments.
 * Implements payment simulation and history tracking.
 */

const Payment = require('../models/Payment');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('payment-service');

class PaymentService {
  /**
   * Process a payment (Simulation)
   */
  async processPayment(paymentData) {
    // 1. Initialize payment record as PENDING
    const payment = new Payment({
      ...paymentData,
      status: 'PENDING'
    });
    await payment.save();

    logger.info(`Simulating payment processing for Transaction: ${payment.transactionId}`);

    // 2. Perform Simulation Logic
    // In a real system, this would call a gateway like Stripe/PayPal
    const isSuccess = Math.random() > 0.1; // 90% success rate simulation

    // Simulate async processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (isSuccess) {
      payment.status = 'COMPLETED';
      payment.processedAt = new Date();
      logger.info(`Transaction ${payment.transactionId} COMPLETED`);
    } else {
      payment.status = 'FAILED';
      payment.failureReason = 'Simulated payment gateway rejection';
      logger.warn(`Transaction ${payment.transactionId} FAILED: ${payment.failureReason}`);
    }

    await payment.save();
    return payment;
  }

  /**
   * Get payment history for a user
   */
  async getPaymentHistory(userId) {
    return await Payment.find({ userId }).sort('-createdAt');
  }

  /**
   * Get detail/status of a specific transaction
   */
  async getTransactionStatus(transactionId) {
    const payment = await Payment.findOne({ transactionId });
    if (!payment) {
      throw new AppError('Transaction not found', 404, 'NOT_FOUND');
    }
    return payment;
  }
}

module.exports = new PaymentService();

/**
 * Business logic service layer for simulating payment processing and transaction queries.
 * Manages payment record persistence, status transitions, and user transaction history.
 * Exports PaymentService instance.
 */

const Payment = require('../models/Payment');
const { AppError } = require('../../../../shared/utils/errorResponse');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('payment-service');

class PaymentService {
  async processPayment(paymentData) {
    const payment = new Payment({
      ...paymentData,
      status: 'PENDING'
    });
    await payment.save();

    logger.info(`Simulating payment processing for Transaction: ${payment.transactionId}`);

    const isSuccess = Math.random() > 0.1;

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

  async getPaymentHistory(userId) {
    return await Payment.find({ userId }).sort('-createdAt');
  }

  async getTransactionStatus(transactionId) {
    const payment = await Payment.findOne({ transactionId });
    if (!payment) {
      throw new AppError('Transaction not found', 404, 'NOT_FOUND');
    }
    return payment;
  }

  async getAllPayments() {
    return await Payment.find().sort('-createdAt');
  }
}

module.exports = new PaymentService();

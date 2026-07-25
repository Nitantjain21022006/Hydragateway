/**
 * Controller handling payment initiation, transaction history, status queries, and payment listing.
 * Delegates payment processing and queries to PaymentService.
 * Exports initiatePayment, getHistory, getStatus, and getAllPayments.
 */

const paymentService = require('../services/paymentService');
const { sendSuccess } = require('../../../../shared/utils/errorResponse');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');

const initiatePayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.processPayment(req.body);
  sendSuccess(res, { payment }, 201);
});

const getHistory = asyncHandler(async (req, res) => {
  const history = await paymentService.getPaymentHistory(req.params.userId);
  sendSuccess(res, { history });
});

const getStatus = asyncHandler(async (req, res) => {
  const payment = await paymentService.getTransactionStatus(req.params.transactionId);
  sendSuccess(res, { 
    transactionId: payment.transactionId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    processedAt: payment.processedAt,
    failureReason: payment.failureReason
  });
});

const getAllPayments = asyncHandler(async (req, res) => {
  const payments = await paymentService.getAllPayments();
  sendSuccess(res, { payments });
});

module.exports = {
  initiatePayment,
  getHistory,
  getStatus,
  getAllPayments
};

/**
 * payment-service/src/controllers/paymentController.js
 *
 * Express controllers for Payment endpoints.
 */

const paymentService = require('../services/paymentService');
const { sendSuccess } = require('../../../../shared/utils/errorResponse');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');

/**
 * POST /v1/payments
 * Initiate a payment process
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.processPayment(req.body);
  sendSuccess(res, { payment }, 201);
});

/**
 * GET /v1/payments/history/:userId
 * Retrieve user's payment history
 */
const getHistory = asyncHandler(async (req, res) => {
  const history = await paymentService.getPaymentHistory(req.params.userId);
  sendSuccess(res, { history });
});

/**
 * GET /v1/payments/:transactionId/status
 * Check status of a transaction
 */
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

module.exports = {
  initiatePayment,
  getHistory,
  getStatus
};

/**
 * payment-service/src/routes/paymentRoutes.js
 *
 * RESTful routes for Payment Service.
 */

const express = require('express');
const { validateWith, createPaymentRules, statusRules, historyRules } = require('../middleware/validateRequest');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

/**
 * @route   POST /v1/payments
 * @desc    Process a simulated payment
 * @access  Internal/User
 */
router.post(
  '/',
  validateWith(createPaymentRules),
  paymentController.initiatePayment
);

/**
 * @route   GET /v1/payments/history/:userId
 * @desc    Get user transaction history
 * @access  Protected
 */
router.get(
  '/history/:userId',
  validateWith(historyRules),
  paymentController.getHistory
);

/**
 * @route   GET /v1/payments/:transactionId/status
 * @desc    Check status of a transaction
 * @access  Protected
 */
router.get(
  '/:transactionId/status',
  validateWith(statusRules),
  paymentController.getStatus
);

/**
 * @route   GET /v1/payments
 * @desc    Get all payments
 * @access  Protected
 */
router.get(
  '/',
  paymentController.getAllPayments
);

module.exports = router;

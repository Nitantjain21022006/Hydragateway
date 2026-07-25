/**
 * Express router mapping payment processing and transaction status endpoints.
 * Routes payment requests to validation middleware and payment controller handlers.
 * Exports Express router instance.
 */

const express = require('express');
const { validateWith, createPaymentRules, statusRules, historyRules } = require('../middleware/validateRequest');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post(
  '/',
  validateWith(createPaymentRules),
  paymentController.initiatePayment
);

router.get(
  '/history/:userId',
  validateWith(historyRules),
  paymentController.getHistory
);

router.get(
  '/:transactionId/status',
  validateWith(statusRules),
  paymentController.getStatus
);

router.get(
  '/',
  paymentController.getAllPayments
);

module.exports = router;

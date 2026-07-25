/**
 * Express validator rules and middleware for Payment Service endpoints.
 * Validates payment creation payloads, transaction IDs, and user ID URL parameters.
 * Exports validateWith, createPaymentRules, statusRules, and historyRules.
 */

const { body, param, validationResult } = require('express-validator');
const { AppError } = require('../../../../shared/utils/errorResponse');

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 422, 'VALIDATION_ERROR', errors.array());
  }
}

const createPaymentRules = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('amount').isNumeric().withMessage('Amount must be a number').custom(val => val > 0).withMessage('Amount must be greater than 0'),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter code'),
  body('paymentMethod').notEmpty().withMessage('Payment method is required').isIn(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'STRIPE_SIMULATION']).withMessage('Invalid payment method'),
  body('orderId').optional().isString().withMessage('Order ID must be a string'),
];

const statusRules = [
  param('transactionId').notEmpty().withMessage('Transaction ID is required'),
];

const historyRules = [
  param('userId').notEmpty().withMessage('User ID is required'),
];

function validateWith(rules) {
  return [
    ...rules,
    (req, _res, next) => {
      try {
        validate(req);
        next();
      } catch (err) {
        next(err);
      }
    },
  ];
}

module.exports = { validateWith, createPaymentRules, statusRules, historyRules };

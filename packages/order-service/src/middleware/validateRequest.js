/**
 * Express validator middleware and validation chains for Order Service requests.
 * Enforces schema validation rules on order creation and lookup parameters.
 * Exports validateWith, createOrderRules, userOrdersRules, and orderStatusRules.
 */

const { body, param, validationResult } = require('express-validator');
const { AppError } = require('../../../../shared/utils/errorResponse');

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 422, 'VALIDATION_ERROR', errors.array());
  }
}

const createOrderRules = [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('items').isArray({ min: 1 }).withMessage('Items must be a non-empty array'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be an integer >= 1'),
  body('shippingAddress').notEmpty().withMessage('Shipping address is required'),
  body('shippingAddress.street').notEmpty().withMessage('Street is required'),
  body('shippingAddress.city').notEmpty().withMessage('City is required'),
  body('shippingAddress.country').notEmpty().withMessage('Country is required'),
  body('paymentMethod').notEmpty().withMessage('Payment method is required').isIn(['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'STRIPE_SIMULATION']).withMessage('Invalid payment method'),
];

const userOrdersRules = [
  param('userId').notEmpty().withMessage('User ID is required'),
];

const orderStatusRules = [
  param('orderId').notEmpty().withMessage('Order ID is required'),
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

module.exports = { validateWith, createOrderRules, userOrdersRules, orderStatusRules };

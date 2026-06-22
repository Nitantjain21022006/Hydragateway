/**
 * auth-service/src/middleware/validateRequest.js
 *
 * Validates incoming request bodies using express-validator.
 * Throws a standardised AppError with details on failure so the
 * error handler can return structured validation feedback to the client.
 */

const { body, validationResult } = require('express-validator');
const { AppError } = require('../../../../shared/utils/errorResponse');

/** Run validators and collect errors */
function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 422, 'VALIDATION_ERROR', errors.array());
  }
}

/** Validation chain for registration */
const registerRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Must be a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
];

/** Validation chain for login */
const loginRules = [
  body('email').trim().notEmpty().isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

/** Middleware factory – runs given rules, then validates */
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

module.exports = { validateWith, registerRules, loginRules };

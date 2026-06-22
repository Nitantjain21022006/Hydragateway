/**
 * auth-service/src/routes/authRoutes.js
 */

const express = require('express');
const {
  register,
  login,
  logout,
  me,
  validateToken,
} = require('../controllers/authController');
const {
  validateWith,
  registerRules,
  loginRules,
} = require('../middleware/validateRequest');
const { internalAuth } = require('../../../../shared/middleware/internalAuth');

const router = express.Router();

// Public routes
router.post('/register', validateWith(registerRules), register);
router.post('/login', validateWith(loginRules), login);
router.post('/logout', logout);

// Protected – requires client JWT (set by Gateway middleware, passed as req.user)
router.get('/me', me);

// Internal – only callable by Gateway with X-Internal-Secret
router.post('/validate', internalAuth, validateToken);

module.exports = router;

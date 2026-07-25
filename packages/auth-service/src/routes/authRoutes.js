/**
 * Express router defining authentication endpoints.
 * Configures routes for register, login, logout, me, and internal token validation.
 * Exports Express router instance.
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

router.post('/register', validateWith(registerRules), register);
router.post('/login', validateWith(loginRules), login);
router.post('/logout', logout);
router.get('/me', me);
router.post('/validate', internalAuth, validateToken);

module.exports = router;

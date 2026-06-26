/**
 * auth-service/src/controllers/authController.js
 *
 * Handles: Register, Login, Logout, Me (token validation probe).
 *
 * Design decisions:
 * - JWT is signed with HS256 using the JWT_SECRET env var.
 * - Logout is stateless at this layer – the Gateway Redis layer can
 *   maintain a token blocklist if needed (future enhancement).
 * - On login we update lastLoginAt for audit purposes.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError, sendSuccess } = require('../../../../shared/utils/errorResponse');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');

/** Generate a signed JWT for a user */
function signToken(userId, role) {
  return jwt.sign(
    { sub: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

/**
 * POST /v1/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const user = await User.create({ name, email, password });
  const token = signToken(user._id, user.role);

  sendSuccess(res, { token, user }, 201);
});

/**
 * POST /v1/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Explicitly select password (hidden by default on schema)
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403, 'ACCOUNT_INACTIVE');
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id, user.role);
  sendSuccess(res, { token, user });
});

/**
 * POST /v1/auth/logout
 * Stateless logout – client must discard the token.
 * A future enhancement would add the token to a Redis blocklist.
 */
const logout = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Logged out successfully' });
});

/**
 * GET /v1/auth/me
 * Returns the authenticated user's profile.
 * Requires the Gateway JWT middleware to populate req.user.
 */
const me = asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'] || (req.user && req.user.sub);
  if (!userId) {
    throw new AppError('User ID not found in request headers', 401, 'UNAUTHORIZED');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }
  sendSuccess(res, { user });
});

/**
 * POST /v1/auth/validate  (internal route – called by Gateway)
 * Validates a JWT and returns the decoded payload.
 */
const validateToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    throw new AppError('Token is required', 400, 'MISSING_TOKEN');
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    sendSuccess(res, { decoded });
  } catch {
    throw new AppError('Invalid or expired token', 401, 'INVALID_TOKEN');
  }
});

module.exports = { register, login, logout, me, validateToken };

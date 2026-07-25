/**
 * Controller handling user registration, authentication, logout, profile retrieval, and token validation.
 * Interacts with User model and generates JWT tokens.
 * On successful login, publishes a user.login analytics event to Kafka asynchronously.
 * Exports register, login, logout, me, and validateToken controller handlers.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError, sendSuccess } = require('../../../../shared/utils/errorResponse');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');
const producer = require('../../../../shared/kafka/producer');
const { TOPICS } = require('../../../../shared/kafka/topics');

function signToken(userId, role) {
  return jwt.sign(
    { sub: userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

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

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

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

  setImmediate(async () => {
    await producer.publish(
      TOPICS.ANALYTICS_EVENT,
      user._id.toString(),
      {
        eventType:     'user.login',
        userId:        user._id.toString(),
        email:         user.email,
        role:          user.role,
        correlationId: req.correlationId || null,
        timestamp:     new Date().toISOString(),
      }
    );
  });

  sendSuccess(res, { token, user });
});

const logout = asyncHandler(async (_req, res) => {
  sendSuccess(res, { message: 'Logged out successfully' });
});

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

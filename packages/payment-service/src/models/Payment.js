/**
 * payment-service/src/models/Payment.js
 *
 * Mongoose Payment schema.
 *
 * Design decisions:
 * -userId and amount are required for any transaction.
 * - orderId is optional for now (as Order Service is Phase 5), but will be key for integration.
 * - status tracks the lifecycle: PENDING -> COMPLETED/FAILED.
 * - transactionId is a unique UUID generated for each payment attempt.
 * - toJSON transformation for clean API responses.
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const paymentSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      index: true,
    },
    orderId: {
      type: String,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: ['CREDIT_CARD', 'DEBIT_CARD', 'PAYPAL', 'STRIPE_SIMULATION'],
    },
    failureReason: {
      type: String,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;

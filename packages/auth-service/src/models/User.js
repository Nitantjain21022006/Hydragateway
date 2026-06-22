/**
 * auth-service/src/models/User.js
 *
 * Mongoose User schema.
 *
 * Design decisions:
 * - `email` is unique + lowercased at the schema level so duplicate
 *   inserts fail at the DB layer, not in application code.
 * - `password` has `select: false` so it is never returned in a query
 *   result unless explicitly requested with .select('+password').
 * - `comparePassword` is an instance method, keeping password logic
 *   co-located with the model.
 * - `toJSON` strips __v and _id (replaced by id) for a clean API surface.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never included in query results by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
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
        delete ret.password;
        return ret;
      },
    },
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  this.password = await bcrypt.hash(this.password, rounds);
  next();
});

// Instance method: compare plaintext password with stored hash
userSchema.methods.comparePassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;

/**
 * product-service/src/models/Product.js
 *
 * Mongoose Product schema.
 *
 * Design decisions:
 * - name, price, and category are required.
 * - stock defaults to 0.
 * - isActive allows for soft-hiding products from the catalog.
 * - toJSON transformation for clean API responses (stripping __v, mapping _id to id).
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    category: {
      type: String,
      required: [true, 'Product category is required'],
      trim: true,
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Index name for search functionality
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;

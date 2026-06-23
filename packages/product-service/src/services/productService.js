/**
 * product-service/src/services/productService.js
 *
 * Business logic for Products.
 *
 * Encapsulating logic here keeps controllers lean and makes it easier
 * to reuse this logic in other contexts (e.g. CLI tools or internal events).
 */

const Product = require('../models/Product');
const { AppError } = require('../../../../shared/utils/errorResponse');

class ProductService {
  /**
   * Create a new product
   */
  async createProduct(productData) {
    return await Product.create(productData);
  }

  /**
   * Get all products with optional filtering
   */
  async getAllProducts(filters = {}) {
    const query = { isActive: true, ...filters };
    return await Product.find(query).sort('-createdAt');
  }

  /**
   * Get product by ID
   */
  async getProductById(id) {
    const product = await Product.findById(id);
    if (!product) {
      throw new AppError('Product not found', 404, 'NOT_FOUND');
    }
    return product;
  }

  /**
   * Update a product
   */
  async updateProduct(id, updateData) {
    const product = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });
    if (!product) {
      throw new AppError('Product not found', 404, 'NOT_FOUND');
    }
    return product;
  }

  /**
   * Delete a product (Soft delete by setting isActive: false)
   */
  async deleteProduct(id) {
    const product = await Product.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    if (!product) {
      throw new AppError('Product not found', 404, 'NOT_FOUND');
    }
    return product;
  }
}

module.exports = new ProductService();

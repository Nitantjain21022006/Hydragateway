/**
 * Business logic service layer for Product management.
 * Encapsulates MongoDB product queries, active filtering, updates, and soft deletions.
 * Exports ProductService instance.
 */

const Product = require('../models/Product');
const { AppError } = require('../../../../shared/utils/errorResponse');

class ProductService {
  async createProduct(productData) {
    return await Product.create(productData);
  }

  async getAllProducts(filters = {}) {
    const query = { isActive: true, ...filters };
    return await Product.find(query).sort('-createdAt');
  }

  async getProductById(id) {
    const product = await Product.findById(id);
    if (!product) {
      throw new AppError('Product not found', 404, 'NOT_FOUND');
    }
    return product;
  }

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

/**
 * product-service/src/controllers/productController.js
 *
 * Express controllers for Product lifecycle.
 * Uses productService for business logic and sendSuccess for responses.
 */

const productService = require('../services/productService');
const { sendSuccess } = require('../../../../shared/utils/errorResponse');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');
const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('product-service');

/**
 * invalidateCache - Deletes product-related keys from Redis.
 */
async function invalidateCache(productId = null) {
  try {
    const redis = getRedisClient();
    const keys = ['cache:products:all'];
    if (productId) {
      keys.push(`cache:products:${productId}`);
    }
    await redis.del(...keys);
    logger.debug(`[Cache] Invalidated keys: ${keys.join(', ')}`);
  } catch (err) {
    logger.warn(`[Cache] Invalidation failed: ${err.message}`);
  }
}

/**
 * POST /v1/products
 */
const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  await invalidateCache();
  sendSuccess(res, { product }, 201);
});

/**
 * GET /v1/products
 */
const getAllProducts = asyncHandler(async (req, res) => {
  // Simple filtering by category if provided in query
  const filters = {};
  if (req.query.category) filters.category = req.query.category;

  const products = await productService.getAllProducts(filters);
  sendSuccess(res, { products });
});

/**
 * GET /v1/products/:id
 */
const getProductById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  sendSuccess(res, { product });
});

/**
 * PATCH /v1/products/:id
 */
const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  await invalidateCache(req.params.id);
  sendSuccess(res, { product });
});

/**
 * DELETE /v1/products/:id
 */
const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  await invalidateCache(req.params.id);
  sendSuccess(res, { message: 'Product deleted successfully' });
});

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};

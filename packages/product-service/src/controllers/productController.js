/**
 * Controller handling product creation, catalog queries, updates, deletions, and Redis cache invalidation.
 * Interacts with ProductService and handles HTTP responses.
 * Exports createProduct, getAllProducts, getProductById, updateProduct, and deleteProduct.
 */

const productService = require('../services/productService');
const { sendSuccess } = require('../../../../shared/utils/errorResponse');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');
const { getRedisClient } = require('../../../../shared/config/redisClient');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('product-service');

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

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  await invalidateCache();
  sendSuccess(res, { product }, 201);
});

const getAllProducts = asyncHandler(async (req, res) => {
  const filters = {};
  if (req.query.category) filters.category = req.query.category;

  const products = await productService.getAllProducts(filters);
  sendSuccess(res, { products });
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  sendSuccess(res, { product });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  await invalidateCache(req.params.id);
  sendSuccess(res, { product });
});

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

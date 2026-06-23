/**
 * product-service/src/routes/productRoutes.js
 *
 * RESTful routes for Product Service.
 */

const express = require('express');
const { body, param } = require('express-validator');
const productController = require('../controllers/productController');

const router = express.Router();

// ── Validation Rules ────────────────────────────────────────────────────────

const productValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('stock').optional().isNumeric().withMessage('Stock must be a number'),
];

const idValidation = [
  param('id').isMongoId().withMessage('Invalid product ID format'),
];

// ── Routes ──────────────────────────────────────────────────────────────────

router.post('/', productValidation, productController.createProduct);
router.get('/', productController.getAllProducts);

router.get('/:id', idValidation, productController.getProductById);
router.patch('/:id', [...idValidation, ...productValidation.map(v => v.optional())], productController.updateProduct);
router.delete('/:id', idValidation, productController.deleteProduct);

module.exports = router;

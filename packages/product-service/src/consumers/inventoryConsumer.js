/**
 * Kafka consumer for Product Service processing payment.completed events for inventory reduction.
 * Consumes payment.completed, reduces stock for ordered items, and publishes inventory.updated events.
 * Exports start and disconnect lifecycle functions.
 */

'use strict';

const { createConsumer } = require('../../../../shared/kafka/consumer');
const producer           = require('../../../../shared/kafka/producer');
const { TOPICS }         = require('../../../../shared/kafka/topics');
const Product            = require('../models/Product');
const { createServiceLogger } = require('../../../../shared/utils/logger');

const logger = createServiceLogger('product-service-kafka');

const consumer = createConsumer(
  'product-inventory',
  [TOPICS.PAYMENT_COMPLETED],
  async ({ topic, partition, offset, payload, headers }) => {
    const { orderId, userId, items, correlationId } = payload;

    if (!orderId || !items || !Array.isArray(items) || items.length === 0) {
      logger.warn('[InventoryConsumer] Incomplete payment.completed payload — skipping', {
        topic, partition, offset, orderId,
      });
      return;
    }

    logger.info('[InventoryConsumer] Processing payment.completed — reducing inventory', {
      orderId,
      userId,
      itemCount: items.length,
      correlationId: correlationId || headers.correlationId,
      topic,
      partition,
      offset,
    });

    for (const item of items) {
      const { productId, quantity, name } = item;
      if (!productId || !quantity) continue;

      try {
        const updated = await Product.findByIdAndUpdate(
          productId,
          { $inc: { stock: -Math.abs(quantity) } },
          { new: true, runValidators: false }
        );

        if (!updated) {
          logger.warn('[InventoryConsumer] Product not found for inventory update', {
            productId, orderId,
          });
          continue;
        }

        logger.info('[InventoryConsumer] Inventory reduced', {
          productId,
          productName:  name || updated.name,
          quantityDeducted: quantity,
          newStock:     updated.stock,
          orderId,
          correlationId: correlationId || headers.correlationId,
        });

        setImmediate(async () => {
          await producer.publish(
            TOPICS.INVENTORY_UPDATED,
            productId,
            {
              eventType:       'inventory.updated',
              productId,
              productName:     updated.name,
              quantityDeducted: quantity,
              newStock:        updated.stock,
              orderId,
              userId,
              correlationId:   correlationId || headers.correlationId || null,
              timestamp:       new Date().toISOString(),
            }
          );
        });
      } catch (err) {
        logger.error('[InventoryConsumer] Failed to update inventory for product', {
          productId,
          orderId,
          error: err.message,
        });
      }
    }
  }
);

module.exports = consumer;

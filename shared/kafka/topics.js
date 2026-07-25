/**
 * Centralized Kafka topic name constants for HydraGateway event-driven communication.
 * All producers and consumers must import topic names from this module.
 * Exports TOPICS object with all topic name strings.
 */

'use strict';

const TOPICS = {
  ORDER_CREATED:      'order.created',
  PAYMENT_COMPLETED:  'payment.completed',
  PAYMENT_FAILED:     'payment.failed',
  INVENTORY_UPDATED:  'inventory.updated',
  ANALYTICS_EVENT:    'analytics.event',
};

module.exports = { TOPICS };

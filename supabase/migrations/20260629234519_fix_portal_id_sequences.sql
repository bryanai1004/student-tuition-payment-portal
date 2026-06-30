-- Resync Postgres sequences after legacy data imports (prevents duplicate pkey errors).

SELECT setval(
  'portal_billing_adjustments_id_seq',
  COALESCE((SELECT MAX(id) FROM portal_billing_adjustments), 1),
  true
);

SELECT setval(
  'portal_store_orders_id_seq',
  COALESCE((SELECT MAX(id) FROM portal_store_orders), 1),
  true
);

SELECT setval(
  'portal_store_order_items_id_seq',
  COALESCE((SELECT MAX(id) FROM portal_store_order_items), 1),
  true
);

SELECT setval(
  'portal_payments_id_seq',
  COALESCE((SELECT MAX(id) FROM portal_payments), 1),
  true
);

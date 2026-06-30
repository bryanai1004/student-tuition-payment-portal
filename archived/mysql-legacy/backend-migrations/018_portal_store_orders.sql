-- Student portal fee store: orders link catalog purchases to portal_billing_adjustments + portal_payments.

CREATE TABLE IF NOT EXISTS portal_store_orders (
  id BIGSERIAL PRIMARY KEY,
  student_external_id VARCHAR(64) NOT NULL,
  term VARCHAR(32) NOT NULL,
  year INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  subtotal DECIMAL(12, 2) NOT NULL,
  provider_transaction_id VARCHAR(128) NULL,
  invoice_number VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_store_orders_student_term
  ON portal_store_orders (student_external_id, term, year);

CREATE TABLE IF NOT EXISTS portal_store_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES portal_store_orders(id) ON DELETE CASCADE,
  fee_code VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  line_total DECIMAL(12, 2) NOT NULL,
  billing_adjustment_id BIGINT NULL,
  notes TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_store_order_items_order
  ON portal_store_order_items (order_id);

-- Idempotent: ledger/admin finance INSERT/UPDATE require adjustment_source on older DBs.
-- Safe to re-run. Skips if column already exists (including ENUM from prior scripts).

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'portal_billing_adjustments' AND COLUMN_NAME = 'adjustment_source'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE portal_billing_adjustments ADD COLUMN adjustment_source VARCHAR(50) NOT NULL DEFAULT ''manual'' COMMENT ''manual|system_late_fee'' AFTER category',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Adds linkage for compensating reversals of system late fees.
-- Idempotent: safe to re-run.

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_billing_adjustments'
    AND COLUMN_NAME = 'reversal_of_adjustment_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE portal_billing_adjustments
     ADD COLUMN reversal_of_adjustment_id BIGINT NULL
       COMMENT ''links compensating rows (e.g. system_late_fee_reversal) to the original adjustment id''
       AFTER clinical_enrollment_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_billing_adjustments'
    AND INDEX_NAME = 'idx_portal_billing_adj_reversal_of_adjustment'
);
SET @sql2 := IF(@idx_exists = 0,
  'CREATE INDEX idx_portal_billing_adj_reversal_of_adjustment
     ON portal_billing_adjustments (reversal_of_adjustment_id)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

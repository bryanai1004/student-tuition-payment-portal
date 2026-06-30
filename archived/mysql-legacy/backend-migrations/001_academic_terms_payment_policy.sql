-- Idempotent: add payment policy columns to academic_terms (run against existing DBs).
-- Safe to re-run. Requires: academic_terms.registration_close (adds after it).

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'academic_terms' AND COLUMN_NAME = 'payment_due_date'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE academic_terms ADD COLUMN payment_due_date DATE NULL COMMENT ''Portal payment due date (DDL) for this term'' AFTER registration_close',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'academic_terms' AND COLUMN_NAME = 'lock_registration_if_overdue'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE academic_terms ADD COLUMN lock_registration_if_overdue TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''When 1, block registration past payment DDL with balance'' AFTER payment_due_date',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

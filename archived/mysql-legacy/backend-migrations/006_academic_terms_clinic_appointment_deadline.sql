-- Idempotent: add clinic appointment scheduling deadline to academic_terms.
-- Safe to re-run.

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'academic_terms' AND COLUMN_NAME = 'clinic_appointment_deadline'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE academic_terms ADD COLUMN clinic_appointment_deadline DATE NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add an optional `amu_email` column to `students` for AMU-issued mailboxes,
-- separate from the existing `email` column which now represents the personal
-- email address. NULL means "no AMU email on file" — the bulk-email feature
-- falls back to the personal `email` when AMU is empty.
--
-- Idempotent: safe to run multiple times.

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'students'
    AND COLUMN_NAME = 'amu_email'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE students
     ADD COLUMN amu_email VARCHAR(255) NULL
       AFTER email',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

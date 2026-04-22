-- Add optional storage path for student profile photos.
-- Idempotent: safe to run multiple times.

SET @db := DATABASE();

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'students'
    AND COLUMN_NAME = 'photo_path'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE students
     ADD COLUMN photo_path VARCHAR(255) NULL
       AFTER email',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

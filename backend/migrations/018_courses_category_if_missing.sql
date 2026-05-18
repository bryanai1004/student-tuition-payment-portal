-- Ensure `school.courses.category` exists for degree-progress (Core/Elective/Clinical) mapping.
-- Idempotent: safe when column already exists.
SET @db := DATABASE();
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'category'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE courses ADD COLUMN category VARCHAR(64) NULL COMMENT ''course_category.category_id''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

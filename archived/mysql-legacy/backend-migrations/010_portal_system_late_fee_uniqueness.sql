-- Enforce one `system_late_fee` row per student + term + year.
-- Idempotent: safe to re-run.

SET @db := DATABASE();

-- Normalize existing duplicates first so the unique index can be created safely.
-- Keep the earliest row (`lowest id`) for each school-quarter late-fee scope.
DELETE pba_dup
FROM portal_billing_adjustments pba_dup
JOIN portal_billing_adjustments pba_keep
  ON pba_dup.adjustment_source = 'system_late_fee'
 AND pba_keep.adjustment_source = 'system_late_fee'
 AND TRIM(pba_dup.student_external_id) = TRIM(pba_keep.student_external_id)
 AND LOWER(TRIM(pba_dup.term)) = LOWER(TRIM(pba_keep.term))
 AND pba_dup.year = pba_keep.year
 AND pba_dup.id > pba_keep.id;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_billing_adjustments'
    AND COLUMN_NAME = 'system_late_fee_unique_key'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE portal_billing_adjustments
     ADD COLUMN system_late_fee_unique_key VARCHAR(191)
       GENERATED ALWAYS AS (
         CASE
           WHEN adjustment_source = ''system_late_fee'' THEN
             CONCAT(
               TRIM(student_external_id),
               ''|'',
               LOWER(TRIM(term)),
               ''|'',
               CAST(year AS CHAR(11))
             )
           ELSE NULL
         END
       ) STORED
       COMMENT ''Generated uniqueness scope for system late fees only''
       AFTER adjustment_source',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_billing_adjustments'
    AND INDEX_NAME = 'uq_portal_billing_adjustments_system_late_fee_scope'
);
SET @sql2 := IF(@idx_exists = 0,
  'CREATE UNIQUE INDEX uq_portal_billing_adjustments_system_late_fee_scope
     ON portal_billing_adjustments (system_late_fee_unique_key)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

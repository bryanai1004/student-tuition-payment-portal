-- Speed up admin finance roster balance aggregates by quarter.
-- Idempotent: safe to re-run.

SET @db := DATABASE();

SET @idx_pba := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_billing_adjustments'
    AND INDEX_NAME = 'idx_portal_billing_adjustments_student_term_year'
);
SET @sql_pba := IF(@idx_pba = 0,
  'CREATE INDEX idx_portal_billing_adjustments_student_term_year
     ON portal_billing_adjustments (student_external_id, term, year)',
  'SELECT 1'
);
PREPARE stmt_pba FROM @sql_pba;
EXECUTE stmt_pba;
DEALLOCATE PREPARE stmt_pba;

SET @idx_pp := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'portal_payments'
    AND INDEX_NAME = 'idx_portal_payments_student_term_year'
);
SET @sql_pp := IF(@idx_pp = 0,
  'CREATE INDEX idx_portal_payments_student_term_year
     ON portal_payments (student_external_id, term, year)',
  'SELECT 1'
);
PREPARE stmt_pp FROM @sql_pp;
EXECUTE stmt_pp;
DEALLOCATE PREPARE stmt_pp;

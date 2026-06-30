-- Speed up admin clinical roster: enrollment join + timetable term/year filters.
-- Idempotent: safe to re-run.

SET @db := DATABASE();

SET @idx_ce := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'clinical_enrollments'
    AND INDEX_NAME = 'idx_clinical_enrollments_timetable_status_bucket'
);
SET @sql_ce := IF(@idx_ce = 0,
  'CREATE INDEX idx_clinical_enrollments_timetable_status_bucket
     ON clinical_enrollments (timetable_id, status, seat_bucket)',
  'SELECT 1'
);
PREPARE stmt_ce FROM @sql_ce;
EXECUTE stmt_ce;
DEALLOCATE PREPARE stmt_ce;

SET @idx_ct_y := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'clinic_timetable'
    AND INDEX_NAME = 'idx_clinic_timetable_year'
);
SET @sql_ct_y := IF(@idx_ct_y = 0,
  'CREATE INDEX idx_clinic_timetable_year ON clinic_timetable (year)',
  'SELECT 1'
);
PREPARE stmt_ct_y FROM @sql_ct_y;
EXECUTE stmt_ct_y;
DEALLOCATE PREPARE stmt_ct_y;

-- Prefix on `term` when supported (TEXT/VARCHAR/CHAR). If EXECUTE fails, run manually:
--   CREATE INDEX idx_clinic_timetable_term_year ON clinic_timetable (term(20), year);
-- or change `clinic_timetable.term` to VARCHAR(20) and use (term, year) without prefix.
SET @idx_ct_ty := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'clinic_timetable'
    AND INDEX_NAME = 'idx_clinic_timetable_term_year'
);
SET @sql_ct_ty := IF(@idx_ct_ty = 0,
  'CREATE INDEX idx_clinic_timetable_term_year ON clinic_timetable (term(20), year)',
  'SELECT 1'
);
PREPARE stmt_ct_ty FROM @sql_ct_ty;
EXECUTE stmt_ct_ty;
DEALLOCATE PREPARE stmt_ct_ty;

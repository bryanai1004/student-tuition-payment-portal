-- Tracks which timetable capacity bucket an enrollment consumed (100 / 200 / 300 / all-level shared).
-- Apply on the same database as `clinical_enrollments` / `clinic_timetable`.
-- Legacy rows: active enrollments without a bucket are treated as using the shared pool for reporting.

ALTER TABLE clinical_enrollments
  ADD COLUMN seat_bucket VARCHAR(10) NULL DEFAULT NULL
  COMMENT '100|200|300|all — capacity bucket used at booking time'
  AFTER status;

UPDATE clinical_enrollments
   SET seat_bucket = 'all'
 WHERE seat_bucket IS NULL
   AND LOWER(TRIM(status)) = 'enrolled';

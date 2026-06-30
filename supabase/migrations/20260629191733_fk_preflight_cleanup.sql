-- Preflight data cleanup so batch 01–03 FK constraints can validate.
-- Safe to run standalone: only touches 4 portal_students backfills, 1 stale hold, 2 enrollments.

-- 1) Backfill portal_students for billing/payment rows referencing legacy students.id
INSERT INTO portal_students (student_external_id, full_name)
SELECT DISTINCT TRIM(s.id), TRIM(s.name)
FROM students s
WHERE TRIM(s.id) IN (
  SELECT p.student_external_id
  FROM portal_payments p
  LEFT JOIN portal_students ps ON p.student_external_id = ps.student_external_id
  WHERE ps.student_external_id IS NULL
  UNION
  SELECT p.student_external_id
  FROM portal_billing_adjustments p
  LEFT JOIN portal_students ps ON p.student_external_id = ps.student_external_id
  WHERE ps.student_external_id IS NULL
)
ON CONFLICT (student_external_id) DO NOTHING;

-- 2) Orphaned cancelled clinical hold (enrollment_id=2, billing_adjustment_id=4 no longer exist)
DELETE FROM clinical_booking_payment_holds
WHERE id = 2
  AND clinical_enrollment_id = 2
  AND billing_adjustment_id = 4
  AND status = 'cancelled_manual_drop';

-- 3) Stale course_section_id after section rows were removed
UPDATE portal_enrollments
SET course_section_id = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (15, 16)
  AND course_section_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM course_sections cs WHERE cs.id = portal_enrollments.course_section_id
  );

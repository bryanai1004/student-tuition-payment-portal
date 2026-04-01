-- Dev seed: aligns with frontend mock student AMU123456 / Fall 2026.
-- Run after portal_accounts_schema.sql (see npm run db:bootstrap-portal).

INSERT INTO portal_students (student_external_id, full_name) VALUES
  ('AMU123456', 'Bingchen Li'),
  ('demo-student', 'Demo Student')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO portal_courses (course_id, course_code, title, type, units, hours) VALUES
  ('MAHM101', 'TCM101', 'Foundations of Traditional Chinese Medicine', 'didactic', 3, NULL),
  ('MAHM102', 'ACU201', 'Acupuncture Techniques I', 'didactic', 4, NULL),
  ('MAHM104', 'HERB201', 'Chinese Herbology I — Materia Medica', 'didactic', 3, NULL),
  ('MAHM113', 'ACULAB1', 'Acupuncture Techniques Laboratory I', 'lab', 1, NULL),
  ('CLINIC1', 'CLN301', 'Clinical Internship Level 1', 'clinical', NULL, 90)
ON DUPLICATE KEY UPDATE
  course_code = VALUES(course_code),
  title = VALUES(title),
  type = VALUES(type),
  units = VALUES(units),
  hours = VALUES(hours);

DELETE FROM portal_billing_adjustments
WHERE student_external_id = 'AMU123456' AND term = 'Fall' AND year = 2026;
DELETE FROM portal_payments
WHERE student_external_id = 'AMU123456' AND term = 'Fall' AND year = 2026;
DELETE FROM portal_student_term_prefs
WHERE student_external_id = 'AMU123456' AND term = 'Fall' AND year = 2026;
DELETE FROM portal_enrollments
WHERE student_external_id = 'AMU123456' AND term = 'Fall' AND year = 2026;

INSERT INTO portal_enrollments (student_external_id, course_id, term, year) VALUES
  ('AMU123456', 'MAHM101', 'Fall', 2026),
  ('AMU123456', 'MAHM102', 'Fall', 2026),
  ('AMU123456', 'MAHM104', 'Fall', 2026),
  ('AMU123456', 'MAHM113', 'Fall', 2026),
  ('AMU123456', 'CLINIC1', 'Fall', 2026);

INSERT INTO portal_student_term_prefs (
  student_external_id, term, year,
  use_installment_plan, tuition_paid_in_full_at_reg, installment_count, registration_period_ends
) VALUES (
  'AMU123456', 'Fall', 2026,
  1, 0, 3, '2026-09-05'
);

INSERT INTO portal_payments (
  student_external_id, term, year, amount, paid_at, method, description
) VALUES (
  'AMU123456', 'Fall', 2026, 1250.00, '2026-08-20', 'ach', 'Tuition payment — Fall 2026'
);

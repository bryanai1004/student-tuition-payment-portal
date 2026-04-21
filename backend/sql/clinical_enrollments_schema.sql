-- Student clinical slot enrollments (add/drop). Apply alongside `clinical_assignments` / `clinic_timetable`.
-- One row per student + timetable slot + term + year; drop is a status update (`dropped`), not a delete.

CREATE TABLE IF NOT EXISTS clinical_enrollments (
  id INT NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(20) NOT NULL,
  timetable_id INT NOT NULL,
  term VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'enrolled',
  seat_bucket VARCHAR(10) NULL DEFAULT NULL COMMENT '100|200|300|all — capacity bucket used at booking',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clinical_enrollment_student_slot_term_year (
    student_id,
    timetable_id,
    term,
    year
  ),
  KEY idx_clinical_enrollments_student (student_id),
  KEY idx_clinical_enrollments_timetable (timetable_id),
  KEY idx_clinical_enrollments_slot_active (
    timetable_id,
    term,
    year,
    status
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

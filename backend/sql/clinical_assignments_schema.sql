-- Clinical scheduling assignments (admin-created; student-facing schedule).
-- Apply on the portal database alongside other `backend/sql/*.sql` artifacts.

CREATE TABLE IF NOT EXISTS clinical_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(20) NOT NULL,
  course_code VARCHAR(20) NOT NULL,
  session_date DATE NOT NULL,
  session_name VARCHAR(255) NULL,
  site VARCHAR(255) NULL,
  faculty VARCHAR(255) NULL,
  timetable_id INT NULL COMMENT 'clinic_timetable.seqNum when timetable-driven',
  term VARCHAR(20) NULL,
  `year` INT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clinical_assignments_student_date (student_id, session_date),
  KEY idx_clinical_assignments_timetable (timetable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 5A: student clinical slot requests (pending → admin approve → clinical_assignments).
-- Apply on the same database as `clinical_assignments` / `clinic_timetable`.

CREATE TABLE IF NOT EXISTS clinical_requests (
  id INT NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(20) NOT NULL,
  timetable_id INT NOT NULL,
  term VARCHAR(20) NOT NULL,
  year INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL DEFAULT NULL,
  decided_by VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_student_id (student_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

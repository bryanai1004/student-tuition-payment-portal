-- Course evaluation submissions (one per student / course / term / year).
-- Apply on the portal database alongside other `backend/sql/*.sql` artifacts.

CREATE TABLE IF NOT EXISTS student_course_feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(64) NOT NULL,
  course_code VARCHAR(32) NOT NULL,
  term VARCHAR(64) NOT NULL,
  year INT NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  workload_rating TINYINT UNSIGNED NOT NULL,
  difficulty_rating TINYINT UNSIGNED NOT NULL,
  comments TEXT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_student_course_term_year (
    student_id,
    course_code,
    year,
    term
  ),
  KEY idx_student_submitted (student_id, submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

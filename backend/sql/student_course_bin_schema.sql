-- Saved course-bin rows per student (registration workflow / future sync with frontend CourseBin).
-- Apply via your migration workflow when you enable server-side persistence.

CREATE TABLE IF NOT EXISTS student_course_bin (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id VARCHAR(64) NOT NULL,
  course_code VARCHAR(32) NOT NULL,
  section VARCHAR(32) NOT NULL,
  session VARCHAR(64) NULL,
  type VARCHAR(64) NULL,
  units VARCHAR(32) NULL,
  registered_display VARCHAR(512) NULL,
  time_display VARCHAR(512) NULL,
  days_display VARCHAR(255) NULL,
  instructor VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  -- Aligns with frontend CourseBinItem display names when present
  eng_name VARCHAR(512) NULL,
  chi_name VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_student_course_section (student_id, course_code, section),
  KEY idx_student_updated (student_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

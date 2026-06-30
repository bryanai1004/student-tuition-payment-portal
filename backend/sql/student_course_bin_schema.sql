-- Postgres schema (see supabase/migrations/20260630164017_student_course_bin.sql).

CREATE TABLE IF NOT EXISTS student_course_bin (
  id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL,
  academic_term_id VARCHAR(64) NOT NULL,
  course_code VARCHAR(32) NOT NULL,
  section VARCHAR(32) NOT NULL,
  schedule_track VARCHAR(8) NOT NULL DEFAULT 'EN',
  session VARCHAR(64) NULL,
  type VARCHAR(64) NULL,
  units VARCHAR(32) NULL,
  registered_display VARCHAR(512) NULL,
  time_display VARCHAR(512) NULL,
  days_display VARCHAR(255) NULL,
  instructor VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  eng_name VARCHAR(512) NULL,
  chi_name VARCHAR(512) NULL,
  prerequisite_course_id VARCHAR(64) NULL,
  prerequisite_course_code VARCHAR(32) NULL,
  prerequisite_course_title VARCHAR(512) NULL,
  schedule_weekday VARCHAR(32) NULL,
  schedule_start_time VARCHAR(32) NULL,
  schedule_end_time VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_student_course_bin_row UNIQUE (
    student_id,
    academic_term_id,
    course_code,
    section,
    schedule_track
  )
);

CREATE INDEX IF NOT EXISTS idx_student_course_bin_student_term
  ON student_course_bin (student_id, academic_term_id, updated_at DESC);

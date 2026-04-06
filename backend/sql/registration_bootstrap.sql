-- Minimal bootstrap for myAMU registration + scheduling on AWS RDS database `school`.
-- Creates `academic_terms` and `course_sections` (names/columns aligned with backend repositories).
-- Safe to re-run: idempotent upserts on natural keys.
--
-- Prerequisites: MySQL 8.0+ (CHECK constraints). User needs CREATE + INSERT on `school`.

USE school;

-- ---------------------------------------------------------------------------
-- academic_terms (see academicTermRepository.ts, types/academicTerm.ts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_terms (
  id VARCHAR(16) NOT NULL,
  term_label VARCHAR(128) NOT NULL,
  year INT NOT NULL,
  term_name VARCHAR(16) NOT NULL,
  quarter_index INT NOT NULL COMMENT 'Winter=1, Spring=2, Summer=3, Fall=4',
  sequence_no INT NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  registration_open DATE NULL,
  registration_close DATE NULL,
  status VARCHAR(32) NOT NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_academic_terms_year_quarter (year, quarter_index),
  UNIQUE KEY uq_academic_terms_sequence_no (sequence_no),
  KEY idx_academic_terms_visible_sequence (is_visible, sequence_no),
  KEY idx_academic_terms_status_sequence (status, sequence_no),
  CONSTRAINT chk_academic_terms_term_name CHECK (
    term_name IN ('Winter', 'Spring', 'Summer', 'Fall')
  ),
  CONSTRAINT chk_academic_terms_status CHECK (
    status IN ('planned', 'registration_open', 'in_progress', 'completed')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- course_sections (see courseSectionRepository.ts)
-- `term` must match academic_terms.term_name exactly: Winter|Spring|Summer|Fall
-- No FK to academic_terms (keeps bootstrap simple; enforce consistency in app/ETL).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_sections (
  id INT NOT NULL AUTO_INCREMENT,
  course_code VARCHAR(32) NOT NULL,
  term VARCHAR(16) NOT NULL,
  year INT NOT NULL,
  section_code VARCHAR(32) NOT NULL,
  weekday VARCHAR(128) NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  delivery_mode VARCHAR(64) NULL,
  room VARCHAR(128) NULL,
  instructor VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_course_sections_offer (course_code, term, year, section_code),
  KEY idx_course_sections_course (course_code),
  KEY idx_course_sections_course_term_year (course_code, term, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seed: academic_terms (Spring / Summer / Fall 2026)
-- ---------------------------------------------------------------------------
INSERT INTO academic_terms (
  id,
  term_label,
  year,
  term_name,
  quarter_index,
  sequence_no,
  start_date,
  end_date,
  registration_open,
  registration_close,
  status,
  is_visible
) VALUES
  (
    '2026-SPR',
    'Spring 2026',
    2026,
    'Spring',
    2,
    202602,
    '2026-01-06',
    '2026-04-24',
    '2025-11-01',
    '2026-01-05',
    'registration_open',
    1
  ),
  (
    '2026-SUM',
    'Summer 2026',
    2026,
    'Summer',
    3,
    202603,
    '2026-05-04',
    '2026-08-14',
    '2026-03-01',
    '2026-05-03',
    'planned',
    1
  ),
  (
    '2026-FAL',
    'Fall 2026',
    2026,
    'Fall',
    4,
    202604,
    '2026-08-24',
    '2026-12-11',
    '2026-06-01',
    '2026-08-23',
    'planned',
    1
  )
ON DUPLICATE KEY UPDATE
  term_label = VALUES(term_label),
  year = VALUES(year),
  term_name = VALUES(term_name),
  quarter_index = VALUES(quarter_index),
  sequence_no = VALUES(sequence_no),
  start_date = VALUES(start_date),
  end_date = VALUES(end_date),
  registration_open = VALUES(registration_open),
  registration_close = VALUES(registration_close),
  status = VALUES(status),
  is_visible = VALUES(is_visible);

-- ---------------------------------------------------------------------------
-- Seed: course_sections (matches term/year above; course_code aligns with catalog)
-- ---------------------------------------------------------------------------
INSERT INTO course_sections (
  course_code,
  term,
  year,
  section_code,
  weekday,
  start_time,
  end_time,
  delivery_mode,
  room,
  instructor,
  notes
) VALUES
  (
    'AC201',
    'Spring',
    2026,
    'A',
    'Tuesday',
    '09:00:00',
    '11:50:00',
    'In Person',
    'Room 101',
    'Dr. Chen',
    'Introductory accounting — section A'
  ),
  (
    'AC202',
    'Spring',
    2026,
    'A',
    'Thursday',
    '13:00:00',
    '15:50:00',
    'Hybrid',
    'Room 205',
    'Dr. Patel',
    NULL
  ),
  (
    'BS101',
    'Summer',
    2026,
    'A',
    'Monday',
    '10:00:00',
    '11:50:00',
    'Online',
    NULL,
    'Prof. Lee',
    'Summer intensive'
  )
ON DUPLICATE KEY UPDATE
  weekday = VALUES(weekday),
  start_time = VALUES(start_time),
  end_time = VALUES(end_time),
  delivery_mode = VALUES(delivery_mode),
  room = VALUES(room),
  instructor = VALUES(instructor),
  notes = VALUES(notes);

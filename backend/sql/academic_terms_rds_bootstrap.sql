-- One-shot bootstrap for AWS RDS `school` database: academic_terms + idempotent seed.
-- Run as a user with CREATE + INSERT privileges on `school`.

USE school;

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

-- Idempotent upsert by primary key `id` (safe to re-run).
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
    NULL,
    NULL,
    NULL,
    NULL,
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
    NULL,
    NULL,
    NULL,
    NULL,
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
    NULL,
    NULL,
    NULL,
    NULL,
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

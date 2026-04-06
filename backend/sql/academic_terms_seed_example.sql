-- Optional seed examples for `academic_terms` (Spring / Summer / Fall 2026).
-- Idempotent upsert by `id` (safe to re-run). Adjust `sequence_no` / `status` if you already have rows.

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

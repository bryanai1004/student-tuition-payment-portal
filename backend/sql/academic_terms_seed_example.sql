-- Optional seed examples for `academic_terms` (Spring / Summer / Fall 2026).
-- Pick `sequence_no` values that do not collide with existing rows.

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
    'planned',
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
  );

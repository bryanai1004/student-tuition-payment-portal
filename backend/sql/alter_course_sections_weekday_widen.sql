-- Allow comma-separated multi-day values in course_sections.weekday (e.g. Monday,Wednesday).
-- Safe to run on existing databases created with VARCHAR(16).

ALTER TABLE course_sections
  MODIFY COLUMN weekday VARCHAR(128) NOT NULL;

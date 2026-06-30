-- Backfill portal_enrollments.course_section_id for legacy rows using the same
-- section_code + schedule_track + EN-before-CN/id ordering as POST /api/student/enroll.
-- Skips rows that would violate uniq_portal_enrollment_student_section_term_year.

UPDATE portal_enrollments e
SET course_section_id = sub.resolved_id,
    updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT
    e2.id AS enrollment_id,
    (
      SELECT cs.id
      FROM course_sections cs
      INNER JOIN portal_courses pc ON pc.course_id = e2.course_id
      WHERE TRIM(cs.course_code) = TRIM(pc.course_code)
        AND TRIM(cs.term) = TRIM(e2.term)
        AND cs.year = e2.year
        AND (
          NULLIF(TRIM(e2.section_code), '') IS NULL
          OR TRIM(cs.section_code) = TRIM(e2.section_code)
        )
        AND (
          UPPER(TRIM(COALESCE(e2.schedule_track, ''))) NOT IN ('EN', 'CN')
          OR UPPER(TRIM(cs.schedule_track)) = UPPER(TRIM(e2.schedule_track))
        )
      ORDER BY
        CASE UPPER(TRIM(cs.schedule_track)) WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END ASC,
        cs.id ASC
      LIMIT 1
    ) AS resolved_id
  FROM portal_enrollments e2
  WHERE e2.course_section_id IS NULL
) sub
WHERE e.id = sub.enrollment_id
  AND sub.resolved_id IS NOT NULL
  AND e.course_section_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM portal_enrollments peer
    WHERE peer.id <> e.id
      AND TRIM(peer.student_external_id) = TRIM(e.student_external_id)
      AND peer.course_section_id = sub.resolved_id
      AND peer.term = e.term
      AND peer.year = e.year
  );

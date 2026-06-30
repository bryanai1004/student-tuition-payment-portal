/**
 * Shared legacy `course_sections` resolution for `portal_enrollments` rows where
 * `course_section_id` is NULL.
 *
 * Matches POST /api/student/enroll section pick: honor stored `section_code` and
 * `schedule_track` when present; otherwise pick EN before CN, then lowest `id`.
 *
 * Requires outer query alias `e` (`portal_enrollments`).
 */
export const SQL_PORTAL_ENROLLMENT_LEGACY_SECTION_ID = `
  (
    SELECT cs2.id
    FROM course_sections cs2
    INNER JOIN portal_courses pc_resolve
      ON pc_resolve.course_id = e.course_id
    WHERE TRIM(cs2.course_code) = TRIM(pc_resolve.course_code)
      AND TRIM(cs2.term) = TRIM(e.term)
      AND cs2.year = e.year
      AND (
        NULLIF(TRIM(e.section_code), '') IS NULL
        OR TRIM(cs2.section_code) = TRIM(e.section_code)
      )
      AND (
        UPPER(TRIM(COALESCE(e.schedule_track, ''))) NOT IN ('EN', 'CN')
        OR UPPER(TRIM(cs2.schedule_track)) = UPPER(TRIM(e.schedule_track))
      )
    ORDER BY
      CASE UPPER(TRIM(cs2.schedule_track)) WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END ASC,
      cs2.id ASC
    LIMIT 1
  )`;

/** Standard `cs_direct` join keyed on enrollment `course_section_id`. */
export const SQL_PORTAL_ENROLLMENT_CS_DIRECT_JOIN = `
    LEFT JOIN course_sections cs_direct
      ON e.course_section_id IS NOT NULL
      AND cs_direct.id = e.course_section_id
      AND TRIM(cs_direct.term) = TRIM(e.term)
      AND cs_direct.year = e.year`;

/** Standard `cs_leg` join when `course_section_id` is NULL. */
export const SQL_PORTAL_ENROLLMENT_CS_LEG_JOIN = `
    LEFT JOIN course_sections cs_leg
      ON e.course_section_id IS NULL
      AND cs_leg.id = ${SQL_PORTAL_ENROLLMENT_LEGACY_SECTION_ID}`;

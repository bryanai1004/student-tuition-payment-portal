import { pool } from "../lib/db.js";
import { mapCourseSectionRow, } from "./courseSectionRepository.js";
/**
 * Validates each section against `course_sections` and `portal_courses`, then inserts
 * `portal_enrollments` rows. Skips duplicates (same student + course_id + term + year).
 */
export async function enrollStudentInSections(studentExternalId, term, year, sections) {
    const sid = studentExternalId.trim();
    const trimmedTerm = term.trim();
    if (sections.length === 0) {
        return { ok: false, error: "At least one section is required." };
    }
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        let insertedCount = 0;
        for (const raw of sections) {
            const courseCode = raw.course_code.trim();
            const sectionCode = raw.section_code.trim();
            if (!courseCode || !sectionCode) {
                await conn.rollback();
                return {
                    ok: false,
                    error: "Each section must include course_code and section_code.",
                };
            }
            const [[secRow]] = await conn.query(`SELECT id FROM course_sections
         WHERE course_code = ? AND section_code = ? AND term = ? AND year = ?
         LIMIT 1`, [courseCode, sectionCode, trimmedTerm, year]);
            if (!secRow) {
                await conn.rollback();
                return {
                    ok: false,
                    error: `No section ${sectionCode} for course ${courseCode} in this term.`,
                };
            }
            const [courseRows] = await conn.query(`SELECT course_id FROM portal_courses WHERE course_code = ? LIMIT 2`, [courseCode]);
            if (courseRows.length === 0) {
                await conn.rollback();
                return {
                    ok: false,
                    error: `Course ${courseCode} is not in the portal catalog (portal_courses).`,
                };
            }
            if (courseRows.length > 1) {
                await conn.rollback();
                return {
                    ok: false,
                    error: `Course code ${courseCode} matches multiple portal courses.`,
                };
            }
            const courseId = String(courseRows[0].course_id);
            const [[exists]] = await conn.query(`SELECT 1 AS ok FROM portal_enrollments
         WHERE student_external_id = ? AND course_id = ? AND term = ? AND year = ?
         LIMIT 1`, [sid, courseId, trimmedTerm, year]);
            if (exists)
                continue;
            await conn.query(`INSERT INTO portal_enrollments (student_external_id, course_id, term, year)
         VALUES (?, ?, ?, ?)`, [sid, courseId, trimmedTerm, year]);
            insertedCount += 1;
        }
        await conn.commit();
        return { ok: true, insertedCount };
    }
    catch (e) {
        await conn.rollback();
        throw e;
    }
    finally {
        conn.release();
    }
}
/**
 * One `course_sections` row per enrolled course (same term/year), chosen deterministically when
 * multiple sections exist for a course (lowest `id`). Timetable display for course-only portal enrollments.
 */
export async function listStudentEnrolledSectionRows(studentExternalId, term, year) {
    const sql = `
    SELECT
      cs.id,
      cs.course_code,
      cs.term,
      cs.year,
      cs.section_code,
      cs.weekday,
      cs.start_time,
      cs.end_time,
      cs.delivery_mode,
      cs.room,
      cs.instructor,
      cs.notes,
      0 AS enrolled_count,
      CAST(NULL AS JSON) AS enrolled_students_json
    FROM (
      SELECT
        cs_inner.id,
        cs_inner.course_code,
        cs_inner.term,
        cs_inner.year,
        cs_inner.section_code,
        cs_inner.weekday,
        cs_inner.start_time,
        cs_inner.end_time,
        cs_inner.delivery_mode,
        cs_inner.room,
        cs_inner.instructor,
        cs_inner.notes,
        ROW_NUMBER() OVER (PARTITION BY cs_inner.course_code ORDER BY cs_inner.id) AS rn
      FROM course_sections cs_inner
      INNER JOIN portal_courses pc ON pc.course_code = cs_inner.course_code
      INNER JOIN portal_enrollments e
        ON e.course_id = pc.course_id
        AND e.student_external_id = ?
        AND e.term = cs_inner.term
        AND e.year = cs_inner.year
      WHERE cs_inner.term = ? AND cs_inner.year = ?
    ) cs
    WHERE cs.rn = 1
    ORDER BY cs.course_code ASC, cs.weekday ASC, cs.start_time ASC
  `;
    const [rows] = await pool.query(sql, [
        studentExternalId.trim(),
        term.trim(),
        year,
    ]);
    return rows.map((r) => mapCourseSectionRow(r));
}
//# sourceMappingURL=studentEnrollmentRepository.js.map
import { pool } from "../lib/db.js";
import { mapCourseSectionRow, } from "./courseSectionRepository.js";
function isMysqlDupEntry(e) {
    return (typeof e === "object" &&
        e !== null &&
        "code" in e &&
        e.code === "ER_DUP_ENTRY");
}
function inferPortalTypeFromLegacy(engName) {
    const n = engName.toLowerCase();
    if (/\blab(oratory)?\b/i.test(engName) || /\blab\b/.test(n))
        return "lab";
    if (n.includes("clinic") || n.includes("internship"))
        return "clinical";
    return "didactic";
}
/**
 * Resolves `portal_courses.course_id` for enrollment: exact `course_code` first, else one row
 * from legacy `courses` plus a deterministic `LEGACY{sequenceNumber}` insert (idempotent on PK).
 */
async function resolvePortalCourseIdForEnrollment(conn, courseCode) {
    const code = courseCode.trim();
    const [existing] = await conn.query(`SELECT course_id FROM portal_courses WHERE course_code = ? LIMIT 2`, [code]);
    if (existing.length === 1) {
        return { ok: true, courseId: String(existing[0].course_id) };
    }
    if (existing.length > 1) {
        return {
            ok: false,
            error: `Course code ${code} matches multiple portal courses.`,
        };
    }
    const [legacyRows] = await conn.query(`SELECT \`sequenceNumber\`, TRIM(code) AS legacy_code, eng_name, units
     FROM courses
     WHERE CONVERT(TRIM(code) USING utf8mb4) COLLATE utf8mb4_unicode_ci = ?
     LIMIT 2`, [code]);
    if (legacyRows.length === 0) {
        return {
            ok: false,
            error: `Course ${code} is not in the portal catalog (portal_courses).`,
        };
    }
    if (legacyRows.length > 1) {
        return {
            ok: false,
            error: `Course code ${code} matches multiple legacy catalog entries.`,
        };
    }
    const leg = legacyRows[0];
    const seq = Number(leg.sequenceNumber);
    const courseId = `LEGACY${seq}`;
    const titleRaw = leg.eng_name != null ? String(leg.eng_name).trim() : "";
    const title = titleRaw !== "" ? titleRaw : code;
    const units = leg.units != null ? leg.units : null;
    const type = inferPortalTypeFromLegacy(titleRaw);
    try {
        await conn.query(`INSERT INTO portal_courses (course_id, course_code, title, type, units, hours)
       VALUES (?, ?, ?, ?, ?, NULL)`, [courseId, code, title, type, units]);
    }
    catch (e) {
        if (!isMysqlDupEntry(e))
            throw e;
    }
    const [again] = await conn.query(`SELECT course_id FROM portal_courses WHERE course_code = ? LIMIT 2`, [code]);
    if (again.length === 1) {
        return { ok: true, courseId: String(again[0].course_id) };
    }
    if (again.length > 1) {
        return {
            ok: false,
            error: `Course code ${code} matches multiple portal courses.`,
        };
    }
    return {
        ok: false,
        error: `Could not resolve portal catalog row for ${code}.`,
    };
}
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
            let secRows;
            if (raw.schedule_track === "EN" || raw.schedule_track === "CN") {
                const [rows] = await conn.query(`SELECT id FROM course_sections
           WHERE course_code = ? AND section_code = ? AND term = ? AND year = ?
             AND schedule_track = ?`, [courseCode, sectionCode, trimmedTerm, year, raw.schedule_track]);
                secRows = rows;
            }
            else {
                const [rows] = await conn.query(`SELECT id FROM course_sections
           WHERE course_code = ? AND section_code = ? AND term = ? AND year = ?
           ORDER BY CASE schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END, id ASC`, [courseCode, sectionCode, trimmedTerm, year]);
                secRows = rows;
            }
            if (secRows.length === 0) {
                await conn.rollback();
                return {
                    ok: false,
                    error: `No section ${sectionCode} for course ${courseCode} in this term.`,
                };
            }
            if (secRows.length > 1) {
                await conn.rollback();
                return {
                    ok: false,
                    error: `Multiple timetable sections match ${courseCode} ${sectionCode} for this term. Specify schedule_track EN or CN.`,
                };
            }
            const secRow = secRows[0];
            const resolved = await resolvePortalCourseIdForEnrollment(conn, courseCode);
            if (!resolved.ok) {
                await conn.rollback();
                return resolved;
            }
            const courseId = resolved.courseId;
            const [[exists]] = await conn.query(`SELECT 1 AS ok FROM portal_enrollments
         WHERE student_external_id COLLATE utf8mb4_unicode_ci =
               CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND course_id = ?
           AND term COLLATE utf8mb4_unicode_ci =
               CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND year = ?
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
      cs.schedule_track,
      cs.weekday,
      cs.start_time,
      cs.end_time,
      cs.delivery_mode,
      cs.room,
      cs.instructor,
      cs.notes,
      cs.course_title,
      0 AS enrolled_count,
      CAST(NULL AS JSON) AS enrolled_students_json
    FROM (
      SELECT
        cs_inner.id,
        cs_inner.course_code,
        cs_inner.term,
        cs_inner.year,
        cs_inner.section_code,
        cs_inner.schedule_track,
        cs_inner.weekday,
        cs_inner.start_time,
        cs_inner.end_time,
        cs_inner.delivery_mode,
        cs_inner.room,
        cs_inner.instructor,
        cs_inner.notes,
        COALESCE(
          NULLIF(TRIM(cat.eng_name), ''),
          NULLIF(TRIM(pc.title), '')
        ) AS course_title,
        ROW_NUMBER() OVER (PARTITION BY cs_inner.course_code ORDER BY cs_inner.id) AS rn
      FROM course_sections cs_inner
      INNER JOIN portal_courses pc
        ON pc.course_code COLLATE utf8mb4_unicode_ci =
           cs_inner.course_code COLLATE utf8mb4_unicode_ci
      LEFT JOIN courses cat
        ON TRIM(cat.code) COLLATE utf8mb4_unicode_ci =
           TRIM(cs_inner.course_code) COLLATE utf8mb4_unicode_ci
      INNER JOIN portal_enrollments e
        ON e.course_id = pc.course_id
        AND e.student_external_id COLLATE utf8mb4_unicode_ci =
            CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND e.term COLLATE utf8mb4_unicode_ci =
            cs_inner.term COLLATE utf8mb4_unicode_ci
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
function normalizePortalEnrollmentAcademicStatus(raw) {
    if (raw == null)
        return "active";
    const s = String(raw).trim().toLowerCase();
    if (s === "")
        return "active";
    if (s === "withdrawn")
        return "withdrawn";
    if (s === "active")
        return "active";
    if (s === "completed")
        return "completed";
    if (s === "dropped")
        return "dropped";
    return "unknown";
}
export async function listAdminEnrollmentRowsForSection(courseCode, term, year) {
    const code = courseCode.trim();
    const t = term.trim();
    const sql = `
    SELECT
      TRIM(e.student_external_id) AS student_external_id,
      TRIM(ps.full_name) AS full_name,
      e.status AS enrollment_status,
      e.withdrawn_at AS withdrawn_at,
      (
        SELECT TRIM(m.grade)
        FROM marks m
        WHERE TRIM(m.id) = TRIM(e.student_external_id)
          AND TRIM(m.code) = TRIM(pc.course_code)
          AND LOWER(TRIM(m.term)) = LOWER(TRIM(e.term))
          AND m.year = e.year
        ORDER BY m.seqNumber DESC
        LIMIT 1
      ) AS marks_grade
    FROM portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    LEFT JOIN portal_students ps
      ON TRIM(ps.student_external_id) = TRIM(e.student_external_id)
    WHERE TRIM(pc.course_code) = TRIM(?)
      AND TRIM(e.term) = TRIM(?)
      AND e.year = ?
    ORDER BY
      CASE WHEN ps.full_name IS NULL OR TRIM(ps.full_name) = '' THEN 1 ELSE 0 END,
      TRIM(ps.full_name) ASC,
      TRIM(e.student_external_id) ASC
  `;
    const [rows] = await pool.query(sql, [code, t, year]);
    return rows.map((r) => {
        const w = r.withdrawn_at;
        let withdrawnAt = null;
        if (w != null && w !== "") {
            withdrawnAt =
                w instanceof Date ? w.toISOString() : String(w).trim() || null;
        }
        const status = normalizePortalEnrollmentAcademicStatus(r.enrollment_status);
        const marksG = r.marks_grade;
        const marksGrade = marksG == null
            ? null
            : (() => {
                const s = String(marksG).trim();
                return s === "" ? null : s;
            })();
        return {
            studentId: String(r.student_external_id ?? "").trim(),
            name: (() => {
                const fn = r.full_name;
                if (fn == null)
                    return null;
                const s = String(fn).trim();
                return s === "" ? null : s;
            })(),
            status,
            grade: status === "withdrawn"
                ? "W"
                : marksGrade,
            withdrawn_at: withdrawnAt,
        };
    });
}
/**
 * Latest portal enrollment term/year for a student (same ordering as legacy registration “latest”).
 */
export async function findLatestPortalEnrollmentTermYear(studentExternalId) {
    const sid = studentExternalId.trim();
    const [rows] = await pool.query(`SELECT TRIM(e.term) AS term, e.year
     FROM portal_enrollments e
     WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
           CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
     ORDER BY e.year DESC,
       CASE UPPER(TRIM(e.term))
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC
     LIMIT 1`, [sid]);
    if (rows.length === 0)
        return null;
    const r = rows[0];
    const term = String(r.term ?? "").trim();
    const year = Number(r.year);
    if (term === "" || !Number.isFinite(year))
        return null;
    return { term, year };
}
/**
 * All `portal_enrollments` for a student with catalog title/units and one deterministic section row
 * per course+term+year (lowest `course_sections.id`) for schedule display.
 */
export async function listPortalEnrollmentRowsForStudentAcademics(studentExternalId) {
    const sid = studentExternalId.trim();
    const sql = `
    SELECT
      TRIM(pc.course_code) AS course_code,
      TRIM(pc.title) AS course_title_raw,
      TRIM(e.term) AS term,
      e.year,
      pc.units,
      cs_pick.weekday,
      cs_pick.start_time,
      cs_pick.end_time,
      cs_pick.instructor,
      e.status AS enrollment_status,
      e.withdrawn_at AS withdrawn_at
    FROM portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    LEFT JOIN (
      SELECT
        cs_inner.course_code AS pick_course_code,
        cs_inner.term AS pick_term,
        cs_inner.year AS pick_year,
        cs_inner.weekday,
        cs_inner.start_time,
        cs_inner.end_time,
        cs_inner.instructor,
        ROW_NUMBER() OVER (
          PARTITION BY cs_inner.course_code, cs_inner.term, cs_inner.year
          ORDER BY cs_inner.id
        ) AS rn
      FROM course_sections cs_inner
    ) cs_pick
      ON cs_pick.pick_course_code COLLATE utf8mb4_unicode_ci =
         pc.course_code COLLATE utf8mb4_unicode_ci
      AND cs_pick.pick_term COLLATE utf8mb4_unicode_ci =
          e.term COLLATE utf8mb4_unicode_ci
      AND cs_pick.pick_year = e.year
      AND cs_pick.rn = 1
    WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
    ORDER BY e.year DESC,
      CASE UPPER(TRIM(e.term))
        WHEN 'FALL' THEN 4
        WHEN 'SUMMER' THEN 3
        WHEN 'SPRING' THEN 2
        WHEN 'WINTER' THEN 1
        ELSE 0
      END DESC,
      pc.course_code ASC
  `;
    const [rows] = await pool.query(sql, [sid]);
    return rows.map((r) => {
        const w = r.withdrawn_at;
        let withdrawnAt = null;
        if (w != null && w !== "") {
            withdrawnAt =
                w instanceof Date
                    ? w.toISOString()
                    : String(w).trim() || null;
        }
        return {
            course_code: String(r.course_code ?? "").trim(),
            course_title_raw: String(r.course_title_raw ?? "").trim(),
            term: String(r.term ?? "").trim(),
            year: Number(r.year),
            units: r.units == null || r.units === ""
                ? null
                : Number.isFinite(Number(r.units))
                    ? Number(r.units)
                    : null,
            weekday: r.weekday == null ? null : String(r.weekday).trim() || null,
            start_time: r.start_time,
            end_time: r.end_time,
            instructor: r.instructor == null ? null : String(r.instructor).trim() || null,
            status: normalizePortalEnrollmentAcademicStatus(r.enrollment_status),
            withdrawn_at: withdrawnAt,
        };
    });
}
/**
 * Removes one course-level portal enrollment (any section). Only `portal_enrollments` is affected.
 */
export async function deletePortalEnrollmentByStudentCourseTermYear(studentExternalId, courseCode, term, year) {
    const sid = studentExternalId.trim();
    const code = courseCode.trim();
    const t = term.trim();
    const sql = `
    UPDATE portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    SET
      e.status = 'withdrawn',
      e.withdrawn_at = NOW()
    WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND pc.course_code COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND (e.status IS NULL OR e.status = 'active')
  `;
    const [result] = await pool.query(sql, [sid, code, t, year]);
    return result.affectedRows;
}
export async function getPortalStudentDisplayName(studentExternalId) {
    const sid = studentExternalId.trim();
    const [rows] = await pool.query(`SELECT TRIM(ps.full_name) AS full_name
     FROM portal_students ps
     WHERE ps.student_external_id COLLATE utf8mb4_unicode_ci =
           CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
     LIMIT 1`, [sid]);
    const row = rows[0];
    if (row == null)
        return null;
    const n = String(row.full_name ?? "").trim();
    return n.length > 0 ? n : null;
}
//# sourceMappingURL=studentEnrollmentRepository.js.map
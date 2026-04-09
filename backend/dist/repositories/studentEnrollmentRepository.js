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
/** Active portal enrollment: legacy rows may omit `status` (treated as active). */
const SQL_ACTIVE_PORTAL_ENROLLMENT_E = "(e.status IS NULL OR LOWER(TRIM(e.status)) = 'active')";
/**
 * Scheduled section rows for a student's **active** `portal_enrollments` in one calendar term/year.
 *
 * Source chain (production): `portal_enrollments.course_id` → `portal_courses` (maps legacy ids like
 * LEGACY29 to timetable `course_code` e.g. AC100) → `course_sections.course_code` + matching term/year.
 * `portal_enrollments.course_id` is never joined directly to `course_sections.course_code`.
 *
 * One `course_sections` row per enrolled catalog course (`MIN(id)` when multiple sections exist).
 * String joins use `utf8mb4_unicode_ci` to avoid collation mismatch errors across tables.
 */
export async function listStudentEnrolledSectionsForTerm(studentExternalId, term, year) {
    const sid = studentExternalId.trim();
    const t = term.trim();
    const countSql = `
    SELECT COUNT(*) AS cnt
    FROM portal_enrollments e
    WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND ${SQL_ACTIVE_PORTAL_ENROLLMENT_E}
  `;
    const sectionsSql = `
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
      0 AS enrolled_count,
      CAST(NULL AS JSON) AS enrolled_students_json
    FROM portal_enrollments e
    INNER JOIN portal_courses pc
      ON pc.course_id COLLATE utf8mb4_unicode_ci =
         e.course_id COLLATE utf8mb4_unicode_ci
    INNER JOIN course_sections cs_inner
      ON cs_inner.course_code COLLATE utf8mb4_unicode_ci =
         pc.course_code COLLATE utf8mb4_unicode_ci
      AND cs_inner.term COLLATE utf8mb4_unicode_ci =
          e.term COLLATE utf8mb4_unicode_ci
      AND cs_inner.year = e.year
    INNER JOIN (
      SELECT MIN(cs3.id) AS pick_id
      FROM portal_enrollments e3
      INNER JOIN portal_courses pc3
        ON pc3.course_id COLLATE utf8mb4_unicode_ci =
           e3.course_id COLLATE utf8mb4_unicode_ci
      INNER JOIN course_sections cs3
        ON cs3.course_code COLLATE utf8mb4_unicode_ci =
           pc3.course_code COLLATE utf8mb4_unicode_ci
        AND cs3.term COLLATE utf8mb4_unicode_ci =
            e3.term COLLATE utf8mb4_unicode_ci
        AND cs3.year = e3.year
      WHERE e3.student_external_id COLLATE utf8mb4_unicode_ci =
            CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND e3.term COLLATE utf8mb4_unicode_ci =
            CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND e3.year = ?
        AND (e3.status IS NULL OR LOWER(TRIM(e3.status)) = 'active')
      GROUP BY pc3.course_code
    ) chosen ON cs_inner.id = chosen.pick_id
    LEFT JOIN courses cat
      ON TRIM(cat.code) COLLATE utf8mb4_unicode_ci =
         TRIM(cs_inner.course_code) COLLATE utf8mb4_unicode_ci
    WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND ${SQL_ACTIVE_PORTAL_ENROLLMENT_E}
    ORDER BY cs_inner.course_code ASC, cs_inner.weekday ASC, cs_inner.start_time ASC
  `;
    const countParams = [sid, t, year];
    const sectionParams = [sid, t, year, sid, t, year];
    const [[countRows], [sectionRows]] = await Promise.all([
        pool.query(countSql, countParams),
        pool.query(sectionsSql, sectionParams),
    ]);
    const cntRaw = countRows[0]?.cnt;
    const activePortalEnrollmentCount = cntRaw == null ? 0 : Math.trunc(Number(cntRaw)) || 0;
    const sections = sectionRows.map((r) => mapCourseSectionRow(r));
    return {
        sections,
        meta: {
            activePortalEnrollmentCount,
            matchedSectionCount: sections.length,
        },
    };
}
/** @deprecated Prefer {@link listStudentEnrolledSectionsForTerm} for schedule metadata. */
export async function listStudentEnrolledSectionRows(studentExternalId, term, year) {
    const { sections } = await listStudentEnrolledSectionsForTerm(studentExternalId, term, year);
    return sections;
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
 * per enrollment (lowest `course_sections.id` for matching `course_code` + `term` + `year`).
 *
 * Join mirrors `listStudentEnrolledSectionsForTerm`: `portal_courses.course_code` ↔
 * `course_sections` on trimmed codes and calendar term/year so dashboard / account `scheduleRows`
 * get weekday and times when marks are absent (e.g. current term before grades post).
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
    INNER JOIN portal_courses pc
      ON pc.course_id COLLATE utf8mb4_unicode_ci =
         e.course_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN course_sections cs_pick
      ON TRIM(cs_pick.course_code) COLLATE utf8mb4_unicode_ci =
         TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
      AND TRIM(cs_pick.term) COLLATE utf8mb4_unicode_ci =
          TRIM(e.term) COLLATE utf8mb4_unicode_ci
      AND cs_pick.year = e.year
      AND cs_pick.id = (
        SELECT cs2.id
        FROM course_sections cs2
        WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
              TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
          AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
              TRIM(e.term) COLLATE utf8mb4_unicode_ci
          AND cs2.year = e.year
        ORDER BY
          (cs2.weekday IS NULL OR TRIM(cs2.weekday) = '' OR cs2.start_time IS NULL OR cs2.end_time IS NULL) ASC,
          cs2.id ASC
        LIMIT 1
      )
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
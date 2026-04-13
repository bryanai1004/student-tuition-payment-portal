import { pool } from "../lib/db.js";
import { listMarksForStudent } from "./studentAcademicsRepository.js";
import { mapCourseSectionRow, } from "./courseSectionRepository.js";
function trimNullableString(value) {
    if (value == null)
        return null;
    const trimmed = String(value).trim();
    return trimmed === "" ? null : trimmed;
}
function normalizeScheduleTrackForEnrollment(raw) {
    return String(raw ?? "").trim().toUpperCase() === "CN" ? "CN" : "EN";
}
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
function normalizeEnrollmentStatusForCompare(raw) {
    if (raw == null)
        return "active";
    return String(raw).trim().toLowerCase();
}
async function resolveRequestedEnrollmentSectionsForTermWithQueryable(db, term, year, sections) {
    const trimmedTerm = term.trim();
    const resolvedSections = [];
    for (const raw of sections) {
        const courseCode = raw.course_code.trim();
        const sectionCode = raw.section_code.trim();
        if (!courseCode || !sectionCode) {
            return {
                ok: false,
                error: "Each section must include course_code and section_code.",
            };
        }
        let secRows;
        if (raw.schedule_track === "EN" || raw.schedule_track === "CN") {
            const [rows] = await db.query(`SELECT
           cs.id,
           TRIM(cs.course_code) AS course_code,
           TRIM(cs.section_code) AS section_code,
           cs.schedule_track,
           cs.prerequisite_course_id,
           pc.course_code AS prerequisite_course_code,
           pc.title AS prerequisite_course_title
         FROM course_sections cs
         LEFT JOIN portal_courses pc
           ON pc.course_id = cs.prerequisite_course_id
         WHERE cs.course_code = ?
           AND cs.section_code = ?
           AND cs.term = ?
           AND cs.year = ?
           AND cs.schedule_track = ?`, [courseCode, sectionCode, trimmedTerm, year, raw.schedule_track]);
            secRows = rows;
        }
        else {
            const [rows] = await db.query(`SELECT
           cs.id,
           TRIM(cs.course_code) AS course_code,
           TRIM(cs.section_code) AS section_code,
           cs.schedule_track,
           cs.prerequisite_course_id,
           pc.course_code AS prerequisite_course_code,
           pc.title AS prerequisite_course_title
         FROM course_sections cs
         LEFT JOIN portal_courses pc
           ON pc.course_id = cs.prerequisite_course_id
         WHERE cs.course_code = ?
           AND cs.section_code = ?
           AND cs.term = ?
           AND cs.year = ?
         ORDER BY
           CASE cs.schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END,
           cs.id ASC`, [courseCode, sectionCode, trimmedTerm, year]);
            secRows = rows;
        }
        if (secRows.length === 0) {
            return {
                ok: false,
                error: `No section ${sectionCode} for course ${courseCode} in this term.`,
            };
        }
        if (secRows.length > 1) {
            return {
                ok: false,
                error: `Multiple timetable sections match ${courseCode} ${sectionCode} for this term. Specify schedule_track EN or CN.`,
            };
        }
        const secRow = secRows[0];
        const courseSectionId = Number(secRow.id);
        if (!Number.isFinite(courseSectionId) || courseSectionId <= 0) {
            return {
                ok: false,
                error: `Invalid section id for ${courseCode} ${sectionCode}.`,
            };
        }
        resolvedSections.push({
            course_section_id: courseSectionId,
            course_code: trimNullableString(secRow.course_code) ?? courseCode,
            section_code: trimNullableString(secRow.section_code) ?? sectionCode,
            schedule_track: normalizeScheduleTrackForEnrollment(secRow.schedule_track),
            prerequisite_course_id: trimNullableString(secRow.prerequisite_course_id),
            prerequisite_course_code: trimNullableString(secRow.prerequisite_course_code),
            prerequisite_course_title: trimNullableString(secRow.prerequisite_course_title),
        });
    }
    return { ok: true, sections: resolvedSections };
}
export async function resolveRequestedEnrollmentSectionsForTerm(term, year, sections) {
    return resolveRequestedEnrollmentSectionsForTermWithQueryable(pool, term, year, sections);
}
export async function listStudentHistoricalCourseReferences(studentExternalId) {
    const sid = studentExternalId.trim();
    const refs = [];
    const seen = new Set();
    const pushRef = (ref) => {
        const courseId = trimNullableString(ref.course_id);
        const courseCode = trimNullableString(ref.course_code);
        if (courseId == null && courseCode == null)
            return;
        const key = `${ref.source}:${(courseId ?? "").toLowerCase()}:${(courseCode ?? "").toLowerCase()}`;
        if (seen.has(key))
            return;
        seen.add(key);
        refs.push({
            course_id: courseId,
            course_code: courseCode,
            source: ref.source,
        });
    };
    const [[portalRows], marksRows] = await Promise.all([
        pool.query(`SELECT DISTINCT
         TRIM(e.course_id) AS course_id,
         TRIM(pc.course_code) AS course_code
       FROM portal_enrollments e
       INNER JOIN portal_courses pc
         ON pc.course_id COLLATE utf8mb4_unicode_ci =
            e.course_id COLLATE utf8mb4_unicode_ci
       WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
             CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`, [sid]),
        listMarksForStudent(pool, sid),
    ]);
    for (const row of portalRows) {
        pushRef({
            course_id: trimNullableString(row.course_id),
            course_code: trimNullableString(row.course_code),
            source: "portal",
        });
    }
    const uniqueMarksCodes = Array.from(new Set(marksRows
        .map((row) => row.code.trim())
        .filter((code) => code !== "")));
    if (uniqueMarksCodes.length === 0) {
        return refs;
    }
    const placeholders = uniqueMarksCodes.map(() => "?").join(", ");
    const [catalogRows] = await pool.query(`SELECT TRIM(course_id) AS course_id, TRIM(course_code) AS course_code
     FROM portal_courses
     WHERE TRIM(course_code) COLLATE utf8mb4_unicode_ci IN (${placeholders})`, uniqueMarksCodes);
    const catalogByCode = new Map(catalogRows.map((row) => [
        String(row.course_code ?? "").trim().toLowerCase(),
        trimNullableString(row.course_id),
    ]));
    for (const courseCode of uniqueMarksCodes) {
        pushRef({
            course_id: catalogByCode.get(courseCode.toLowerCase()) ?? null,
            course_code: courseCode,
            source: "marks",
        });
    }
    return refs;
}
/**
 * Validates each section against `course_sections` and `portal_courses`, then inserts or reactivates
 * `portal_enrollments` rows. Duplicate / idempotency: same student + `course_section_id` + term + year
 * (active rows skipped; withdrawn rows reactivated). Legacy course-only rows are not used for new writes.
 */
export async function enrollStudentInSections(studentExternalId, term, year, sections, options) {
    const sid = studentExternalId.trim();
    const trimmedTerm = term.trim();
    if (sections.length === 0) {
        return { ok: false, error: "At least one section is required." };
    }
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        let insertedCount = 0;
        const resolvedSections = options?.resolvedSections != null
            ? { ok: true, sections: options.resolvedSections }
            : await resolveRequestedEnrollmentSectionsForTermWithQueryable(conn, trimmedTerm, year, sections);
        if (!resolvedSections.ok) {
            await conn.rollback();
            return resolvedSections;
        }
        for (const section of resolvedSections.sections) {
            const courseCode = section.course_code.trim();
            const courseSectionId = section.course_section_id;
            const secCodeStored = section.section_code.trim();
            const scheduleTrackStored = section.schedule_track;
            const resolved = await resolvePortalCourseIdForEnrollment(conn, courseCode);
            if (!resolved.ok) {
                await conn.rollback();
                return resolved;
            }
            const courseId = resolved.courseId;
            const [[existing]] = await conn.query(`SELECT id, status FROM portal_enrollments
         WHERE student_external_id COLLATE utf8mb4_unicode_ci =
               CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND course_section_id = ?
           AND term COLLATE utf8mb4_unicode_ci =
               CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
           AND year = ?
         LIMIT 2`, [sid, courseSectionId, trimmedTerm, year]);
            if (existing != null) {
                const st = normalizeEnrollmentStatusForCompare(existing.status);
                if (st === "active" || st === "") {
                    continue;
                }
                if (st === "withdrawn") {
                    await conn.query(`UPDATE portal_enrollments
             SET status = 'active',
                 withdrawn_at = NULL,
                 course_id = ?,
                 section_code = ?,
                 schedule_track = ?
             WHERE id = ?`, [
                        courseId,
                        secCodeStored,
                        scheduleTrackStored,
                        Number(existing.id),
                    ]);
                    insertedCount += 1;
                }
                continue;
            }
            await conn.query(`INSERT INTO portal_enrollments (
           student_external_id, course_id, course_section_id, section_code, schedule_track, term, year, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`, [
                sid,
                courseId,
                courseSectionId,
                secCodeStored,
                scheduleTrackStored,
                trimmedTerm,
                year,
            ]);
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
 * When `portal_enrollments.course_section_id` is set, the timetable row is that exact section.
 * Legacy rows with `course_section_id` NULL still resolve via `portal_courses.course_code` and a single
 * deterministic `course_sections` pick (`MIN(id)`) per enrollment row.
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
      COALESCE(cs_direct.id, cs_leg.id) AS id,
      COALESCE(cs_direct.course_code, cs_leg.course_code) AS course_code,
      COALESCE(cs_direct.term, cs_leg.term) AS term,
      COALESCE(cs_direct.year, cs_leg.year) AS year,
      COALESCE(cs_direct.section_code, cs_leg.section_code) AS section_code,
      COALESCE(cs_direct.schedule_track, cs_leg.schedule_track) AS schedule_track,
      COALESCE(cs_direct.weekday, cs_leg.weekday) AS weekday,
      COALESCE(cs_direct.start_time, cs_leg.start_time) AS start_time,
      COALESCE(cs_direct.end_time, cs_leg.end_time) AS end_time,
      COALESCE(cs_direct.delivery_mode, cs_leg.delivery_mode) AS delivery_mode,
      COALESCE(cs_direct.room, cs_leg.room) AS room,
      COALESCE(cs_direct.instructor, cs_leg.instructor) AS instructor,
      COALESCE(cs_direct.notes, cs_leg.notes) AS notes,
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
    LEFT JOIN course_sections cs_direct
      ON e.course_section_id IS NOT NULL
      AND cs_direct.id = e.course_section_id
      AND cs_direct.term COLLATE utf8mb4_unicode_ci =
          e.term COLLATE utf8mb4_unicode_ci
      AND cs_direct.year = e.year
    LEFT JOIN course_sections cs_leg
      ON e.course_section_id IS NULL
      AND TRIM(cs_leg.course_code) COLLATE utf8mb4_unicode_ci =
          TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
      AND TRIM(cs_leg.term) COLLATE utf8mb4_unicode_ci =
          TRIM(e.term) COLLATE utf8mb4_unicode_ci
      AND cs_leg.year = e.year
      AND cs_leg.id = (
        SELECT MIN(cs2.id)
        FROM course_sections cs2
        WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
              TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
          AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
              TRIM(e.term) COLLATE utf8mb4_unicode_ci
          AND cs2.year = e.year
      )
    LEFT JOIN courses cat
      ON TRIM(cat.code) COLLATE utf8mb4_unicode_ci =
         TRIM(COALESCE(cs_direct.course_code, cs_leg.course_code)) COLLATE utf8mb4_unicode_ci
    WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND ${SQL_ACTIVE_PORTAL_ENROLLMENT_E}
      AND (cs_direct.id IS NOT NULL OR cs_leg.id IS NOT NULL)
    ORDER BY course_code ASC, weekday ASC, start_time ASC
  `;
    const countParams = [sid, t, year];
    const sectionParams = [sid, t, year];
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
export async function listAdminEnrollmentRowsForSection(courseCode, term, year, options) {
    const code = courseCode.trim();
    const t = term.trim();
    const sid = options?.courseSectionId;
    const sectionFilter = sid != null && Number.isFinite(sid) && sid > 0
        ? `AND (
          e.course_section_id = ?
          OR (
            e.course_section_id IS NULL
            AND ? = (
              SELECT MIN(cs2.id)
              FROM course_sections cs2
              WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
                    TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
                AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
                    TRIM(e.term) COLLATE utf8mb4_unicode_ci
                AND cs2.year = e.year
            )
          )
        )`
        : "";
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
      ${sectionFilter}
    ORDER BY
      CASE WHEN ps.full_name IS NULL OR TRIM(ps.full_name) = '' THEN 1 ELSE 0 END,
      TRIM(ps.full_name) ASC,
      TRIM(e.student_external_id) ASC
  `;
    const params = sid != null && Number.isFinite(sid) && sid > 0
        ? [code, t, year, sid, sid]
        : [code, t, year];
    const [rows] = await pool.query(sql, params);
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
 * All `portal_enrollments` for a student with catalog title/units and timetable fields from
 * `course_sections`: exact `course_section_id` when present, else legacy `MIN(id)` pick per row.
 */
export async function listPortalEnrollmentRowsForStudentAcademics(studentExternalId) {
    const sid = studentExternalId.trim();
    const sql = `
    SELECT
      e.id AS portal_enrollment_id,
      TRIM(pc.course_code) AS course_code,
      TRIM(pc.title) AS course_title_raw,
      TRIM(e.term) AS term,
      e.year,
      pc.units,
      NULLIF(TRIM(e.section_code), '') AS enrollment_section_code,
      NULLIF(TRIM(e.schedule_track), '') AS enrollment_schedule_track,
      COALESCE(cs_direct.weekday, cs_leg.weekday) AS weekday,
      COALESCE(cs_direct.start_time, cs_leg.start_time) AS start_time,
      COALESCE(cs_direct.end_time, cs_leg.end_time) AS end_time,
      COALESCE(cs_direct.instructor, cs_leg.instructor) AS instructor,
      e.status AS enrollment_status,
      e.withdrawn_at AS withdrawn_at
    FROM portal_enrollments e
    INNER JOIN portal_courses pc
      ON pc.course_id COLLATE utf8mb4_unicode_ci =
         e.course_id COLLATE utf8mb4_unicode_ci
    LEFT JOIN course_sections cs_direct
      ON e.course_section_id IS NOT NULL
      AND cs_direct.id = e.course_section_id
      AND TRIM(cs_direct.term) COLLATE utf8mb4_unicode_ci =
          TRIM(e.term) COLLATE utf8mb4_unicode_ci
      AND cs_direct.year = e.year
    LEFT JOIN course_sections cs_leg
      ON e.course_section_id IS NULL
      AND TRIM(cs_leg.course_code) COLLATE utf8mb4_unicode_ci =
          TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
      AND TRIM(cs_leg.term) COLLATE utf8mb4_unicode_ci =
          TRIM(e.term) COLLATE utf8mb4_unicode_ci
      AND cs_leg.year = e.year
      AND cs_leg.id = (
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
      pc.course_code ASC,
      e.id ASC
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
        const sec = r.enrollment_section_code == null
            ? null
            : String(r.enrollment_section_code).trim() || null;
        const tr = r.enrollment_schedule_track == null
            ? null
            : String(r.enrollment_schedule_track).trim() || null;
        return {
            portal_enrollment_id: Number(r.portal_enrollment_id ?? 0),
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
            section_code: sec,
            schedule_track: tr,
        };
    });
}
/**
 * Soft-withdraws the enrollment row for one `course_sections.id` (and matching calendar term/year).
 * Only `portal_enrollments` is updated.
 */
export async function softWithdrawPortalEnrollmentByCourseSection(studentExternalId, term, year, courseSectionId) {
    const sid = studentExternalId.trim();
    const t = term.trim();
    const csid = Math.trunc(Number(courseSectionId));
    if (!Number.isFinite(csid) || csid <= 0)
        return 0;
    /**
     * Section-keyed rows match `course_section_id` directly.
     * Legacy rows (`course_section_id` NULL) match when the withdraw target is the canonical
     * `MIN(course_sections.id)` for that catalog course + term/year (same pick as timetable reads).
     */
    const sql = `
    UPDATE portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    SET
      e.status = 'withdrawn',
      e.withdrawn_at = NOW()
    WHERE e.student_external_id COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND (e.status IS NULL OR LOWER(TRIM(e.status)) = 'active')
      AND (
        e.course_section_id = ?
        OR (
          e.course_section_id IS NULL
          AND EXISTS (
            SELECT 1 FROM course_sections cs0
            WHERE cs0.id = ?
              AND TRIM(cs0.course_code) COLLATE utf8mb4_unicode_ci =
                  TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
              AND TRIM(cs0.term) COLLATE utf8mb4_unicode_ci =
                  TRIM(e.term) COLLATE utf8mb4_unicode_ci
              AND cs0.year = e.year
          )
          AND ? = (
            SELECT MIN(cs2.id)
            FROM course_sections cs2
            WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
                  TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci
              AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
                  TRIM(e.term) COLLATE utf8mb4_unicode_ci
              AND cs2.year = e.year
          )
        )
      )
  `;
    const [result] = await pool.query(sql, [
        sid,
        t,
        year,
        csid,
        csid,
        csid,
    ]);
    return result.affectedRows;
}
/**
 * Legacy: soft-withdraws a **course-level** portal row (`course_section_id` IS NULL) only.
 * Does not affect section-keyed enrollments for the same course code.
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
      AND e.course_section_id IS NULL
      AND (e.status IS NULL OR LOWER(TRIM(e.status)) = 'active')
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
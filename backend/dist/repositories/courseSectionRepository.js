import { pool } from "../lib/db.js";
function nullableString(v) {
    if (v === undefined || v === null)
        return null;
    if (typeof v === "bigint")
        return String(v);
    if (v instanceof Date)
        return v.toISOString();
    return String(v);
}
function nullableUnits(v) {
    if (v === undefined || v === null)
        return null;
    if (typeof v === "bigint") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    if (typeof v === "number")
        return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
        const t = v.trim();
        if (t === "")
            return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}
/** Shared by section rows and course-level open-registration rollups. */
export function parseEnrolledStudentsJson(raw) {
    if (raw == null || raw === "")
        return undefined;
    let arr;
    if (typeof raw === "string") {
        try {
            arr = JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    else {
        arr = raw;
    }
    if (!Array.isArray(arr))
        return undefined;
    const out = [];
    for (const el of arr) {
        if (el == null || typeof el !== "object")
            continue;
        const o = el;
        if (typeof o.student_external_id !== "string")
            continue;
        const fn = o.full_name;
        out.push({
            student_external_id: o.student_external_id.trim(),
            full_name: fn == null || String(fn).trim() === "" ? null : String(fn).trim(),
        });
    }
    if (out.length === 0)
        return undefined;
    out.sort((a, b) => a.student_external_id.localeCompare(b.student_external_id, undefined, {
        sensitivity: "base",
    }));
    return out;
}
function normalizeScheduleTrackFromRow(row) {
    const raw = row.schedule_track;
    const s = raw === undefined || raw === null ? "" : String(raw).trim().toUpperCase();
    return s === "CN" ? "CN" : "EN";
}
export function mapCourseSectionRow(row) {
    return {
        id: Number(row.id),
        course_code: String(row.course_code ?? ""),
        prerequisite_course_id: nullableString(row.prerequisite_course_id),
        term: String(row.term ?? ""),
        year: Number(row.year),
        section_code: String(row.section_code ?? ""),
        schedule_track: normalizeScheduleTrackFromRow(row),
        weekday: String(row.weekday ?? ""),
        start_time: nullableString(row.start_time),
        end_time: nullableString(row.end_time),
        delivery_mode: nullableString(row.delivery_mode),
        room: nullableString(row.room),
        instructor: nullableString(row.instructor),
        notes: nullableString(row.notes),
        course_title: nullableString(row.course_title),
        units: nullableUnits(row.units),
        enrolled_count: Number(row.enrolled_count ?? 0),
        enrolled_students: parseEnrolledStudentsJson(row.enrolled_students_json),
    };
}
const SECTION_SELECT = `
  SELECT
    id,
    course_code,
    prerequisite_course_id,
    term,
    year,
    section_code,
    schedule_track,
    weekday,
    start_time,
    end_time,
    delivery_mode,
    room,
    instructor,
    notes
  FROM course_sections
`;
const UPDATABLE_COLUMNS = [
    "course_code",
    "prerequisite_course_id",
    "term",
    "year",
    "section_code",
    "schedule_track",
    "weekday",
    "start_time",
    "end_time",
    "delivery_mode",
    "room",
    "instructor",
    "notes",
];
export async function getCourseSectionById(id) {
    const sql = `${SECTION_SELECT} WHERE id = ? LIMIT 1`;
    const [rows] = await pool.query(sql, [id]);
    const row = rows[0];
    return row ? mapCourseSectionRow(row) : null;
}
/**
 * Sections for a catalog course, from `course_sections` keyed by `course_code`.
 * When `termFilter` is set, restricts rows to that legacy `term` + `year` (matches `academic_terms.term_name` / `year`).
 */
export async function listCourseSectionsByCourseCode(courseCode, termFilter) {
    const code = courseCode.trim();
    if (termFilter) {
        const sql = `${SECTION_SELECT} WHERE course_code = ? AND term = ? AND year = ? ORDER BY CASE schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END, weekday ASC, start_time ASC, section_code ASC`;
        const [rows] = await pool.query(sql, [
            code,
            termFilter.term.trim(),
            termFilter.year,
        ]);
        return rows.map((r) => mapCourseSectionRow(withZeroEnrollment(r)));
    }
    const sql = `${SECTION_SELECT} WHERE course_code = ? ORDER BY year ASC, term ASC, CASE schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END, weekday ASC, start_time ASC, section_code ASC`;
    const [rows] = await pool.query(sql, [code]);
    return rows.map((r) => mapCourseSectionRow(withZeroEnrollment(r)));
}
function withZeroEnrollment(r) {
    return { ...r, enrolled_count: 0, enrolled_students_json: null };
}
/** All sections offered in a legacy term + year (for admin timetable). */
export async function listCourseSectionsByTermYear(term, year) {
    return listCourseSectionsWithEnrollmentAggregates(term, year, {});
}
/**
 * Sections for a term/year with `portal_enrollments` rollups **per section row** (exact `course_section_id`,
 * plus legacy course-level rows attributed to the canonical `MIN(course_sections.id)` for that course).
 */
export async function listCourseSectionsWithEnrollmentAggregates(term, year, options) {
    const t = term.trim();
    const cc = (options?.courseCode ?? "").trim();
    const courseClauseOuter = cc !== "" ? "AND cs.course_code = ?" : "";
    const courseClauseAgg = cc !== "" ? "AND csx.course_code = ?" : "";
    const sql = `
    SELECT
      cs.id,
      cs.course_code,
      cs.prerequisite_course_id,
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
      crs.units AS units,
      COALESCE(agg.enrolled_count, 0) AS enrolled_count,
      agg.enrolled_students_json
    FROM course_sections cs
    LEFT JOIN courses crs
      ON CONVERT(TRIM(crs.code) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
         CONVERT(TRIM(cs.course_code) USING utf8mb4) COLLATE utf8mb4_unicode_ci
    LEFT JOIN (
      SELECT
        csx.id AS section_row_id,
        COUNT(DISTINCT e.student_external_id) AS enrolled_count,
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'student_external_id', e.student_external_id,
            'full_name', ps.full_name
          )
        ) AS enrolled_students_json
      FROM course_sections csx
      LEFT JOIN portal_enrollments e
        ON (
          (e.course_section_id IS NOT NULL AND e.course_section_id = csx.id)
          OR (
            e.course_section_id IS NULL
            AND TRIM(e.term) COLLATE utf8mb4_unicode_ci =
                TRIM(csx.term) COLLATE utf8mb4_unicode_ci
            AND e.year = csx.year
            AND EXISTS (
              SELECT 1 FROM portal_courses pc
              WHERE pc.course_id = e.course_id
                AND TRIM(pc.course_code) COLLATE utf8mb4_unicode_ci =
                    TRIM(csx.course_code) COLLATE utf8mb4_unicode_ci
            )
            AND csx.id = (
              SELECT MIN(cs2.id)
              FROM course_sections cs2
              WHERE TRIM(cs2.course_code) COLLATE utf8mb4_unicode_ci =
                    TRIM(csx.course_code) COLLATE utf8mb4_unicode_ci
                AND TRIM(cs2.term) COLLATE utf8mb4_unicode_ci =
                    TRIM(csx.term) COLLATE utf8mb4_unicode_ci
                AND cs2.year = csx.year
            )
          )
        )
        AND (e.status IS NULL OR LOWER(TRIM(e.status)) = 'active')
      LEFT JOIN portal_students ps
        ON CONVERT(ps.student_external_id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
           CONVERT(e.student_external_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE TRIM(csx.term) COLLATE utf8mb4_unicode_ci =
            CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        AND csx.year = ?
        ${courseClauseAgg}
      GROUP BY csx.id
    ) agg ON agg.section_row_id = cs.id
    WHERE cs.term = ? AND cs.year = ?
    ${courseClauseOuter}
    ORDER BY CASE cs.schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END,
      cs.course_code ASC, cs.weekday ASC, cs.start_time ASC, cs.section_code ASC
  `;
    const params = cc !== ""
        ? [t, year, cc, t, year, cc]
        : [t, year, t, year];
    const [rows] = await pool.query(sql, params);
    return rows.map((r) => mapCourseSectionRow(r));
}
export async function listPortalEnrollmentRollupsByCourseForTermYear(term, year) {
    const sql = `
    SELECT
      pc.course_code AS rollup_course_code,
      COUNT(DISTINCT e.student_external_id) AS enrolled_count,
      JSON_ARRAYAGG(
        JSON_OBJECT(
          'student_external_id', e.student_external_id,
          'full_name', ps.full_name
        )
      ) AS enrolled_students_json
    FROM portal_enrollments e
    INNER JOIN portal_courses pc ON pc.course_id = e.course_id
    LEFT JOIN portal_students ps ON ps.student_external_id = e.student_external_id
    WHERE e.term COLLATE utf8mb4_unicode_ci =
          CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND e.year = ?
      AND (e.status IS NULL OR e.status = 'active')
    GROUP BY pc.course_code
    ORDER BY pc.course_code ASC
  `;
    const [rows] = await pool.query(sql, [term.trim(), year]);
    return rows.map((r) => {
        const code = String(r.rollup_course_code ?? "").trim();
        const enrolled_students = parseEnrolledStudentsJson(r.enrolled_students_json);
        return {
            course_code: code,
            enrolled_count: Number(r.enrolled_count ?? 0),
            ...(enrolled_students != null && enrolled_students.length > 0
                ? { enrolled_students }
                : {}),
        };
    });
}
export async function countCourseSectionsByCourseForTermYear(term, year) {
    const sql = `
    SELECT course_code, COUNT(*) AS section_count
    FROM course_sections
    WHERE term = ? AND year = ?
    GROUP BY course_code
    ORDER BY course_code ASC
  `;
    const [rows] = await pool.query(sql, [
        term.trim(),
        year,
    ]);
    return rows.map((r) => ({
        course_code: String(r.course_code ?? ""),
        section_count: Number(r.section_count ?? 0),
    }));
}
function trimNullableString(v) {
    const s = nullableString(v);
    if (s == null)
        return null;
    const t = s.trim();
    return t === "" ? null : t;
}
/**
 * Candidate prerequisite rows for each offered course in a term/year.
 *
 * Returns one row per section so the service layer can deterministically pick a
 * course-level prerequisite and optionally warn when sections disagree.
 */
export async function listCoursePrerequisiteCandidatesByCourseForTermYear(term, year) {
    const sql = `
    SELECT
      cs.course_code,
      cs.prerequisite_course_id,
      pc.course_code AS prerequisite_course_code,
      pc.title AS prerequisite_course_title
    FROM course_sections cs
    LEFT JOIN portal_courses pc
      ON pc.course_id = cs.prerequisite_course_id
    WHERE cs.term = ? AND cs.year = ?
    ORDER BY
      cs.course_code ASC,
      CASE
        WHEN cs.prerequisite_course_id IS NULL OR TRIM(cs.prerequisite_course_id) = '' THEN 1
        ELSE 0
      END ASC,
      cs.prerequisite_course_id ASC,
      cs.id ASC
  `;
    const [rows] = await pool.query(sql, [term.trim(), year]);
    return rows.map((r) => ({
        course_code: String(r.course_code ?? "").trim(),
        prerequisite_course_id: trimNullableString(r.prerequisite_course_id),
        prerequisite_course_code: trimNullableString(r.prerequisite_course_code),
        prerequisite_course_title: trimNullableString(r.prerequisite_course_title),
    }));
}
export async function createCourseSection(input) {
    const sql = `
    INSERT INTO course_sections (
      course_code,
      prerequisite_course_id,
      term,
      year,
      section_code,
      schedule_track,
      weekday,
      start_time,
      end_time,
      delivery_mode,
      room,
      instructor,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    const params = [
        input.course_code,
        input.prerequisite_course_id ?? null,
        input.term,
        input.year,
        input.section_code,
        input.schedule_track ?? "EN",
        input.weekday,
        input.start_time ?? null,
        input.end_time ?? null,
        input.delivery_mode ?? null,
        input.room ?? null,
        input.instructor ?? null,
        input.notes ?? null,
    ];
    const [result] = await pool.query(sql, params);
    const created = await getCourseSectionById(Number(result.insertId));
    if (!created) {
        throw new Error("Failed to load course section after insert");
    }
    return created;
}
/**
 * Applies a partial update. Returns `null` if the row does not exist.
 * Callers should reject empty patches before calling.
 */
export async function updateCourseSection(id, patch) {
    const assignments = [];
    const values = [];
    for (const col of UPDATABLE_COLUMNS) {
        if (!Object.prototype.hasOwnProperty.call(patch, col))
            continue;
        assignments.push(`${col} = ?`);
        values.push(patch[col] ?? null);
    }
    if (assignments.length === 0) {
        return getCourseSectionById(id);
    }
    values.push(id);
    const sql = `UPDATE course_sections SET ${assignments.join(", ")} WHERE id = ?`;
    await pool.query(sql, values);
    return getCourseSectionById(id);
}
export async function deleteCourseSectionById(id) {
    const sql = "DELETE FROM course_sections WHERE id = ?";
    const [result] = await pool.query(sql, [id]);
    return result.affectedRows > 0;
}
//# sourceMappingURL=courseSectionRepository.js.map
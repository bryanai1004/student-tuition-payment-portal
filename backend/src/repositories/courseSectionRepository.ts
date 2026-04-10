import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../lib/db.js";

/** API shape for one `course_sections` row (stable for future admin CRUD). */
export type CourseSectionDetail = {
  id: number;
  course_code: string;
  term: string;
  year: number;
  section_code: string;
  /** Offered timetable group: English (EN) vs Chinese (CN). Not student track. */
  schedule_track: "EN" | "CN";
  weekday: string;
  start_time: string | null;
  end_time: string | null;
  delivery_mode: string | null;
  room: string | null;
  instructor: string | null;
  notes: string | null;
  /** Set when `portal_courses.title` is selected (e.g. student enrolled-sections). Otherwise null. */
  course_title: string | null;
  /** Distinct students enrolled in this course (same term/year) via `portal_enrollments`. */
  enrolled_count: number;
  /** Catalog units from `courses.units` (joined by `course_code`); null when no catalog row. */
  units: number | null;
  /** Present when at least one enrollment exists for the course in this term/year. */
  enrolled_students?: Array<{
    student_external_id: string;
    full_name: string | null;
  }>;
};

function nullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function nullableUnits(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Shared by section rows and course-level open-registration rollups. */
export function parseEnrolledStudentsJson(
  raw: unknown,
): CourseSectionDetail["enrolled_students"] {
  if (raw == null || raw === "") return undefined;
  let arr: unknown;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr)) return undefined;
  const out: NonNullable<CourseSectionDetail["enrolled_students"]> = [];
  for (const el of arr) {
    if (el == null || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    if (typeof o.student_external_id !== "string") continue;
    const fn = o.full_name;
    out.push({
      student_external_id: o.student_external_id.trim(),
      full_name:
        fn == null || String(fn).trim() === "" ? null : String(fn).trim(),
    });
  }
  if (out.length === 0) return undefined;
  out.sort((a, b) =>
    a.student_external_id.localeCompare(b.student_external_id, undefined, {
      sensitivity: "base",
    }),
  );
  return out;
}

function normalizeScheduleTrackFromRow(row: RowDataPacket): "EN" | "CN" {
  const raw = row.schedule_track;
  const s =
    raw === undefined || raw === null ? "" : String(raw).trim().toUpperCase();
  return s === "CN" ? "CN" : "EN";
}

export function mapCourseSectionRow(row: RowDataPacket): CourseSectionDetail {
  return {
    id: Number(row.id),
    course_code: String(row.course_code ?? ""),
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
] as const;

export type CourseSectionCreateInput = {
  course_code: string;
  term: string;
  year: number;
  section_code: string;
  /** Defaults to EN when omitted (insert uses DB default / repository fallback). */
  schedule_track?: "EN" | "CN";
  weekday: string;
  start_time?: string | null;
  end_time?: string | null;
  delivery_mode?: string | null;
  room?: string | null;
  instructor?: string | null;
  notes?: string | null;
};

export type CourseSectionUpdateInput = Partial<CourseSectionCreateInput>;

export async function getCourseSectionById(
  id: number,
): Promise<CourseSectionDetail | null> {
  const sql = `${SECTION_SELECT} WHERE id = ? LIMIT 1`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [id]);
  const row = rows[0];
  return row ? mapCourseSectionRow(row) : null;
}

export type CourseSectionTermFilter = {
  term: string;
  year: number;
};

/**
 * Sections for a catalog course, from `course_sections` keyed by `course_code`.
 * When `termFilter` is set, restricts rows to that legacy `term` + `year` (matches `academic_terms.term_name` / `year`).
 */
export async function listCourseSectionsByCourseCode(
  courseCode: string,
  termFilter?: CourseSectionTermFilter,
): Promise<CourseSectionDetail[]> {
  const code = courseCode.trim();
  if (termFilter) {
    const sql = `${SECTION_SELECT} WHERE course_code = ? AND term = ? AND year = ? ORDER BY CASE schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END, weekday ASC, start_time ASC, section_code ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, [
      code,
      termFilter.term.trim(),
      termFilter.year,
    ]);
    return rows.map((r) => mapCourseSectionRow(withZeroEnrollment(r)));
  }
  const sql = `${SECTION_SELECT} WHERE course_code = ? ORDER BY year ASC, term ASC, CASE schedule_track WHEN 'EN' THEN 0 WHEN 'CN' THEN 1 ELSE 2 END, weekday ASC, start_time ASC, section_code ASC`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [code]);
  return rows.map((r) => mapCourseSectionRow(withZeroEnrollment(r)));
}

function withZeroEnrollment(r: RowDataPacket): RowDataPacket {
  return { ...r, enrolled_count: 0, enrolled_students_json: null };
}

/** All sections offered in a legacy term + year (for admin timetable). */
export async function listCourseSectionsByTermYear(
  term: string,
  year: number,
): Promise<CourseSectionDetail[]> {
  return listCourseSectionsWithEnrollmentAggregates(term, year, {});
}

/**
 * Sections for a term/year with `portal_enrollments` rollups **per section row** (exact `course_section_id`,
 * plus legacy course-level rows attributed to the canonical `MIN(course_sections.id)` for that course).
 */
export async function listCourseSectionsWithEnrollmentAggregates(
  term: string,
  year: number,
  options?: { courseCode?: string | null },
): Promise<CourseSectionDetail[]> {
  const t = term.trim();
  const cc = (options?.courseCode ?? "").trim();
  const courseClauseOuter = cc !== "" ? "AND cs.course_code = ?" : "";
  const courseClauseAgg = cc !== "" ? "AND csx.course_code = ?" : "";
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
  const params: unknown[] =
    cc !== ""
      ? [t, year, cc, t, year, cc]
      : [t, year, t, year];
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows.map((r) => mapCourseSectionRow(r));
}

/** Course-level section counts for one legacy term + year (admin open-registration rollup). */
export type CourseSectionCountByCourse = {
  course_code: string;
  section_count: number;
};

/** Course-level `portal_enrollments` counts (distinct students; multiple section rows per student still count once per course). */
export type PortalEnrollmentRollupByCourse = {
  course_code: string;
  enrolled_count: number;
  enrolled_students?: CourseSectionDetail["enrolled_students"];
};

export async function listPortalEnrollmentRollupsByCourseForTermYear(
  term: string,
  year: number,
): Promise<PortalEnrollmentRollupByCourse[]> {
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
  const [rows] = await pool.query<RowDataPacket[]>(sql, [term.trim(), year]);
  return rows.map((r) => {
    const code = String(r.rollup_course_code ?? "").trim();
    const enrolled_students = parseEnrolledStudentsJson(
      r.enrolled_students_json,
    );
    return {
      course_code: code,
      enrolled_count: Number(r.enrolled_count ?? 0),
      ...(enrolled_students != null && enrolled_students.length > 0
        ? { enrolled_students }
        : {}),
    };
  });
}

export async function countCourseSectionsByCourseForTermYear(
  term: string,
  year: number,
): Promise<CourseSectionCountByCourse[]> {
  const sql = `
    SELECT course_code, COUNT(*) AS section_count
    FROM course_sections
    WHERE term = ? AND year = ?
    GROUP BY course_code
    ORDER BY course_code ASC
  `;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [
    term.trim(),
    year,
  ]);
  return rows.map((r) => ({
    course_code: String(r.course_code ?? ""),
    section_count: Number(r.section_count ?? 0),
  }));
}

export async function createCourseSection(
  input: CourseSectionCreateInput,
): Promise<CourseSectionDetail> {
  const sql = `
    INSERT INTO course_sections (
      course_code,
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    input.course_code,
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
  const [result] = await pool.query<ResultSetHeader>(sql, params);
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
export async function updateCourseSection(
  id: number,
  patch: CourseSectionUpdateInput,
): Promise<CourseSectionDetail | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const col of UPDATABLE_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(patch, col)) continue;
    assignments.push(`${col} = ?`);
    values.push(patch[col] ?? null);
  }
  if (assignments.length === 0) {
    return getCourseSectionById(id);
  }
  values.push(id);
  const sql = `UPDATE course_sections SET ${assignments.join(", ")} WHERE id = ?`;
  await pool.query<ResultSetHeader>(sql, values);
  return getCourseSectionById(id);
}

export async function deleteCourseSectionById(id: number): Promise<boolean> {
  const sql = "DELETE FROM course_sections WHERE id = ?";
  const [result] = await pool.query<ResultSetHeader>(sql, [id]);
  return result.affectedRows > 0;
}

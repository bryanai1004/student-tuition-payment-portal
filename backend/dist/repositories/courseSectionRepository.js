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
function normalizeRow(row) {
    return {
        id: Number(row.id),
        course_code: String(row.course_code ?? ""),
        term: String(row.term ?? ""),
        year: Number(row.year),
        section_code: String(row.section_code ?? ""),
        weekday: String(row.weekday ?? ""),
        start_time: nullableString(row.start_time),
        end_time: nullableString(row.end_time),
        delivery_mode: nullableString(row.delivery_mode),
        room: nullableString(row.room),
        instructor: nullableString(row.instructor),
        notes: nullableString(row.notes),
    };
}
const SECTION_SELECT = `
  SELECT
    id,
    course_code,
    term,
    year,
    section_code,
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
    return row ? normalizeRow(row) : null;
}
/**
 * Sections for a catalog course, from `course_sections` keyed by `course_code`.
 * When `termFilter` is set, restricts rows to that legacy `term` + `year` (matches `academic_terms.term_name` / `year`).
 */
export async function listCourseSectionsByCourseCode(courseCode, termFilter) {
    const code = courseCode.trim();
    if (termFilter) {
        const sql = `${SECTION_SELECT} WHERE course_code = ? AND term = ? AND year = ? ORDER BY weekday ASC, start_time ASC`;
        const [rows] = await pool.query(sql, [
            code,
            termFilter.term.trim(),
            termFilter.year,
        ]);
        return rows.map((r) => normalizeRow(r));
    }
    const sql = `${SECTION_SELECT} WHERE course_code = ? ORDER BY year ASC, term ASC, weekday ASC, start_time ASC`;
    const [rows] = await pool.query(sql, [code]);
    return rows.map((r) => normalizeRow(r));
}
export async function createCourseSection(input) {
    const sql = `
    INSERT INTO course_sections (
      course_code,
      term,
      year,
      section_code,
      weekday,
      start_time,
      end_time,
      delivery_mode,
      room,
      instructor,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    const params = [
        input.course_code,
        input.term,
        input.year,
        input.section_code,
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
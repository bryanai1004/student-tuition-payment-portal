import { pool } from "../lib/db.js";
function ts(v) {
    if (v instanceof Date)
        return v.toISOString();
    if (typeof v === "string" && v)
        return v;
    return new Date(0).toISOString();
}
function normalizeRow(row, studentId) {
    return {
        id: Number(row.id),
        student_id: String(row.student_id ?? studentId),
        course_code: String(row.course_code ?? ""),
        section: String(row.section ?? ""),
        session: row.session == null ? null : String(row.session),
        type: row.type == null ? null : String(row.type),
        units: row.units == null ? null : String(row.units),
        registered_display: row.registered_display == null ? null : String(row.registered_display),
        time_display: row.time_display == null ? null : String(row.time_display),
        days_display: row.days_display == null ? null : String(row.days_display),
        instructor: row.instructor == null ? null : String(row.instructor),
        location: row.location == null ? null : String(row.location),
        eng_name: row.eng_name == null ? null : String(row.eng_name),
        chi_name: row.chi_name == null ? null : String(row.chi_name),
        created_at: ts(row.created_at),
        updated_at: ts(row.updated_at),
    };
}
const SELECT_FIELDS = `
  id,
  student_id,
  course_code,
  section,
  session,
  type,
  units,
  registered_display,
  time_display,
  days_display,
  instructor,
  location,
  eng_name,
  chi_name,
  created_at,
  updated_at
`;
export async function listCourseBinByStudentId(studentId) {
    const [rows] = await pool.query(`SELECT ${SELECT_FIELDS}
     FROM student_course_bin
     WHERE student_id = ?
     ORDER BY updated_at DESC, id DESC`, [studentId]);
    return rows.map((r) => normalizeRow(r, studentId));
}
export async function upsertCourseBinItem(studentId, input) {
    await pool.query(`INSERT INTO student_course_bin (
      student_id,
      course_code,
      section,
      session,
      type,
      units,
      registered_display,
      time_display,
      days_display,
      instructor,
      location,
      eng_name,
      chi_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      session = VALUES(session),
      type = VALUES(type),
      units = VALUES(units),
      registered_display = VALUES(registered_display),
      time_display = VALUES(time_display),
      days_display = VALUES(days_display),
      instructor = VALUES(instructor),
      location = VALUES(location),
      eng_name = VALUES(eng_name),
      chi_name = VALUES(chi_name),
      updated_at = CURRENT_TIMESTAMP`, [
        studentId,
        input.course_code,
        input.section,
        input.session,
        input.type,
        input.units,
        input.registered_display,
        input.time_display,
        input.days_display,
        input.instructor,
        input.location,
        input.eng_name,
        input.chi_name,
    ]);
    const [rows] = await pool.query(`SELECT ${SELECT_FIELDS}
     FROM student_course_bin
     WHERE student_id = ?
       AND course_code = ?
       AND section = ?
     LIMIT 1`, [studentId, input.course_code, input.section]);
    const row = rows[0];
    if (!row) {
        throw new Error("Course bin upsert succeeded but row not found");
    }
    return normalizeRow(row, studentId);
}
export async function deleteCourseBinItem(studentId, itemId) {
    const [result] = await pool.query(`DELETE FROM student_course_bin
     WHERE id = ? AND student_id = ?
     LIMIT 1`, [itemId, studentId]);
    return result.affectedRows > 0;
}
//# sourceMappingURL=courseBinRepository.js.map
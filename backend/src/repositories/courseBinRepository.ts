import { pool, type ResultSetHeader, type RowDataPacket } from "../lib/db.js";
import type { CourseBinApiItem, CourseBinUpsertInput } from "../types/courseBin.js";

function ts(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) return v;
  return new Date(0).toISOString();
}

function normalizeScheduleTrack(raw: unknown): "EN" | "CN" {
  const s = String(raw ?? "").trim().toUpperCase();
  return s === "CN" ? "CN" : "EN";
}

function normalizeRow(row: RowDataPacket, studentId: string): CourseBinApiItem {
  return {
    id: Number(row.id),
    student_id: String(row.student_id ?? studentId),
    academic_term_id: String(row.academic_term_id ?? ""),
    course_code: String(row.course_code ?? ""),
    section: String(row.section ?? ""),
    schedule_track: normalizeScheduleTrack(row.schedule_track),
    session: row.session == null ? null : String(row.session),
    type: row.type == null ? null : String(row.type),
    units: row.units == null ? null : String(row.units),
    registered_display:
      row.registered_display == null ? null : String(row.registered_display),
    time_display: row.time_display == null ? null : String(row.time_display),
    days_display: row.days_display == null ? null : String(row.days_display),
    instructor: row.instructor == null ? null : String(row.instructor),
    location: row.location == null ? null : String(row.location),
    eng_name: row.eng_name == null ? null : String(row.eng_name),
    chi_name: row.chi_name == null ? null : String(row.chi_name),
    prerequisite_course_id:
      row.prerequisite_course_id == null
        ? null
        : String(row.prerequisite_course_id),
    prerequisite_course_code:
      row.prerequisite_course_code == null
        ? null
        : String(row.prerequisite_course_code),
    prerequisite_course_title:
      row.prerequisite_course_title == null
        ? null
        : String(row.prerequisite_course_title),
    schedule_weekday:
      row.schedule_weekday == null ? null : String(row.schedule_weekday),
    schedule_start_time:
      row.schedule_start_time == null ? null : String(row.schedule_start_time),
    schedule_end_time:
      row.schedule_end_time == null ? null : String(row.schedule_end_time),
    created_at: ts(row.created_at),
    updated_at: ts(row.updated_at),
  };
}

const SELECT_FIELDS = `
  id,
  student_id,
  academic_term_id,
  course_code,
  section,
  schedule_track,
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
  prerequisite_course_id,
  prerequisite_course_code,
  prerequisite_course_title,
  schedule_weekday,
  schedule_start_time,
  schedule_end_time,
  created_at,
  updated_at
`;

export async function listCourseBinByStudentAndTerm(
  studentId: string,
  academicTermId: string,
): Promise<CourseBinApiItem[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${SELECT_FIELDS}
     FROM student_course_bin
     WHERE student_id = ?
       AND academic_term_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [studentId, academicTermId],
  );
  return rows.map((r) => normalizeRow(r, studentId));
}

export async function upsertCourseBinItem(
  studentId: string,
  input: CourseBinUpsertInput,
): Promise<CourseBinApiItem> {
  await pool.query<ResultSetHeader>(
    `INSERT INTO student_course_bin (
      student_id,
      academic_term_id,
      course_code,
      section,
      schedule_track,
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
      prerequisite_course_id,
      prerequisite_course_code,
      prerequisite_course_title,
      schedule_weekday,
      schedule_start_time,
      schedule_end_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (student_id, academic_term_id, course_code, section, schedule_track)
    DO UPDATE SET
      session = EXCLUDED.session,
      type = EXCLUDED.type,
      units = EXCLUDED.units,
      registered_display = EXCLUDED.registered_display,
      time_display = EXCLUDED.time_display,
      days_display = EXCLUDED.days_display,
      instructor = EXCLUDED.instructor,
      location = EXCLUDED.location,
      eng_name = EXCLUDED.eng_name,
      chi_name = EXCLUDED.chi_name,
      prerequisite_course_id = EXCLUDED.prerequisite_course_id,
      prerequisite_course_code = EXCLUDED.prerequisite_course_code,
      prerequisite_course_title = EXCLUDED.prerequisite_course_title,
      schedule_weekday = EXCLUDED.schedule_weekday,
      schedule_start_time = EXCLUDED.schedule_start_time,
      schedule_end_time = EXCLUDED.schedule_end_time,
      updated_at = CURRENT_TIMESTAMP`,
    [
      studentId,
      input.academic_term_id,
      input.course_code,
      input.section,
      input.schedule_track,
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
      input.prerequisite_course_id,
      input.prerequisite_course_code,
      input.prerequisite_course_title,
      input.schedule_weekday,
      input.schedule_start_time,
      input.schedule_end_time,
    ],
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${SELECT_FIELDS}
     FROM student_course_bin
     WHERE student_id = ?
       AND academic_term_id = ?
       AND course_code = ?
       AND section = ?
       AND schedule_track = ?
     LIMIT 1`,
    [
      studentId,
      input.academic_term_id,
      input.course_code,
      input.section,
      input.schedule_track,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Course bin upsert succeeded but row not found");
  }
  return normalizeRow(row, studentId);
}

export async function deleteCourseBinItem(
  studentId: string,
  itemId: number,
): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM student_course_bin
     WHERE id = ? AND student_id = ?`,
    [itemId, studentId],
  );
  return result.affectedRows > 0;
}

export async function deleteCourseBinForStudentTerm(
  studentId: string,
  academicTermId: string,
): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM student_course_bin
     WHERE student_id = ?
       AND academic_term_id = ?`,
    [studentId, academicTermId],
  );
  return result.affectedRows;
}

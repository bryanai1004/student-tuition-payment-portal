import type { RowDataPacket } from "mysql2";
import { pool } from "../lib/db.js";

/** API shape for one `course_sections` row (stable for future admin CRUD). */
export type CourseSectionDetail = {
  id: number;
  course_code: string;
  term: string;
  year: number;
  section_code: string;
  weekday: string;
  start_time: string | null;
  end_time: string | null;
  delivery_mode: string | null;
  room: string | null;
  instructor: string | null;
  notes: string | null;
};

function nullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "bigint") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function normalizeRow(row: RowDataPacket): CourseSectionDetail {
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

/**
 * Sections for a catalog course, from `course_sections` keyed by `course_code`.
 */
export async function listCourseSectionsByCourseCode(
  courseCode: string,
): Promise<CourseSectionDetail[]> {
  const sql = `
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
    WHERE course_code = ?
    ORDER BY year ASC, term ASC, weekday ASC, start_time ASC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(sql, [courseCode]);
  return rows.map((r) => normalizeRow(r));
}

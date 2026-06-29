import { type Pool, type RowDataPacket } from "../lib/db.js";

/**
 * Legacy `marks` (live school DB):
 * - `id` — student key (same as `students.id`, e.g. C17310)
 * - `name` — student display name
 * - `code`, `course_title`, `days`, `time_from`, `time_to`, `instructor`, `term`, `year`, `grade`, `grade2`
 */

/** Same term ordering as registration/accounting: Winter < Spring < Summer < Fall within a year. */
export const MARKS_ORDER_BY_NEWEST = `year DESC,
  CASE UPPER(TRIM(term))
    WHEN 'FALL' THEN 4
    WHEN 'SUMMER' THEN 3
    WHEN 'SPRING' THEN 2
    WHEN 'WINTER' THEN 1
    ELSE 0
  END DESC,
  TRIM(code) ASC`;

export type MarksRow = {
  name: string;
  code: string;
  course_title: string;
  units: number;
  days: string | null;
  time_from: unknown;
  time_to: unknown;
  instructor: string;
  term: string;
  year: number;
  grade: string;
  grade2: unknown;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function mapMarksRow(r: RowDataPacket): MarksRow {
  const row = r as Record<string, unknown>;
  const unitsRaw = Number(row.units);
  const units = Number.isFinite(unitsRaw) ? unitsRaw : 0;
  return {
    name: str(row.name),
    code: str(row.code),
    course_title: str(row.course_title),
    units,
    days: row.days == null || str(row.days) === "" ? null : str(row.days),
    time_from: row.time_from,
    time_to: row.time_to,
    instructor: str(row.instructor),
    term: str(row.term),
    year: Number(row.year),
    grade: str(row.grade),
    grade2: row.grade2,
  };
}

/**
 * All `marks` rows for the student, newest term/year first (then course code).
 */
export async function listMarksForStudent(
  pool: Pool,
  studentId: string,
): Promise<MarksRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name,
            TRIM(code) AS code,
            course_title,
            units,
            days,
            time_from,
            time_to,
            instructor,
            TRIM(term) AS term,
            year,
            grade,
            grade2
     FROM marks
     WHERE TRIM(id) = TRIM(?)
     ORDER BY ${MARKS_ORDER_BY_NEWEST}`,
    [studentId],
  );

  return rows.map(mapMarksRow);
}

/**
 * `marks` rows for one student and quarter (legacy schedule / enrollment-of-record).
 */
export async function listMarksForStudentTerm(
  pool: Pool,
  studentId: string,
  term: string,
  year: number,
): Promise<MarksRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name,
            TRIM(code) AS code,
            course_title,
            units,
            days,
            time_from,
            time_to,
            instructor,
            TRIM(term) AS term,
            year,
            grade,
            grade2
     FROM marks
     WHERE TRIM(id) = TRIM(?)
       AND LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND year = ?
     ORDER BY TRIM(code) ASC`,
    [studentId, term, year],
  );

  return rows.map(mapMarksRow);
}

/** Display name from legacy `students` when the student has no `marks` rows yet. */
export async function getLegacyStudentDisplayName(
  pool: Pool,
  studentId: string,
): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name FROM students WHERE id = ? LIMIT 1`,
    [studentId.trim()],
  );
  const row = rows[0];
  if (row == null) return null;
  const n = str(row.name);
  return n.length > 0 ? n : null;
}

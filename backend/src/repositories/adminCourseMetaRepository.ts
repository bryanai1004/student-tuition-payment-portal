import type { RowDataPacket } from "mysql2";
import { pool } from "../lib/db.js";

function trimOrEmpty(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

export type CourseCatalogNamesRow = {
  chi_name: string;
  eng_name: string;
};

/**
 * Legacy `courses` row for the given code (TRIM match). Empty strings treated as absent for titles.
 */
export async function selectCourseNamesByCode(
  courseCode: string,
): Promise<CourseCatalogNamesRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT chi_name, eng_name
     FROM courses
     WHERE TRIM(code) = ?
     LIMIT 1`,
    [courseCode],
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0] as RowDataPacket;
  return {
    chi_name: trimOrEmpty(r.chi_name),
    eng_name: trimOrEmpty(r.eng_name),
  };
}

/**
 * Distinct non-empty TRIM(instructor_id) across legacy timetable tables for TRIM(course) = code.
 */
export async function selectDistinctTimetableInstructorIdsForCourse(
  courseCode: string,
): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT TRIM(t.instructor_id) AS iid
     FROM (
       SELECT instructor_id, course FROM timetable
       UNION ALL
       SELECT instructor_id, course FROM timetable2
       UNION ALL
       SELECT instructor_id, course FROM daim_timetable
       UNION ALL
       SELECT instructor_id, course FROM daim_timetable2
     ) AS t
     WHERE TRIM(t.course) = ?
       AND t.instructor_id IS NOT NULL
       AND TRIM(t.instructor_id) <> ''`,
    [courseCode],
  );
  if (!Array.isArray(rows)) return [];
  const out: string[] = [];
  for (const row of rows) {
    const iid = trimOrEmpty((row as RowDataPacket).iid);
    if (iid !== "") out.push(iid);
  }
  return out;
}

export async function selectInstructorDisplayNameByInstructorId(
  instructorId: string,
): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT name_chi, name_eng
     FROM instructors
     WHERE TRIM(instructor_id) = ?
     ORDER BY sequenceNumber ASC
     LIMIT 1`,
    [instructorId],
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0] as RowDataPacket;
  const chi = trimOrEmpty(r.name_chi);
  if (chi !== "") return chi;
  const eng = trimOrEmpty(r.name_eng);
  return eng !== "" ? eng : null;
}

/**
 * Distinct trimmed legacy marks instructor strings for the course code (non-empty only).
 */
export async function selectDistinctMarksInstructorsForCourse(
  courseCode: string,
): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(instructor) AS instr
     FROM marks
     WHERE TRIM(code) = ?
       AND instructor IS NOT NULL
       AND TRIM(instructor) <> ''
     GROUP BY TRIM(instructor)`,
    [courseCode],
  );
  if (!Array.isArray(rows)) return [];
  const out: string[] = [];
  for (const row of rows) {
    const s = trimOrEmpty((row as RowDataPacket).instr);
    if (s !== "") out.push(s);
  }
  return out;
}

import { pool, type RowDataPacket } from "../lib/db.js";

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

export type TimetableInstructorPairRow = {
  instructor_id: string;
  instructor: string;
};

/**
 * Distinct (instructor_id, instructor) pairs from legacy timetable tables for the course.
 * Includes rows with empty instructor_id when `instructor` text is present (e.g. daim_timetable).
 */
export async function selectDistinctTimetableInstructorPairsForCourse(
  courseCode: string,
): Promise<TimetableInstructorPairRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT
       TRIM(t.instructor_id) AS iid,
       TRIM(t.instructor) AS instr
     FROM (
       SELECT instructor_id, instructor, course FROM timetable
       UNION ALL
       SELECT instructor_id, instructor, course FROM timetable2
       UNION ALL
       SELECT instructor_id, instructor, course FROM daim_timetable
       UNION ALL
       SELECT instructor_id, instructor, course FROM daim_timetable2
     ) AS t
     WHERE TRIM(t.course) = ?
       AND (
         (t.instructor_id IS NOT NULL AND TRIM(t.instructor_id) <> '')
         OR (t.instructor IS NOT NULL AND TRIM(t.instructor) <> '')
       )`,
    [courseCode],
  );
  if (!Array.isArray(rows)) return [];
  const out: TimetableInstructorPairRow[] = [];
  for (const row of rows) {
    const iid = trimOrEmpty((row as RowDataPacket).iid);
    const instr = trimOrEmpty((row as RowDataPacket).instr);
    if (iid === "" && instr === "") continue;
    out.push({ instructor_id: iid, instructor: instr });
  }
  return out;
}

export type InstructorNamesRow = {
  name_chi: string;
  name_eng: string;
};

/** Bilingual names for timetable `instructor_id` → `instructors` (first row by sequence). */
export async function selectInstructorNamesByInstructorId(
  instructorId: string,
): Promise<InstructorNamesRow | null> {
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
  return {
    name_chi: trimOrEmpty(r.name_chi),
    name_eng: trimOrEmpty(r.name_eng),
  };
}

/**
 * First bilingual row per TRIM(instructor_id) for batch timetable resolution.
 */
export async function selectInstructorNamesMapForInstructorIds(
  instructorIds: string[],
): Promise<Map<string, InstructorNamesRow>> {
  const out = new Map<string, InstructorNamesRow>();
  const unique = [...new Set(instructorIds.map((id) => id.trim()).filter((id) => id !== ""))];
  if (unique.length === 0) return out;

  const placeholders = unique.map(() => "?").join(", ");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.instructor_id, i.name_chi, i.name_eng
     FROM instructors i
     INNER JOIN (
       SELECT TRIM(instructor_id) AS tid, MIN(sequenceNumber) AS min_seq
       FROM instructors
       WHERE TRIM(instructor_id) IN (${placeholders})
       GROUP BY TRIM(instructor_id)
     ) AS x ON TRIM(i.instructor_id) = x.tid AND i.sequenceNumber = x.min_seq`,
    unique,
  );
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const row = r as RowDataPacket;
    const tid = trimOrEmpty(row.instructor_id);
    if (tid === "") continue;
    out.set(tid, {
      name_chi: trimOrEmpty(row.name_chi),
      name_eng: trimOrEmpty(row.name_eng),
    });
  }
  return out;
}

export async function selectInstructorDisplayNameByInstructorId(
  instructorId: string,
): Promise<string | null> {
  const row = await selectInstructorNamesByInstructorId(instructorId);
  if (row == null) return null;
  if (row.name_chi !== "") return row.name_chi;
  return row.name_eng !== "" ? row.name_eng : null;
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

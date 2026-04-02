import type { Pool, RowDataPacket } from "mysql2/promise";
import { MARKS_ORDER_BY_NEWEST } from "./studentAcademicsRepository.js";

export type CourseTranscriptLookupEntry = {
  eng_name: string;
  chi_name: string;
  units: number | null;
};

export type ClinicTranscriptRow = {
  name: string;
  code: string;
  course_title: string;
  units: number;
  hours: number;
  term: string;
  year: number;
  grade: string;
  grade2: unknown;
};

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function mapClinicRow(r: RowDataPacket): ClinicTranscriptRow {
  const row = r as Record<string, unknown>;
  const unitsRaw = Number(row.units);
  const hoursRaw = Number(row.hours);
  return {
    name: str(row.name),
    code: str(row.code),
    course_title: str(row.course_title),
    units: Number.isFinite(unitsRaw) ? unitsRaw : 0,
    hours: Number.isFinite(hoursRaw) ? hoursRaw : 0,
    term: str(row.term),
    year: Number(row.year),
    grade: str(row.grade),
    grade2: row.grade2,
  };
}

/**
 * Clinical / practice / portfolio transcript rows from legacy `clinic`.
 */
export async function listClinicRowsForStudent(
  pool: Pool,
  studentId: string,
): Promise<ClinicTranscriptRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name,
            TRIM(code) AS code,
            course_title,
            units,
            hours,
            TRIM(term) AS term,
            year,
            grade,
            grade2
     FROM clinic
     WHERE TRIM(id) = TRIM(?)
     ORDER BY ${MARKS_ORDER_BY_NEWEST}`,
    [studentId],
  );
  return rows.map(mapClinicRow);
}

/**
 * Map TRIM(course code) → English name and units for transcript title resolution.
 */
export async function loadCoursesTranscriptLookup(
  pool: Pool,
): Promise<Map<string, CourseTranscriptLookupEntry>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(code) AS code,
            eng_name,
            chi_name,
            units
     FROM courses`,
  );
  const map = new Map<string, CourseTranscriptLookupEntry>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const code = str(row.code);
    if (code === "") continue;
    const unitsRaw = Number(row.units);
    map.set(code, {
      eng_name: str(row.eng_name),
      chi_name: str(row.chi_name),
      units: Number.isFinite(unitsRaw) ? unitsRaw : null,
    });
  }
  return map;
}

import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import {
  listMarksForStudent,
  type MarksRow,
} from "../repositories/studentAcademicsRepository.js";
import type {
  StudentAcademicsAvailableTerm,
  StudentAcademicsResponse,
} from "../types/studentAcademics.js";

function formatMysqlTime(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const s = v.toISOString().slice(11, 19);
    return s.length > 0 ? s : null;
  }
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function nullableStr(s: string): string | null {
  return s.length > 0 ? s : null;
}

function numericGradeFromDb(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function transcriptGrade(grade: string): string | null {
  return grade.length > 0 ? grade : null;
}

function termsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Matches legacy `marks` ORDER BY term weight: Fall > Summer > Spring > Winter > other. */
function termSortOrder(term: string): number {
  switch (term.trim().toUpperCase()) {
    case "FALL":
      return 4;
    case "SUMMER":
      return 3;
    case "SPRING":
      return 2;
    case "WINTER":
      return 1;
    default:
      return 0;
  }
}

const MIN_TERM_YEAR = 1900;
const MAX_TERM_YEAR = 2100;

function buildAvailableTerms(rows: MarksRow[]): StudentAcademicsAvailableTerm[] {
  const byKey = new Map<string, { term: string; year: number }>();
  for (const r of rows) {
    const term = r.term.trim();
    const year = r.year;
    if (
      term.length === 0 ||
      !Number.isFinite(year) ||
      year < MIN_TERM_YEAR ||
      year > MAX_TERM_YEAR
    ) {
      continue;
    }
    const key = `${term.toLowerCase()}|${year}`;
    if (!byKey.has(key)) {
      byKey.set(key, { term, year });
    }
  }
  const list = [...byKey.values()];
  list.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return termSortOrder(b.term) - termSortOrder(a.term);
  });
  return list.map(({ term, year }) => ({
    term,
    year,
    label: `${term} ${year}`,
  }));
}

function buildPayload(
  studentId: string,
  rows: MarksRow[],
): StudentAcademicsResponse {
  if (rows.length === 0) {
    return {
      studentId,
      studentName: studentId,
      currentTerm: null,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
    };
  }

  const nameFromMarks = rows[0]!.name.trim();
  const studentName = nameFromMarks.length > 0 ? nameFromMarks : studentId;
  const latest = rows[0]!;
  const currentTerm = {
    term: latest.term,
    year: latest.year,
  };

  const currentSchedule = rows
    .filter(
      (r) => r.year === latest.year && termsMatch(r.term, latest.term),
    )
    .map((r) => ({
      courseCode: r.code,
      courseTitle: r.course_title,
      days: r.days,
      timeFrom: formatMysqlTime(r.time_from),
      timeTo: formatMysqlTime(r.time_to),
      instructor: nullableStr(r.instructor),
      term: r.term,
      year: r.year,
    }));

  const transcript = rows.map((r) => ({
    courseCode: r.code,
    courseTitle: r.course_title,
    term: r.term,
    year: r.year,
    grade: transcriptGrade(r.grade),
    numericGrade: numericGradeFromDb(r.grade2),
    credits: Number.isFinite(r.units) ? r.units : null,
  }));

  const enrollmentHistory = rows.map((r) => ({
    courseCode: r.code,
    courseTitle: r.course_title,
    term: r.term,
    year: r.year,
  }));

  return {
    studentId,
    studentName,
    currentTerm,
    availableTerms: buildAvailableTerms(rows),
    currentSchedule,
    transcript,
    enrollmentHistory,
  };
}

export async function getStudentAcademicsPayload(
  studentId: string,
): Promise<StudentAcademicsResponse> {
  const trimmed = studentId.trim();
  if (trimmed === "") {
    return {
      studentId: "",
      studentName: "",
      currentTerm: null,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
    };
  }

  if (trimmed === DEMO_STUDENT_ID) {
    return {
      studentId: trimmed,
      studentName: trimmed,
      currentTerm: null,
      availableTerms: [],
      currentSchedule: [],
      transcript: [],
      enrollmentHistory: [],
    };
  }

  const rows = await listMarksForStudent(pool, trimmed);
  return buildPayload(trimmed, rows);
}

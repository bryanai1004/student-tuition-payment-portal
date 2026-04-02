import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import {
  listClinicRowsForStudent,
  loadCoursesTranscriptLookup,
  type ClinicTranscriptRow,
  type CourseTranscriptLookupEntry,
} from "../repositories/studentTranscriptRepository.js";
import {
  listMarksForStudent,
  type MarksRow,
} from "../repositories/studentAcademicsRepository.js";
import type {
  StudentTranscriptAvailableTerm,
  StudentTranscriptPreviewResponse,
  StudentTranscriptRow,
} from "../types/studentTranscript.js";

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

/** Fall > Summer > Spring > Winter > other (matches legacy `marks` ordering). */
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

function buildAvailableTermsFromRows(
  rows: Pick<StudentTranscriptRow, "term" | "year">[],
): StudentTranscriptAvailableTerm[] {
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

function normalizeEnglishTitle(
  code: string,
  rawTitle: string,
  lookup: Map<string, CourseTranscriptLookupEntry>,
): string {
  const key = code.trim();
  if (key === "") return rawTitle.trim();
  const entry = lookup.get(key);
  const eng = entry?.eng_name?.trim();
  if (eng && eng.length > 0) return eng;
  return rawTitle.trim();
}

function rowFromMarks(
  r: MarksRow,
  lookup: Map<string, CourseTranscriptLookupEntry>,
): StudentTranscriptRow {
  return {
    courseCode: r.code,
    courseTitle: normalizeEnglishTitle(r.code, r.course_title, lookup),
    term: r.term,
    year: r.year,
    grade: transcriptGrade(r.grade),
    numericGrade: numericGradeFromDb(r.grade2),
    credits: Number.isFinite(r.units) ? r.units : null,
    source: "marks",
  };
}

function rowFromClinic(
  r: ClinicTranscriptRow,
  lookup: Map<string, CourseTranscriptLookupEntry>,
): StudentTranscriptRow {
  return {
    courseCode: r.code,
    courseTitle: normalizeEnglishTitle(r.code, r.course_title, lookup),
    term: r.term,
    year: r.year,
    grade: transcriptGrade(r.grade),
    numericGrade: numericGradeFromDb(r.grade2),
    credits: Number.isFinite(r.units) ? r.units : null,
    source: "clinic",
  };
}

function sortTranscriptRows(rows: StudentTranscriptRow[]): void {
  rows.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    const td = termSortOrder(b.term) - termSortOrder(a.term);
    if (td !== 0) return td;
    const c = a.courseCode.localeCompare(b.courseCode, undefined, {
      sensitivity: "base",
    });
    if (c !== 0) return c;
    if (a.source === b.source) return 0;
    return a.source === "marks" ? -1 : 1;
  });
}

function resolveStudentName(
  studentId: string,
  marksRows: MarksRow[],
  clinicRows: ClinicTranscriptRow[],
): string {
  const fromMarks = marksRows[0]?.name.trim() ?? "";
  if (fromMarks.length > 0) return fromMarks;
  const fromClinic = clinicRows[0]?.name.trim() ?? "";
  if (fromClinic.length > 0) return fromClinic;
  return studentId;
}

export async function getStudentTranscriptPreviewPayload(
  studentId: string,
): Promise<StudentTranscriptPreviewResponse> {
  const trimmed = studentId.trim();
  if (trimmed === "") {
    return {
      studentId: "",
      studentName: "",
      availableTerms: [],
      transcript: [],
    };
  }

  if (trimmed === DEMO_STUDENT_ID) {
    return {
      studentId: trimmed,
      studentName: trimmed,
      availableTerms: [],
      transcript: [],
    };
  }

  const [marksRows, clinicRows, courseLookup] = await Promise.all([
    listMarksForStudent(pool, trimmed),
    listClinicRowsForStudent(pool, trimmed),
    loadCoursesTranscriptLookup(pool),
  ]);

  const merged: StudentTranscriptRow[] = [
    ...marksRows.map((r) => rowFromMarks(r, courseLookup)),
    ...clinicRows.map((r) => rowFromClinic(r, courseLookup)),
  ];
  sortTranscriptRows(merged);

  return {
    studentId: trimmed,
    studentName: resolveStudentName(trimmed, marksRows, clinicRows),
    availableTerms: buildAvailableTermsFromRows(merged),
    transcript: merged,
  };
}

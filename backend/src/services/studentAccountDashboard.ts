import type { MarksRow } from "../repositories/studentAcademicsRepository.js";
import type {
  AccountCurrentTerm,
  AccountRegistration,
  ScheduleRow,
} from "../types/studentAccount.js";
import {
  buildAcademicCourseRecordsFromMarks,
  scheduleRowsFromAcademicCourseRecords,
} from "./studentAcademicCourseRecords.js";

export function quarterOrderForTerm(term: string): number {
  switch (term.trim().toUpperCase()) {
    case "WINTER":
      return 1;
    case "SPRING":
      return 2;
    case "SUMMER":
      return 3;
    case "FALL":
      return 4;
    default:
      return 0;
  }
}

function titleCaseTerm(term: string): string {
  const t = term.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function buildAccountCurrentTerm(
  term: string,
  year: number,
): AccountCurrentTerm {
  const t = term.trim();
  const y = Math.trunc(Number(year));
  const safeYear = Number.isFinite(y) ? y : 0;
  const cap = titleCaseTerm(t);
  const q = quarterOrderForTerm(t);
  return {
    term: t,
    year: safeYear,
    label: cap && safeYear ? `${cap} ${safeYear}` : cap || String(safeYear || ""),
    ...(q > 0 ? { quarterOrder: q } : {}),
  };
}

function sumScheduleUnits(rows: ScheduleRow[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    if (r.units != null && Number.isFinite(r.units)) {
      sum += r.units;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : null;
}

export function deriveAccountRegistration(args: {
  scheduleRows: ScheduleRow[];
  enrollmentSourceCount: number;
  termLabel: string;
}): AccountRegistration {
  const { scheduleRows, enrollmentSourceCount, termLabel } = args;
  if (scheduleRows.length > 0) {
    return {
      status: "registered",
      hasActiveCourses: true,
      courseCount: scheduleRows.length,
      totalUnits: sumScheduleUnits(scheduleRows),
    };
  }
  if (enrollmentSourceCount > 0) {
    return {
      status: "unknown",
      hasActiveCourses: false,
      courseCount: 0,
      totalUnits: null,
      emptyReason:
        "Course details could not be loaded for your enrollments for this term.",
    };
  }
  return {
    status: "not_registered",
    hasActiveCourses: false,
    courseCount: 0,
    totalUnits: null,
    emptyReason: termLabel
      ? `No courses registered for ${termLabel}.`
      : "No courses registered for the current term.",
  };
}

/**
 * Legacy account schedule lines from `marks` for the billing term.
 * Uses the same normalized academic course record mapping as `/academics`.
 */
export function scheduleRowsFromLegacyMarks(
  marks: MarksRow[],
  studentId: string,
): ScheduleRow[] {
  if (marks.length === 0) return [];
  const records = buildAcademicCourseRecordsFromMarks(
    studentId.trim(),
    marks,
  );
  return scheduleRowsFromAcademicCourseRecords(records);
}

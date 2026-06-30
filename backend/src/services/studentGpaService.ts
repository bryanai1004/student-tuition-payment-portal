import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import { termSortOrder } from "./studentAcademicCourseRecords.js";
import {
  getCourseEquivalencyIndex,
  normalizeCourseCode,
  type CourseEquivalencyIndex,
} from "./courseEquivalencyService.js";
import { loadUnifiedStudentAcademicContext } from "./studentUnifiedAcademicRecordsService.js";

export type StudentGpaResponse = {
  studentId: string;
  /** Cumulative GPA from completed marks rows only (excludes P/W/AUD/T). */
  cumulativeGpa: number | null;
  /** Latest term/year with GPA-eligible completed marks rows. */
  latestTermGpa: number | null;
  latestTerm: string | null;
  latestYear: number | null;
  /** Sum of credits on completed marks rows (latest attempt per course). */
  completedCredits: number;
  /** Sum of credits on active marks + portal rows (current registrations). */
  attemptedCreditsIncludingInProgress: number;
  notes: string[];
};

type MarksCompletedAttempt = StudentAcademicCourseRecord & {
  source: "marks";
  status: "completed";
};

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizedLetterGrade(grade: string | null | undefined): string | null {
  const value = grade?.trim();
  return value ? value.toUpperCase() : null;
}

const GPA_EXCLUDED_GRADES = new Set(["P", "W", "AUD", "T"]);

function isMarksCompletedAttempt(
  record: StudentAcademicCourseRecord,
): record is MarksCompletedAttempt {
  return record.source === "marks" && record.status === "completed";
}

function compareAttemptsDesc(a: MarksCompletedAttempt, b: MarksCompletedAttempt): number {
  if (b.year !== a.year) return b.year - a.year;
  const termDiff = termSortOrder(b.term) - termSortOrder(a.term);
  if (termDiff !== 0) return termDiff;
  const aNumeric = a.numericGrade ?? Number.NEGATIVE_INFINITY;
  const bNumeric = b.numericGrade ?? Number.NEGATIVE_INFINITY;
  return bNumeric - aNumeric;
}

function pickLatestCompletedMarksAttempts(
  records: StudentAcademicCourseRecord[],
  equiv: CourseEquivalencyIndex,
): Map<string, MarksCompletedAttempt> {
  const completed = records.filter(isMarksCompletedAttempt).sort(compareAttemptsDesc);
  const byCourseCode = new Map<string, MarksCompletedAttempt>();
  for (const attempt of completed) {
    const courseCode = equiv.resolveCanonical(normalizeCourseCode(attempt.courseCode));
    if (!byCourseCode.has(courseCode)) {
      byCourseCode.set(courseCode, attempt);
    }
  }
  return byCourseCode;
}

export function computeCumulativeGpaFromAttempts(
  attempts: Iterable<MarksCompletedAttempt>,
): number | null {
  let gradePoints = 0;
  let gpaEligibleUnits = 0;

  for (const attempt of attempts) {
    const grade = normalizedLetterGrade(attempt.grade);
    const credits = attempt.credits;
    const numericGrade = attempt.numericGrade;
    if (
      credits == null ||
      !Number.isFinite(credits) ||
      numericGrade == null ||
      !Number.isFinite(numericGrade)
    ) {
      continue;
    }
    if (grade != null && GPA_EXCLUDED_GRADES.has(grade)) continue;
    gradePoints += numericGrade * credits;
    gpaEligibleUnits += credits;
  }

  if (gpaEligibleUnits <= 0) return null;
  return roundTwo(gradePoints / gpaEligibleUnits);
}

function computeTermGpaForRecords(
  rows: MarksCompletedAttempt[],
): { termGpa: number | null; term: string; year: number } | null {
  if (rows.length === 0) return null;
  const term = rows[0]!.term;
  const year = rows[0]!.year;
  const gpa = computeCumulativeGpaFromAttempts(rows);
  return { termGpa: gpa, term, year };
}

function sumCompletedCredits(attempts: Iterable<MarksCompletedAttempt>): number {
  let total = 0;
  for (const attempt of attempts) {
    if (attempt.credits != null && Number.isFinite(attempt.credits)) {
      total += attempt.credits;
    }
  }
  return roundTwo(total);
}

function sumInProgressCredits(
  records: StudentAcademicCourseRecord[],
  equiv: CourseEquivalencyIndex,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const r of records) {
    if (r.status !== "active") continue;
    if (r.source === "clinic") continue;
    const cr = r.credits;
    if (cr == null || !Number.isFinite(cr) || cr <= 0) continue;
    const key =
      r.source === "portal"
        ? `portal:${r.portalEnrollmentRowId ?? equiv.resolveCanonical(normalizeCourseCode(r.courseCode))}|${r.term}|${r.year}`
        : `marks:${equiv.resolveCanonical(normalizeCourseCode(r.courseCode))}|${r.term}|${r.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += cr;
  }
  return roundTwo(total);
}

export function buildStudentGpaPayload(
  studentId: string,
  courseRecords: StudentAcademicCourseRecord[],
  equiv: CourseEquivalencyIndex,
): StudentGpaResponse {
  const latestAttempts = pickLatestCompletedMarksAttempts(courseRecords, equiv);
  const cumulativeGpa = computeCumulativeGpaFromAttempts(latestAttempts.values());
  const completedCredits = sumCompletedCredits(latestAttempts.values());

  const byTerm = new Map<string, MarksCompletedAttempt[]>();
  for (const attempt of latestAttempts.values()) {
    const key = `${attempt.year}\t${attempt.term}`;
    const list = byTerm.get(key) ?? [];
    list.push(attempt);
    byTerm.set(key, list);
  }

  let latestTermGpa: number | null = null;
  let latestTerm: string | null = null;
  let latestYear: number | null = null;
  let bestRank = -1;
  for (const group of byTerm.values()) {
    const sample = group[0]!;
    const rank = sample.year * 10 + termSortOrder(sample.term);
    if (rank > bestRank) {
      bestRank = rank;
      const termResult = computeTermGpaForRecords(group);
      if (termResult != null) {
        latestTermGpa = termResult.termGpa;
        latestTerm = termResult.term;
        latestYear = termResult.year;
      }
    }
  }

  const inProgress = sumInProgressCredits(courseRecords, equiv);
  const attemptedCreditsIncludingInProgress = roundTwo(completedCredits + inProgress);

  return {
    studentId,
    cumulativeGpa,
    latestTermGpa,
    latestTerm,
    latestYear,
    completedCredits,
    attemptedCreditsIncludingInProgress,
    notes: [
      "GPA includes completed legacy marks rows only; portal registrations without posted grades are excluded.",
      "Pass (P), withdraw (W), audit (AUD), and transfer (T) grades are excluded from GPA.",
    ],
  };
}

export async function getStudentGpaPayload(
  studentId: string,
): Promise<StudentGpaResponse | null> {
  const [ctx, equiv] = await Promise.all([
    loadUnifiedStudentAcademicContext(studentId),
    getCourseEquivalencyIndex(),
  ]);
  if (ctx == null) return null;
  return buildStudentGpaPayload(ctx.studentId, ctx.courseRecords, equiv);
}

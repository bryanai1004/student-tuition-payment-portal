/**
 * Canonical domain shapes for student registration, academic attempts, transcript display, degree audit, and clinical progress.
 *
 * ## Source of truth (read path)
 *
 * - **AcademicAttempt** — legacy `marks` (primary didactic outcomes); legacy `clinic` rows may appear as
 *   attempts for **transcript display only**. Clinic rows must not be folded into **earned academic units**
 *   for degree audit (use `attemptsFromMarks` only in {@link computeDegreeAudit}).
 * - **RegistrationRecord** — `portal_enrollments` + `course_sections` (and catalog titles); not a `marks` grade outcome.
 * - **DegreeAudit** — program `requirements` (with fallbacks when null) plus **cleaned** marks-based attempts;
 *   clinic hours are tracked separately from academic units (never merge clinical hours into academic units here).
 * - **TranscriptRecord** — presentation-only history (sorted, normalized titles). **Not** authoritative for
 *   registration state or degree progress; transcript services must not compute degree progress.
 * - **ClinicalProgress** — `clinic` + `requirements.clinic_hours`; independent of {@link AcademicAttempt}.
 */

import type {
  StudentAcademicCourseRecord,
  StudentAcademicCourseStatus,
} from "../types/studentAcademics.js";
import type { ClinicalProgress as AccountClinicalProgress } from "../types/studentAccount.js";
import type { StudentTranscriptRow } from "../types/studentTranscript.js";

/**
 * Clinic-related progress (hours, levels, readiness). Same shape as the account payload field; canonical domain name.
 * Do not derive this from {@link AcademicAttempt} or transcript merge logic.
 */
export type ClinicalProgress = AccountClinicalProgress;

/**
 * @deprecated Use {@link ClinicalProgress}. Kept for existing imports.
 */
export type ClinicalProgressDomain = ClinicalProgress;

/** Student enrollment action in the portal: `portal_enrollments` + `course_sections` (plus resolved title). */
export type RegistrationRecord = {
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  units: number | null;
  weekday: string | null;
  startTime: unknown;
  endTime: unknown;
  instructor: string | null;
};

/**
 * One course result attempt. Multiple attempts per course code are allowed.
 * May include non-final or non-credit outcomes (AUD, NP, empty grade) — does **not** imply earned units.
 */
export type AcademicAttempt = {
  studentId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  credits: number | null;
  grade: string | null;
  numericGrade: number | null;
  status: StudentAcademicCourseStatus;
  source: "marks" | "clinic";
};

/**
 * Display-ready academic history line (derived from attempts; same shape as `StudentTranscriptRow`).
 * **Not** the source of truth for degree progress or official registration.
 */
export type TranscriptRecord = StudentTranscriptRow;

export type DegreeAuditComputedStatus =
  | "unknown"
  | "in_progress"
  | "satisfied"
  | "deficient";

/** Aggregated graduation progress (computed layer — not read from transcript rows or transcript services). */
export type DegreeAudit = {
  requiredAcademicUnits: number;
  /** CLEANED: earned academic units from eligible `marks` attempts only (see {@link computeDegreeAudit} TODO). */
  earnedAcademicUnits: number;
  requiredClinicHours: number;
  /** Placeholder for now; wire from clinical completion rules separately from academic units. */
  earnedClinicHours: number;
  /** Official row: legacy `students.status`. */
  officialStatus: string;
  /** Derived from requirements + cleaned attempts + clinic placeholders — not `transcript` JSON. */
  computedStatus: DegreeAuditComputedStatus;
};

export type ComputeDegreeAuditInput = {
  /** Marks table only — never use `clinic` transcript rows as academic unit credit here. */
  attemptsFromMarks: AcademicAttempt[];
  /** From `requirements` (caller applies fallback when null). */
  requiredAcademicUnits: number;
  requiredClinicHours: number;
  earnedClinicHours: number;
  officialStudentStatus: string;
};

export function isAcademicAttemptRow(
  r: StudentAcademicCourseRecord,
): r is StudentAcademicCourseRecord & { source: "marks" | "clinic" } {
  return r.source === "marks" || r.source === "clinic";
}

export function isRegistrationPortalRow(
  r: StudentAcademicCourseRecord,
): r is StudentAcademicCourseRecord & { source: "portal" } {
  return r.source === "portal";
}

/** Narrows a transport row to {@link AcademicAttempt} when `source` is `marks` or `clinic`. */
export function academicCourseRecordToAcademicAttempt(
  r: StudentAcademicCourseRecord,
): AcademicAttempt | null {
  if (!isAcademicAttemptRow(r)) return null;
  return {
    studentId: r.studentId,
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    term: r.term,
    year: r.year,
    credits: r.credits,
    grade: r.grade,
    numericGrade: r.numericGrade,
    status: r.status,
    source: r.source,
  };
}

/**
 * Skeleton for future degree audit. Transcript and preview services must **not** embed this logic.
 *
 * TODO:
 * - Dedupe attempts by course code.
 * - Exclude AUD / NP / null grades from earned academic units.
 * - Sum earned units from eligible marks attempts only.
 * - Fallback requirements when the `requirements` row is missing or incomplete.
 *
 * @remarks Hard rules: do not treat transcript as source of truth; do not merge clinical hours into academic units.
 */
export function computeDegreeAudit(input: ComputeDegreeAuditInput): DegreeAudit {
  return {
    requiredAcademicUnits: input.requiredAcademicUnits,
    earnedAcademicUnits: 0,
    requiredClinicHours: input.requiredClinicHours,
    earnedClinicHours: input.earnedClinicHours,
    officialStatus: input.officialStudentStatus,
    computedStatus: "unknown",
  };
}

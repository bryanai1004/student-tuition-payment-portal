/**
 * Canonical domain shapes for student academics, registration, transcript display, degree audit, and clinical progress.
 *
 * ## Source of truth (read path)
 *
 * - **AcademicAttempt** — legacy `marks` (primary didactic outcomes); legacy `clinic` rows may appear as
 *   attempts for **transcript display only**. Clinic rows must not be folded into **earned academic units**
 *   for degree audit (use `attemptsFromMarks` only in {@link computeDegreeAudit}).
 * - **RegistrationRecord** — `portal_enrollments` joined to catalog + one deterministic `course_sections` row
 *   per course/term/year (see `listPortalEnrollmentRowsForStudentAcademics`).
 * - **DegreeAudit** — program `requirements` (with fallbacks when null) plus **cleaned** marks-based attempts;
 *   clinic hours are tracked separately from academic units.
 * - **TranscriptRecord** — presentation-only history (sorted, normalized titles). Not authoritative for
 *   registration state or degree progress.
 * - **ClinicalProgressDomain** — `clinic` + `requirements.clinic_hours`; independent of {@link AcademicAttempt}.
 */

import type {
  StudentAcademicCourseRecord,
  StudentAcademicCourseStatus,
} from "../types/studentAcademics.js";
import type { ClinicalProgress } from "../types/studentAccount.js";

/** Portal registration + section schedule metadata (sources: `portal_enrollments`, `portal_courses`, `course_sections`). */
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
 * Display-ready academic history line (derived from attempts + optional portal rows for UI consistency).
 * **Not** the source of truth for degree progress or official registration.
 */
export type TranscriptRecord = {
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  grade: string | null;
  numericGrade: number | null;
  credits: number | null;
  source: "marks" | "clinic" | "portal";
};

export type DegreeAuditComputedStatus =
  | "unknown"
  | "in_progress"
  | "satisfied"
  | "deficient";

/** Aggregated graduation progress (computed layer — not read directly from transcript rows). */
export type DegreeAudit = {
  requiredAcademicUnits: number;
  /** Earned academic units from **cleaned** marks attempts only (see computeDegreeAudit TODO). */
  earnedAcademicUnits: number;
  requiredClinicHours: number;
  /** Placeholder until clinic completion is unified with audit rules. */
  earnedClinicHours: number;
  /** From legacy `students.status`. */
  officialStatus: string;
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

/**
 * Clinic ladder + hours vs `requirements.clinic_hours`. Built from `clinic` — **not** from {@link AcademicAttempt}.
 */
export type ClinicalProgressDomain = ClinicalProgress;

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

/**
 * Skeleton for future degree audit. Transcript and preview services must **not** embed this logic.
 *
 * TODO:
 * - Dedupe attempts by course code (pick best / latest per program rules).
 * - Exclude AUD / NP / null grades from earned academic units.
 * - Sum earned units from eligible marks attempts only.
 * - Apply fallback requirements when `requirements` row is missing.
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

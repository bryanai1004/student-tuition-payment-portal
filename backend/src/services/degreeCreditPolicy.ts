/**
 * Single place documenting **which academic rows count toward degree credit math**
 * used by {@link evaluateGraduation} and {@link getStudentProgramProgressPayload}.
 *
 * Implementation stays in existing services; this module is the contract + shared helpers.
 */
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";

/** Marks attempts that count as a finalized completion for graduation earned credits. */
export function isGraduationEarnedMarksAttempt(
  r: StudentAcademicCourseRecord,
): r is StudentAcademicCourseRecord & { source: "marks"; status: "completed" } {
  return r.source === "marks" && r.status === "completed";
}

/**
 * Transcript preview rows that contribute to **bucket completed** totals:
 * `status === "completed"` and positive numeric credits, with per-source dedupe rules
 * enforced in `programProgressService` (`sumCatalogEarnedFromTranscript`).
 */
export const DEGREE_CREDIT_POLICY_SUMMARY =
  "Completed credits: latest passing marks attempt per course code (plus transfer/admission credits on the student profile for the graduation total only). In-progress: active marks and portal registrations with positive credits. Withdrawn portal enrollments (grade W, status withdrawn) are excluded from earned and in-progress credit totals but remain on the academic record. Non-final grades (IP, INC, I) stay in progress until replaced by a final grade.";
/**
 * Course withdrawal rules for portal enrollments (student Academics + POST /api/student/withdraw).
 *
 * Implementation: {@link assertPortalWithdrawalAllowed}, {@link softWithdrawPortalEnrollmentByCourseSection},
 * {@link portalEnrollmentRowToAcademicCourseRecord} (grade W), {@link removeAdminPortalEnrollment}.
 */

/** Portal row statuses that may be soft-withdrawn (not completed / not already withdrawn). */
export const WITHDRAWABLE_PORTAL_STATUSES = [
  "active",
  "enrolled",
  "registered",
] as const;

/** Grade stored on unofficial academics / transcript for withdrawn portal rows. */
export const WITHDRAWAL_TRANSCRIPT_GRADE = "W" as const;

/** Academic record status after withdrawal (row retained; not deleted). */
export const WITHDRAWAL_ACADEMIC_STATUS = "withdrawn" as const;

export const COURSE_WITHDRAWAL_POLICY_SUMMARY = [
  "Eligibility: enrollment must be active, enrolled, or registered; not completed; not already withdrawn; academic term withdraw_deadline (if set) must be today or later.",
  "Grading: unofficial records show grade W and status Withdrawn; the portal_enrollments row is kept (soft withdraw with withdrawn_at).",
  "Credits: withdrawn courses do not count toward earned program progress; they remain visible on registration history and transcript.",
  "Schedule: withdrawn courses are excluded from the active timetable / account enrollment list (status active only).",
  "Deletion: students and staff use withdraw only — no hard DELETE of enrollment rows on this path.",
].join(" ");

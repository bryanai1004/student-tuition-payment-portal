/**
 * GET /api/students/:studentId/academics — legacy `marks` + merged `portal_enrollments`.
 *
 * Domain: `transcript` is the **merged** unofficial transcript slice (marks attempts plus portal rows,
 * including withdrawn portal rows with grade W). Portal rows are omitted when legacy marks already show
 * a completed grade for the same course/term (`legacyCompletedBlocksPortalRow`). `enrollmentHistory` is the
 * same merge as timeline rows — the JSON key is historical; see {@link CombinedAcademicHistoryItem}.
 */

/** Deterministic row status from legacy `marks` (and merged transcript uses the same for `marks`/`clinic`). */
export type StudentAcademicCourseStatus =
  | "active"
  | "completed"
  | "withdrawn"
  /** Reserved for a future legacy signal; not emitted without a reliable column/value. */
  | "dropped"
  | "unknown";

/**
 * Normalized row for API assembly: **marks** / **clinic** attempts (`source`) or **portal** registration (`source: "portal"`).
 * Finer domain shapes: `AcademicAttempt` and `RegistrationRecord` in `domain/studentDomainModels.ts`.
 */
export type StudentAcademicCourseRecord = {
  studentId: string;
  registrationId?: number;
  sectionId?: number | null;
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  academicTermId?: string | null;
  withdrawDeadline?: string | null;
  canWithdraw?: boolean;
  credits: number | null;
  instructor: string | null;
  days: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  grade: string | null;
  numericGrade: number | null;
  status: StudentAcademicCourseStatus;
  /** `portal` = `portal_enrollments` registration rows (no fabricated grades). */
  source: "marks" | "clinic" | "portal";
  /** Set for `source: "portal"` when enrollment is section-keyed (or stored on the row). */
  sectionCode?: string | null;
  scheduleTrack?: string | null;
  /** Stable ordering when the same course appears in multiple portal sections. */
  portalEnrollmentRowId?: number;
};

export type StudentAcademicsCurrentTerm = {
  term: string;
  year: number;
};

export type StudentAcademicsAvailableTerm = {
  term: string;
  year: number;
  label: string;
};

export type StudentAcademicsScheduleItem = {
  courseCode: string;
  courseTitle: string;
  days: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  instructor: string | null;
  term: string;
  year: number;
  credits: number | null;
  status: StudentAcademicCourseStatus;
};

export type StudentAcademicsTranscriptItem = {
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  grade: string | null;
  numericGrade: number | null;
  /** Credit / unit hours from legacy `marks.units` when present. */
  credits: number | null;
};

export type StudentAcademicsEnrollmentItem = {
  registrationId?: number;
  sectionId?: number | null;
  sectionCode?: string | null;
  courseCode: string;
  displayedCourseTitle?: string;
  courseTitle: string;
  term: string;
  year: number;
  academicTermId?: string | null;
  withdrawDeadline?: string | null;
  scheduleTrack?: string | null;
  canWithdraw?: boolean;
  credits: number | null;
  grade: string | null;
  status: StudentAcademicCourseStatus;
  instructor: string | null;
  /** True only for `completed`; reserved for future course feedback. */
  feedbackEligible: boolean;
  /** True when a row exists in `course_feedback` for this enrollment key. */
  feedbackSubmitted: boolean;
  /** ISO-8601 timestamp of submission, when `feedbackSubmitted` is true. */
  feedbackSubmittedAt: string | null;
};

/**
 * Semantically: merged **registration** (portal) + **academic attempts** (marks). Same shape as
 * {@link StudentAcademicsEnrollmentItem}; aliased so call sites can name the concept without the legacy
 * response field name.
 */
export type CombinedAcademicHistoryItem = StudentAcademicsEnrollmentItem;

export type StudentAcademicsResponse = {
  studentId: string;
  studentName: string;
  currentTerm: StudentAcademicsCurrentTerm | null;
  availableTerms: StudentAcademicsAvailableTerm[];
  currentSchedule: StudentAcademicsScheduleItem[];
  /** Unofficial transcript lines: merged `marks` + `portal` (incl. W on withdrawn portal rows). */
  transcript: StudentAcademicsTranscriptItem[];
  /**
   * Combined portal registration rows + marks attempts (sorted with transcript preview ordering).
   * JSON key remains `enrollmentHistory` for clients; value type is {@link CombinedAcademicHistoryItem}.
   */
  enrollmentHistory: CombinedAcademicHistoryItem[];
  /**
   * Union of marks-derived attempts and portal registration rows (`source` discriminates).
   * Not to be confused with registration-only or transcript-authoritative data.
   */
  courseRecords: StudentAcademicCourseRecord[];
};






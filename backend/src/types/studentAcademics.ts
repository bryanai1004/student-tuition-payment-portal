/** GET /api/students/:studentId/academics — Phase 1, sourced from legacy `marks` only. */

/** Deterministic row status from legacy `marks` (and merged transcript uses the same for `marks`/`clinic`). */
export type StudentAcademicCourseStatus =
  | "active"
  | "completed"
  | "withdrawn"
  /** Reserved for a future legacy signal; not emitted without a reliable column/value. */
  | "dropped"
  | "unknown";

/** One normalized student course row — single source for schedule, transcript, enrollment, and future feedback eligibility. */
export type StudentAcademicCourseRecord = {
  studentId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  credits: number | null;
  instructor: string | null;
  days: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  grade: string | null;
  numericGrade: number | null;
  status: StudentAcademicCourseStatus;
  source: "marks" | "clinic";
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
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  credits: number | null;
  grade: string | null;
  status: StudentAcademicCourseStatus;
  instructor: string | null;
  /** True only for `completed`; reserved for future course feedback. */
  feedbackEligible: boolean;
  /** True when a row exists in `student_course_feedback` for this enrollment key. */
  feedbackSubmitted: boolean;
  /** ISO-8601 timestamp of submission, when `feedbackSubmitted` is true. */
  feedbackSubmittedAt: string | null;
};

export type StudentAcademicsResponse = {
  studentId: string;
  studentName: string;
  currentTerm: StudentAcademicsCurrentTerm | null;
  availableTerms: StudentAcademicsAvailableTerm[];
  currentSchedule: StudentAcademicsScheduleItem[];
  transcript: StudentAcademicsTranscriptItem[];
  enrollmentHistory: StudentAcademicsEnrollmentItem[];
  /** Full normalized rows (marks-only for this endpoint); derived lists above are views of this array. */
  courseRecords: StudentAcademicCourseRecord[];
};






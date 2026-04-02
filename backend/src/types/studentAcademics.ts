/** GET /api/students/:studentId/academics — Phase 1, sourced from legacy `marks` only. */

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
};

export type StudentAcademicsResponse = {
  studentId: string;
  studentName: string;
  currentTerm: StudentAcademicsCurrentTerm | null;
  availableTerms: StudentAcademicsAvailableTerm[];
  currentSchedule: StudentAcademicsScheduleItem[];
  transcript: StudentAcademicsTranscriptItem[];
  enrollmentHistory: StudentAcademicsEnrollmentItem[];
};

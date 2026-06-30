/**
 * GET /api/students/:studentId/transcript-preview — unified marks + portal + clinic (same merge as /academics).
 */

import type { StudentAcademicCourseStatus } from "./studentAcademics.js";

export type StudentTranscriptAvailableTerm = {
  term: string;
  year: number;
  label: string;
};

export type StudentTranscriptRow = {
  courseCode: string;
  courseTitle: string;
  term: string;
  year: number;
  grade: string | null;
  numericGrade: number | null;
  credits: number | null;
  source: "marks" | "clinic" | "portal";
  /** Present when rows are built via unified academic course records (same semantics as academics API). */
  status?: StudentAcademicCourseStatus;
  /** True only when `status === "completed"`; feedback UI not implemented yet. */
  feedbackEligible?: boolean;
};

export type StudentTranscriptPreviewResponse = {
  studentId: string;
  studentName: string;
  availableTerms: StudentTranscriptAvailableTerm[];
  transcript: StudentTranscriptRow[];
};

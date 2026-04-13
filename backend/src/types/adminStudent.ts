import type { ClinicalProgress } from "./studentAccount.js";
import type { StudentProgram } from "./studentProgram.js";

/**
 * Clinical roster columns for GET /api/admin/students?clinicalSummary=1.
 * Derived from the same `buildClinicalProgress` pipeline as admin student detail.
 */
export type AdminStudentClinicalProgressSummary = {
  level: number;
  completedHours: number;
  requiredHours: number;
  readiness: ClinicalProgress["readiness"];
  missingCount: number;
  /** Brief text (first missing items) for table cells. */
  missingSummary: string | null;
};

/** GET /api/admin/students — normalized roster row for the admin Students table. */
export type AdminStudentListItem = {
  studentId: string;
  division: "Chinese" | "English" | "Unknown";
  name: string;
  email: string | null;
  program: StudentProgram;
  requirementsId: string | null;
  highestDegree: string | null;
  backgroundSchool: string | null;
  signedDate: string | null;
  enrollStartDate: string | null;
  resolvedEntryDate: string | null;
  entryYear: number | null;
  latestRegistrationTerm: string | null;
  /** Present when the list is requested with `clinicalSummary=1`. */
  clinicalProgressSummary?: AdminStudentClinicalProgressSummary;
};

/** Temporary `/api/admin/students` roster filter only. */
export type AdminStudentRosterProgramFilter = "all" | "dahm" | "mahm";

/**
 * GET /api/admin/students — paginated roster payload (`items` is one page only).
 * Query: `page`, `pageSize`, `search`, optional `clinicalSummary`.
 */
export type AdminStudentListPageResponse = {
  items: AdminStudentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** GET /api/admin/students/:studentId — full admin read model. */
export type AdminStudentDetail = {
  studentId: string;
  division: "Chinese" | "English" | "Unknown";
  name: string;
  email: string | null;
  program: StudentProgram;
  requirementsId: string | null;
  highestDegree: string | null;
  backgroundSchool: string | null;
  gender: string | null;
  signedDate: string | null;
  enrollStartDate: string | null;
  resolvedEntryDate: string | null;
  entryYear: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latestRegistrationTerm: string | null;
  /** Same shape as student account `clinicalProgress` (legacy clinic + requirements). */
  clinicalProgress?: ClinicalProgress;
};

/** PUT /api/admin/students/:studentId — editable legacy master fields only. */
export type AdminStudentUpdateBody = {
  name: string;
  program: StudentProgram;
  email: string | null;
  gender: string | null;
  backgroundSchool: string | null;
  highestDegree: string | null;
  requirementsId: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  signedDate: string | null;
  enrollStartDate: string | null;
};

export type AdminDivision = "Chinese" | "English";

/** POST /api/admin/students — create legacy student + password row. */
export type AdminStudentCreateBody = {
  division: AdminDivision;
  /** ISO calendar date `YYYY-MM-DD`; year and month drive student id bucket. */
  entryDate: string;
  name: string;
  program: StudentProgram;
  email?: string | null;
  gender?: string | null;
  requirementsId?: number | null;
  highestDegree?: string | null;
  backgroundSchool?: string | null;
  signedDate?: string | null;
  enrollStartDate?: string | null;
  address?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  initialPassword: string;
};

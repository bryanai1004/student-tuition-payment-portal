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
    status: string | null;
    program: StudentProgram;
    trackCode: "C" | "E" | null;
    trackLabel: "Chinese" | "English" | null;
    requirementsId: string | null;
    highestDegree: string | null;
    backgroundSchool: string | null;
    signedDate: string | null;
    enrollStartDate: string | null;
    resolvedEntryDate: string | null;
    /** Derived from student id characters 2-3 (for enrollment filtering). */
    entryYear: number | null;
    intakeCode: string | null;
    intakeLabel: string | null;
    latestRegistrationTerm: string | null;
    /** Present when the list is requested with `clinicalSummary=1`. */
    clinicalProgressSummary?: AdminStudentClinicalProgressSummary;
};
/** Temporary `/api/admin/students` roster filter only. */
export type AdminStudentRosterProgramFilter = "all" | "dahm" | "mahm";
export type AdminStudentRosterTrackFilter = "all" | "C" | "E";
export type AdminStudentRosterLoaFilter = "all" | "yes" | "no";
export type AdminStudentLoaTermOption = {
    quarter: "Winter" | "Spring" | "Summer" | "Fall";
    year: number;
    label: string;
};
export type AdminStudentEnrollmentFilterOptions = {
    years: string[];
    intakes: Array<{
        code: string;
        label: string;
    }>;
    loaTerms: AdminStudentLoaTermOption[];
};
export type AdminStudentLoaSummary = {
    hasLoa: boolean;
    loaTerm: string | null;
    plannedReturnTerm: string | null;
    reason: string | null;
};
/**
 * GET /api/admin/students — paginated roster payload (`items` is one page only).
 * Query: `page`, `pageSize`, `search`, optional `clinicalSummary`.
 */
export type AdminStudentListPageResponse = {
    items: AdminStudentListItem[];
    total: number;
    page: number;
    pageSize: number;
    enrollmentFilterOptions: AdminStudentEnrollmentFilterOptions;
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
    ssn: string | null;
    visa: string | null;
    dob: string | null;
    phone1: string | null;
    phone2: string | null;
    phone3: string | null;
    citizenship: string | null;
    race: string | null;
    marital: string | null;
    latestRegistrationTerm: string | null;
    loaSummary: AdminStudentLoaSummary;
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
    ssn: string | null;
    visa: string | null;
    dob: string | null;
    phone1: string | null;
    phone2: string | null;
    phone3: string | null;
    citizenship: string | null;
    race: string | null;
    marital: string | null;
};
/** POST /api/admin/students/:studentId/loa — create one legacy `loa` row. */
export type AdminStudentCreateLoaBody = {
    loaQuarter: string;
    loaYear: string;
    plannedReturnQuarter: string;
    plannedReturnYear: string;
    reason: string | null;
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
//# sourceMappingURL=adminStudent.d.ts.map
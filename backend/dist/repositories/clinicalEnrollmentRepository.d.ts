import type { PoolConnection } from "mysql2/promise";
/** Sum of legacy level caps on `clinic_timetable` (100/200/300/123 Max). */
export declare function totalClinicTimetableCapacityCaps(row: {
    cap_100: number;
    cap_200: number;
    cap_300: number;
    cap_123: number;
}): number;
export type ClinicalEnrollmentSlotRow = {
    timetableId: number;
    term: string;
    year: number;
    slotLabel: string;
    faculty: string | null;
    site: string | null;
    /** Total seats from legacy caps; `null` when summed caps are zero (treat as uncapped for display). */
    capacity: number | null;
    enrolledCount: number;
    /** Seats left when capped; `null` when uncapped. */
    remainingSeats: number | null;
};
export type ClinicalEnrollmentStudentRow = {
    id: number;
    studentId: string;
    timetableId: number;
    term: string;
    year: number;
    status: string;
    slotLabel: string;
    faculty: string | null;
    site: string | null;
    createdAt: string;
};
/** Slot roster row for admin (active = not `dropped`; remove uses student drop when `enrolled`). */
export type ClinicalSlotRosterAdminRow = {
    enrollmentId: number;
    studentId: string;
    studentName: string;
    email: string | null;
    status: string;
    createdAt: string;
};
/**
 * Open slots from `clinic_timetable` with enrollment counts from `clinical_enrollments` (status enrolled).
 */
export declare function listAvailableClinicalEnrollmentSlots(options?: {
    year?: number | null;
    term?: string | null;
}): Promise<ClinicalEnrollmentSlotRow[]>;
/**
 * Distinct term/year pairs for any `clinical_enrollments` row for this student (any status).
 * Used so the Finance quarter picker includes terms where a clinical slot charge may exist.
 */
export declare function listClinicalFinanceQuarterHintsForStudent(studentId: string): Promise<{
    term: string;
    year: number;
}[]>;
export declare function listStudentClinicalEnrollments(studentId: string, options?: {
    term?: string | null;
    year?: number | null;
}): Promise<ClinicalEnrollmentStudentRow[]>;
/**
 * Students with a non-dropped enrollment on this timetable slot (admin roster).
 * Joins legacy `students` for display name and email.
 */
export declare function listActiveClinicalRosterForTimetable(timetableId: number): Promise<ClinicalSlotRosterAdminRow[]>;
export declare function getClinicalEnrollmentSlotBinding(enrollmentId: number, studentId: string): Promise<{
    timetableId: number;
    status: string;
} | null>;
export type ClinicalEnrollmentLockRow = {
    id: number;
    status: string;
};
/**
 * Locks the student's enrollment row for this slot (if any) for update.
 */
export declare function lockStudentClinicalEnrollmentForSlot(conn: PoolConnection, studentId: string, timetableId: number, term: string, year: number): Promise<ClinicalEnrollmentLockRow | null>;
/**
 * Locks aggregate enrollment count for the slot (active `enrolled` only).
 */
export declare function lockAndCountActiveClinicalEnrollmentsForSlot(conn: PoolConnection, timetableId: number, term: string, year: number): Promise<number>;
export declare function insertClinicalEnrollmentRow(conn: PoolConnection, input: {
    studentId: string;
    timetableId: number;
    term: string;
    year: number;
    status?: string;
}): Promise<number>;
export declare function updateClinicalEnrollmentStatusById(conn: PoolConnection, enrollmentId: number, studentId: string, status: string): Promise<number>;
/**
 * Marks timetable-linked assignments for this student/slot as dropped (non-destructive).
 */
export declare function markClinicalAssignmentsDroppedForStudentSlot(conn: PoolConnection, studentId: string, timetableId: number, term: string, year: number): Promise<number>;
export declare function countActiveClinicalEnrollmentsForSlot(timetableId: number, term: string, year: number): Promise<number>;
/**
 * Transaction-safe enroll: lock, capacity check, insert or reactivate row. Caller supplies assignment insert.
 */
export declare function createClinicalEnrollment(studentId: string, timetableId: number, term: string, year: number, slotCapacity: number, insertAssignment: (conn: PoolConnection) => Promise<number>): Promise<{
    ok: true;
    enrollmentId: number;
    assignmentId: number;
    /** `true` only when a new `clinical_enrollments` row was inserted (not a dropped→enrolled reactivation). */
    isNewEnrollmentRow: boolean;
} | {
    ok: false;
    error: string;
}>;
export declare function dropClinicalEnrollment(studentId: string, enrollmentId: number): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=clinicalEnrollmentRepository.d.ts.map
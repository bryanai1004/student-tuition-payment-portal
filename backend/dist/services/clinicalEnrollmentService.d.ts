import { type ClinicalEnrollmentSlotRow, type ClinicalEnrollmentStudentRow, type ClinicalSlotRosterAdminRow } from "../repositories/clinicalEnrollmentRepository.js";
export type OpenClinicalSlotForStudentDto = ClinicalEnrollmentSlotRow & {
    alreadyEnrolled: boolean;
};
export declare function listOpenClinicalSlotsForStudent(studentId: string, query?: {
    term?: string | null;
    year?: string | number | null;
}): Promise<OpenClinicalSlotForStudentDto[]>;
export declare function listStudentClinicalEnrollmentRows(studentId: string, query?: {
    term?: string | null;
    year?: string | number | null;
}): Promise<ClinicalEnrollmentStudentRow[]>;
export declare function enrollStudentInClinicalSlot(studentId: string, timetableId: number, seatBucketFromRequest: unknown): Promise<{
    ok: true;
    enrollmentId: number;
    assignmentId: number;
    /** True when a new `portal_billing_adjustments` clinical charge was posted for this booking. */
    billingChargePosted: boolean;
} | {
    ok: false;
    error: string;
    status: number;
}>;
export declare function listAdminClinicalSlotRoster(timetableId: number): Promise<ClinicalSlotRosterAdminRow[]>;
/**
 * Admin removes a student from a slot: same non-destructive drop as student self-serve.
 * Verifies the enrollment belongs to the given timetable row.
 */
export declare function adminDropClinicalEnrollmentForSlot(timetableId: number, studentId: string, enrollmentId: number): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
    status: number;
}>;
export declare function dropStudentClinicalEnrollment(studentId: string, enrollmentId: number): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
    status: number;
}>;
//# sourceMappingURL=clinicalEnrollmentService.d.ts.map
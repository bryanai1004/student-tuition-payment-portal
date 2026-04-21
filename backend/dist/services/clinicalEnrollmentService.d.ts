import { type ClinicalEnrollmentSlotRow, type ClinicalEnrollmentStudentRow, type ClinicalSlotRosterAdminRow } from "../repositories/clinicalEnrollmentRepository.js";
export type OpenClinicalSlotForStudentDto = ClinicalEnrollmentSlotRow & {
    alreadyEnrolled: boolean;
    /** Clinical ladder mapped to timetable buckets (100/200/300). */
    studentBookingLevel: "100" | "200" | "300";
    /** Seats left in this student's level-specific bucket. */
    yourLevelBucketRemaining: number;
    /** Seats left in the shared all-levels bucket. */
    allLevelsBucketRemaining: number;
    /** Seats this student could still claim (level bucket first, else shared); null when slot is uncapped. */
    yourEffectiveRemaining: number | null;
    /** When the student could book now, which bucket would be consumed. */
    wouldBookIntoBucket: "100" | "200" | "300" | "all" | null;
};
export declare function listOpenClinicalSlotsForStudent(studentId: string, query?: {
    term?: string | null;
    year?: string | number | null;
}): Promise<OpenClinicalSlotForStudentDto[]>;
export declare function listStudentClinicalEnrollmentRows(studentId: string, query?: {
    term?: string | null;
    year?: string | number | null;
}): Promise<ClinicalEnrollmentStudentRow[]>;
export declare function enrollStudentInClinicalSlot(studentId: string, timetableId: number): Promise<{
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
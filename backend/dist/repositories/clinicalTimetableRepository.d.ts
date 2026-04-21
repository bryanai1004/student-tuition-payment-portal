/** Row shape from legacy `clinic_timetable` (see school.sql). */
export type ClinicTimetableDbRow = {
    id: number;
    year: number;
    term: string;
    weekday: string;
    time_from: string;
    time_to: string;
    slot: string;
    instructor_id: string;
    instructor: string;
    /** Legacy per-level caps (`100Max` … `123Max`); summed for portal capacity when present. */
    cap_100: number;
    cap_200: number;
    cap_300: number;
    cap_123: number;
};
/**
 * Optional filters: when `year` or `term` is null/undefined, that filter is skipped.
 */
export declare function listClinicTimetableSlots(options?: {
    year?: number | null;
    term?: string | null;
}): Promise<ClinicTimetableDbRow[]>;
export declare function getClinicTimetableById(seqNum: number): Promise<ClinicTimetableDbRow | null>;
export type ClinicTimetableAdminRow = ClinicTimetableDbRow & {
    /** `academic_terms.id` when year + legacy term matches a portal term; otherwise null. */
    academic_term_id: string | null;
    /**
     * Non-dropped rows on `clinical_enrollments` for this timetable id
     * (same filter as `listActiveClinicalRosterForTimetable`).
     */
    active_enrolled_count: number;
    enrolled_bucket_100: number;
    enrolled_bucket_200: number;
    enrolled_bucket_300: number;
    enrolled_bucket_all: number;
};
/**
 * Admin list: same filters as `listClinicTimetableSlots`, plus optional `academic_terms.id` via join.
 */
export declare function listClinicTimetableSlotsForAdmin(options?: {
    year?: number | null;
    term?: string | null;
}): Promise<ClinicTimetableAdminRow[]>;
export type ClinicTimetableWritePayload = {
    year: number;
    term: string;
    day: string;
    time_from: string;
    time_to: string;
    slot: string;
    instructor_id: string;
    instructor: string;
    cap_100: number;
    cap_200: number;
    cap_300: number;
    cap_123: number;
};
export declare function createClinicTimetableSlot(payload: ClinicTimetableWritePayload): Promise<number>;
export declare function updateClinicTimetableSlot(seqNum: number, payload: ClinicTimetableWritePayload): Promise<boolean>;
export declare function deleteClinicTimetableSlot(seqNum: number): Promise<boolean>;
export type ForceDeleteClinicTimetableCleanupCounts = {
    deletedClinicalRequests: number;
    deletedClinicalAssignments: number;
    deletedClinicalEnrollments: number;
    deletedClinicalBookingPaymentHolds: number;
    detachedPortalBillingAdjustments: number;
};
/**
 * Force delete cleanup for a timetable slot.
 * Deletes child/dependent records first in one transaction, then deletes `clinic_timetable`.
 */
export declare function forceDeleteClinicTimetableSlot(seqNum: number): Promise<{
    deleted: boolean;
    cleanup: ForceDeleteClinicTimetableCleanupCounts;
}>;
export type ClinicTimetableReferenceCounts = {
    activeEnrollments: number;
    historicalDroppedEnrollments: number;
    activePendingRequests: number;
    historicalDecidedRequests: number;
    activeAssignments: number;
    historicalDroppedAssignments: number;
};
/**
 * Status-aware dependency counts for a timetable slot.
 * - Active dependencies should block delete because they are still operationally referenced.
 */
export declare function countClinicTimetableReferences(seqNum: number): Promise<ClinicTimetableReferenceCounts>;
export type HistoricalClinicTimetableReferenceCleanupResult = {
    deletedDroppedEnrollments: number;
    deletedDecidedRequests: number;
    detachedDroppedAssignments: number;
};
/**
 * Removes or detaches historical references before slot deletion.
 * This keeps active flows intact while preventing dangling timetable links.
 */
export declare function cleanupHistoricalClinicTimetableReferences(seqNum: number): Promise<HistoricalClinicTimetableReferenceCleanupResult>;
/** `clinic_timetable` + enrolled counts for the portal offered timetable (no dependency on enrollment service). */
export type ClinicalOfferedTimetableDetailRow = {
    timetableId: number;
    term: string;
    year: number;
    weekday: string;
    time_from: string;
    time_to: string;
    slot: string;
    instructor: string | null;
    capacity: number | null;
    enrolledCount: number;
    remainingSeats: number | null;
    capacity100: number;
    capacity200: number;
    capacity300: number;
    capacityAll: number;
    enrolled100: number;
    enrolled200: number;
    enrolled300: number;
    enrolledAll: number;
    remaining100: number;
    remaining200: number;
    remaining300: number;
    remainingAll: number;
};
export declare function listClinicalOfferedTimetableDetailRows(options?: {
    year?: number | null;
    term?: string | null;
}): Promise<ClinicalOfferedTimetableDetailRow[]>;
//# sourceMappingURL=clinicalTimetableRepository.d.ts.map
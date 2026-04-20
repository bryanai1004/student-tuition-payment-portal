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
export type ClinicTimetableReferenceCounts = {
    enrollments: number;
    requests: number;
    assignments: number;
};
/**
 * Rows still pointing at this `clinic_timetable.seqNum` (enrollments, requests, assignments).
 */
export declare function countClinicTimetableReferences(seqNum: number): Promise<ClinicTimetableReferenceCounts>;
//# sourceMappingURL=clinicalTimetableRepository.d.ts.map
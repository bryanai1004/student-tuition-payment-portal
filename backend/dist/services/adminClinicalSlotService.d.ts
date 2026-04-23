export declare class AdminClinicalSlotError extends Error {
    readonly status: number;
    readonly name = "AdminClinicalSlotError";
    constructor(message: string, status?: number);
}
export type AdminClinicalSlotDto = {
    id: number;
    academicTermId: string | null;
    year: number;
    term: string;
    weekday: string;
    timeFrom: string;
    timeTo: string;
    slot: string;
    instructorId: string;
    instructor: string;
    cap100: number;
    cap200: number;
    cap300: number;
    cap123: number;
    /** `clinical_enrollments` with `status = 'enrolled'` for this slot (admin list + roster index). */
    activeEnrolledCount: number;
    enrolled100: number;
    enrolled200: number;
    enrolled300: number;
    enrolledAll: number;
};
export type AdminClinicalSlotCreateInput = {
    academicTermId: string;
    weekday: string;
    timeFrom: string;
    timeTo: string;
    slot: string;
    instructorId?: string | null;
    instructor: string;
    cap100?: unknown;
    cap200?: unknown;
    cap300?: unknown;
    cap123?: unknown;
};
export type AdminClinicalSlotPatchInput = Partial<{
    academicTermId: string;
    weekday: string;
    timeFrom: string;
    timeTo: string;
    slot: string;
    instructorId: string | null;
    instructor: string;
    cap100: unknown;
    cap200: unknown;
    cap300: unknown;
    cap123: unknown;
}>;
export declare function listAdminClinicalSlots(options?: {
    academicTermId?: string | null;
}): Promise<AdminClinicalSlotDto[]>;
export declare function createAdminClinicalSlot(input: AdminClinicalSlotCreateInput): Promise<AdminClinicalSlotDto>;
export declare function updateAdminClinicalSlot(seqNum: number, patch: AdminClinicalSlotPatchInput): Promise<AdminClinicalSlotDto | null>;
export declare function deleteAdminClinicalSlot(seqNum: number, options?: {
    forceDelete?: boolean;
    actor?: {
        adminRole?: string | null;
        adminIdentifier?: string | null;
    };
}): Promise<{
    ok: true;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=adminClinicalSlotService.d.ts.map
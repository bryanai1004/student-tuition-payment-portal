import type { PoolConnection } from "mysql2/promise";
export type ClinicalRequestDbRow = {
    id: number;
    student_id: string;
    timetable_id: number;
    term: string;
    year: number;
    status: string;
    created_at: Date;
    decided_at: Date | null;
    decided_by: string | null;
    tt_day: string | null;
    tt_time_from: string | null;
    tt_time_to: string | null;
    tt_slot: string | null;
    tt_instructor: string | null;
};
export declare function insertClinicalRequestRow(params: {
    studentId: string;
    timetableId: number;
    term: string;
    year: number;
}): Promise<number>;
export declare function studentHasPendingClinicalRequestForTimetable(studentId: string, timetableId: number): Promise<boolean>;
export declare function listClinicalRequestsForStudent(studentId: string): Promise<ClinicalRequestDbRow[]>;
export declare function listPendingClinicalRequestsForAdmin(): Promise<ClinicalRequestDbRow[]>;
export declare function getClinicalRequestById(id: number): Promise<ClinicalRequestDbRow | null>;
export declare function getClinicalRequestByIdForUpdate(connection: PoolConnection, id: number): Promise<ClinicalRequestDbRow | null>;
export declare function updateClinicalRequestDecision(connection: PoolConnection, id: number, status: "approved" | "rejected", decidedBy: string | null): Promise<number>;
//# sourceMappingURL=clinicalRequestRepository.d.ts.map
import type { AcademicTermDetail } from "../types/academicTerm.js";
export type AcademicTermSchemaCaps = {
    selectSql: string;
    /** True only when both optional columns exist (partial schemas use legacy paths). */
    hasPaymentPolicyColumns: boolean;
    hasPostedToDashboardColumn: boolean;
};
/**
 * Detects once per process which optional `academic_terms` columns exist. Uses the same
 * table resolution as app queries (not information_schema), so capability matches
 * actual SELECT/INSERT/UPDATE behavior.
 */
export declare function academicTermSchemaCaps(): Promise<AcademicTermSchemaCaps>;
export declare function listAcademicTerms(): Promise<AcademicTermDetail[]>;
export declare function listVisibleAcademicTerms(limit?: number): Promise<AcademicTermDetail[]>;
export declare function listRecentVisibleAcademicTerms(limit?: number): Promise<AcademicTermDetail[]>;
export declare function getAcademicTermById(id: string): Promise<AcademicTermDetail | null>;
export declare function getCurrentRegistrationOpenTerm(): Promise<AcademicTermDetail | null>;
export declare function getPostedToDashboardTerm(): Promise<AcademicTermDetail | null>;
/**
 * Clears all posted flags, then marks `id` as posted. Requires `is_posted_to_dashboard` column.
 */
export declare function postAcademicTermToDashboard(id: string): Promise<AcademicTermDetail | null>;
export type AcademicTermInsertRow = Omit<AcademicTermDetail, "is_visible"> & {
    is_visible: boolean;
};
export declare function insertAcademicTerm(row: AcademicTermInsertRow): Promise<AcademicTermDetail>;
/**
 * Full row replace by current primary key `currentId` (supports changing `id` when year/term_name change).
 */
export declare function updateAcademicTermRow(currentId: string, row: AcademicTermInsertRow): Promise<AcademicTermDetail | null>;
//# sourceMappingURL=academicTermRepository.d.ts.map
/**
 * **Registration** writes: enrolls into `portal_enrollments` / sections under an academic term. This is the portal
 * enrollment action — separate from `marks` outcomes, transcript display, and degree audit.
 */
import { type EnrollSectionInput } from "../repositories/studentEnrollmentRepository.js";
export type { EnrollSectionInput };
/** Thrown when academic term policy blocks registration (maps to HTTP 400 with this message). */
export declare class RegistrationLockedOverdueBalanceError extends Error {
    constructor();
}
/**
 * Registers sections under the academic term’s `term_name` and `year`. Those values are the same
 * quarter key used by `portal_enrollments` and by finance (`getAccountingQuartersPayload` /
 * `getAccountingLedgerPayload` portal fallback), so a completed registration appears on the ledger
 * for that term without hardcoded quarter data.
 */
export declare function enrollStudentForAcademicTerm(studentId: string, academicTermId: string, sections: EnrollSectionInput[]): Promise<{
    ok: true;
    insertedCount: number;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=studentEnrollmentService.d.ts.map
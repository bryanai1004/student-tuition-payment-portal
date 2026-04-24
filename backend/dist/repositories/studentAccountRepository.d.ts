import type { Pool } from "mysql2/promise";
import type { AccountContext, BillingAdjustmentRecord } from "../types/studentAccount.js";
/**
 * Latest term/year for which the student has at least one enrollment row.
 * Ordering: highest calendar year first, then Fall > Summer > Spring > Winter within the year.
 */
export declare function findLatestTermYearForStudent(pool: Pool, studentExternalId: string): Promise<{
    term: string;
    year: number;
} | null>;
/**
 * Distinct term/year pairs from `portal_enrollments` for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export declare function listPortalScheduleTermsForStudent(pool: Pool, studentExternalId: string): Promise<{
    term: string;
    year: number;
}[]>;
/**
 * `portal_billing_adjustments` for one student + quarter (no dependency on portal course rows).
 * Used when merging portal-side charges into the student ledger alongside legacy `accounting`.
 */
export declare function loadPortalBillingAdjustmentsForQuarter(pool: Pool, studentId: string, term: string, year: number): Promise<BillingAdjustmentRecord[]>;
export declare function loadAccountContext(pool: Pool, studentId: string, term: string, year: number): Promise<AccountContext | null>;
/**
 * Portal billing context for a term/year, including empty enrollments (payments/adjustments only).
 * Used to synthesize a ledger when legacy `accounting` has no rows for that quarter.
 */
export declare function loadPortalTermBillingContext(pool: Pool, studentId: string, term: string, year: number): Promise<AccountContext>;
/**
 * Loads {@link AccountContext} for many students in a quarter with a bounded number of queries
 * (enrollments, prefs, payments, adjustments, courses). Used for admin finance roster balances.
 */
export declare function batchLoadPortalTermBillingContextsForQuarter(pool: Pool, studentIds: string[], term: string, year: number): Promise<Map<string, AccountContext>>;
//# sourceMappingURL=studentAccountRepository.d.ts.map
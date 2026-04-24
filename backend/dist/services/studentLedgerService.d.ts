import type { AccountContext, BillingAdjustmentSource } from "../types/studentAccount.js";
export type LedgerQuarterOption = {
    term: string;
    year: number;
    label: string;
};
export type LedgerRowSourceType = "system" | "manual_charge" | "manual_payment" | "auto_late_fee";
/** Present on ledger rows tied to an active clinical booking payment hold. */
export type LedgerClinicalBookingPaymentHoldDto = {
    /** ISO-8601 UTC instant when the hold window ends. */
    holdExpiresAt: string;
    /** Whole seconds remaining at response time (server clock); clients should tick from `holdExpiresAt`. */
    remainingSeconds: number;
    holdStatus: string;
};
export type LedgerRowDto = {
    date: string;
    type: string;
    code: string;
    memo: string;
    debit: number;
    credit: number;
    sourceType: LedgerRowSourceType;
    sourceId: string | number | null;
    isEditable: boolean;
    isDeletable: boolean;
    clinicalBookingPaymentHold?: LedgerClinicalBookingPaymentHoldDto | null;
    /** From `portal_billing_adjustments` when the row was synthesized from that table. */
    billingAdjustmentSource?: BillingAdjustmentSource;
    /** Populated for `system_late_fee_reversal` when `reversal_of_adjustment_id` exists. */
    reversalOfAdjustmentId?: number | null;
};
export type LedgerSummaryDto = {
    totalCharges: number;
    totalPayments: number;
    balance: number;
};
/**
 * Net quarter balance for portal-only students (no legacy `accounting` rows for the quarter),
 * using the same row construction and summary as the admin ledger (excluding clinical hold metadata).
 */
export declare function computePortalOnlyQuarterNetBalance(ctx: AccountContext): number;
export declare function getAccountingQuartersPayload(studentId: string): Promise<{
    studentId: string;
    quarters: LedgerQuarterOption[];
}>;
export type AccountingLedgerPayloadOptions = {
    /**
     * When true, skip query-time revocation of expired unpaid clinical bookings.
     * Used by `getStudentQuarterBalance` to avoid recursion while holds are reconciled.
     */
    skipExpiredClinicalBookingReconciliation?: boolean;
    /** Internal recursion guard and read-only contexts that must not mutate ledger rows. */
    skipLateFeeEvaluation?: boolean;
    /**
     * Student portal only: omit fully reversed system late fee pairs and, when the quarter
     * payment DDL is not yet in effect, all system late fee / reversal lines from rows + summary.
     */
    studentPortalLedgerPresentation?: boolean;
};
export declare function getAccountingLedgerPayload(studentId: string, term: string, year: number, options?: AccountingLedgerPayloadOptions): Promise<{
    studentId: string;
    term: string;
    year: number;
    rows: LedgerRowDto[];
    summary: LedgerSummaryDto;
} | null>;
/** Quarter balance using the same ledger rules as `getAccountingLedgerPayload`. */
export declare function getStudentQuarterBalance(studentId: string, term: string, year: number): Promise<number>;
//# sourceMappingURL=studentLedgerService.d.ts.map
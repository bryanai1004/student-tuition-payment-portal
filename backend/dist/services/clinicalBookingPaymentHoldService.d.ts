/**
 * Whether the student's current quarter balance indicates this clinical booking charge
 * is covered, using the snapshot taken at charge time (`balanceBeforeCharge`).
 *
 * - When `balanceBeforeCharge >= 0`, we require the balance to return to at most that
 *   baseline (so new charges since the snapshot must be offset by payments).
 * - When `balanceBeforeCharge < 0` (net credit before the charge), we require the
 *   balance to remain at most `balanceBeforeCharge + chargeAmount` (the balance
 *   immediately after posting this clinical debit).
 */
export declare function isClinicalBookingHoldFinanciallySatisfied(balanceBeforeCharge: number, chargeAmount: number, currentBalance: number): boolean;
export declare function reconcilePaidClinicalBookingPaymentHoldsForStudent(studentId: string): Promise<void>;
export type ClinicalBookingPaymentHoldCleanupStats = {
    candidates: number;
    satisfied: number;
    autoDropped: number;
    skipped: number;
    inconsistencies: number;
};
/**
 * Marks satisfied holds and auto-drops overdue unpaid clinical bookings (idempotent).
 */
export declare function runClinicalBookingPaymentHoldCleanup(): Promise<ClinicalBookingPaymentHoldCleanupStats>;
//# sourceMappingURL=clinicalBookingPaymentHoldService.d.ts.map
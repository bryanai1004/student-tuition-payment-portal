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
/**
 * True when the hold window end is strictly before "now" (UTC clock on server).
 * Used with `status = 'active'` + unpaid balance checks to detect expiration.
 */
export declare function isClinicalBookingPaymentHoldPastDeadline(holdExpiresAt: Date, nowMs?: number): boolean;
export type StudentPortalClinicalBookingHoldDto = {
    holdExpiresAt: string;
    remainingSeconds: number;
    holdStatus: "active" | "expired";
    clinicalEnrollmentId: number;
    timetableId: number;
    slotLabel: string;
};
/**
 * Summarizes the student's most urgent open clinical booking payment hold for the student portal.
 * DB row must be `active` and tied to an `enrolled` clinical enrollment.
 */
export declare function getStudentPortalClinicalBookingHold(studentId: string): Promise<StudentPortalClinicalBookingHoldDto | null>;
export declare function reconcilePaidClinicalBookingPaymentHoldsForStudent(studentId: string): Promise<void>;
export type ClinicalBookingPaymentHoldCleanupStats = {
    candidates: number;
    satisfied: number;
    autoDropped: number;
    skipped: number;
    inconsistencies: number;
};
/**
 * Core idempotent processor: for each hold id, revoke unpaid expired booking or mark paid.
 */
export declare function processDueClinicalBookingPaymentHoldIds(dueIds: number[]): Promise<ClinicalBookingPaymentHoldCleanupStats>;
/**
 * Expired unpaid clinical reservation: `clinical_booking_payment_holds.status = 'active'`,
 * `hold_expires_at <= UTC_TIMESTAMP()`, enrollment still `enrolled`, and ledger shows the
 * charge is not financially satisfied vs `balance_before_charge` / `charge_amount`.
 * On success: void `portal_billing_adjustments` clinical row, set enrollment `dropped`,
 * hold `expired_auto_dropped`.
 */
export declare function reconcileExpiredClinicalBookingHoldsForStudent(studentId: string): Promise<ClinicalBookingPaymentHoldCleanupStats>;
export declare function reconcileExpiredClinicalBookingHoldsForTimetable(timetableId: number): Promise<ClinicalBookingPaymentHoldCleanupStats>;
/**
 * Process global due holds in batches until none remain or max batches (open-slot listing).
 */
export declare function runDueClinicalBookingHoldCleanupBatches(opts?: {
    maxBatches?: number;
    batchSize?: number;
}): Promise<ClinicalBookingPaymentHoldCleanupStats>;
/**
 * Marks satisfied holds and auto-drops overdue unpaid clinical bookings (idempotent).
 */
export declare function runClinicalBookingPaymentHoldCleanup(): Promise<ClinicalBookingPaymentHoldCleanupStats>;
//# sourceMappingURL=clinicalBookingPaymentHoldService.d.ts.map
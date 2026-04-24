import type { Pool, PoolConnection } from "mysql2/promise";
/** Pool or transaction connection for inserts. */
export type PortalBillingSqlExecutor = Pool | PoolConnection;
export type PortalBillingCategory = "tuition" | "clinical" | "fees" | "other";
export declare const LATE_FEE_DESCRIPTION = "Late Payment Fee";
export type FinanceRosterRow = {
    studentId: string;
    name: string;
};
/** Balance sign filter for admin finance roster (applied in the service after merged balances). */
export type AdminFinanceRosterBalanceFilter = "all" | "positive" | "negative" | "zero";
export type AdminFinanceRosterStudentRow = {
    studentId: string;
    name: string;
};
/** @deprecated Use {@link AdminFinanceRosterStudentRow} */
export type AdminFinanceRosterPageRow = AdminFinanceRosterStudentRow;
/**
 * Count of finance roster rows after search only (balance filters run in the service).
 */
export declare function countAdminFinanceRosterSearchOnly(pool: Pool, params: {
    searchTrimmed: string;
}): Promise<number>;
/**
 * One page of finance roster (student id + name) after search; stable name / id ordering.
 */
export declare function listAdminFinanceRosterPageSearchOnly(pool: Pool, params: {
    searchTrimmed: string;
    limit: number;
    offset: number;
}): Promise<AdminFinanceRosterStudentRow[]>;
/** Full roster after search (ordered), used when applying balance filters before pagination. */
export declare function listAdminFinanceRosterAllSearchOnlyOrdered(pool: Pool, params: {
    searchTrimmed: string;
}): Promise<AdminFinanceRosterStudentRow[]>;
/** `SUM(amount)` of `portal_billing_adjustments` per student for a quarter (signed; matches ledger adjustment lines). */
export declare function sumPortalBillingAdjustmentsNetByStudentForQuarter(pool: Pool, term: string, year: number): Promise<Map<string, number>>;
/** Total `portal_payments.amount` per student for a quarter (amounts stored as positive credits). */
export declare function sumPortalPaymentsByStudentForQuarter(pool: Pool, term: string, year: number): Promise<Map<string, number>>;
/**
 * Legacy `students` roster plus `portal_students` rows that are not yet in `students`
 * (same external id key used across portal billing tables).
 */
export declare function listFinanceRosterRows(pool: Pool): Promise<FinanceRosterRow[]>;
/**
 * All term/year pairs that appear anywhere in finance-related tables (newest first).
 */
export declare function listGlobalFinanceQuarters(pool: Pool): Promise<{
    term: string;
    year: number;
}[]>;
/**
 * Detects optional `academic_terms.payment_due_date` without migrations.
 * Cached for the process lifetime.
 */
export declare function academicTermsPaymentDueDateColumnExists(pool: Pool): Promise<boolean>;
/** Payment DDL and whether a matching `academic_terms` row exists for this finance quarter. */
export declare function getFinanceQuarterDdlFromAcademicTerms(pool: Pool, term: string, year: number): Promise<{
    paymentDueDate: string | null;
    rowExists: boolean;
}>;
export type SetFinanceQuarterDdlResult = "ok" | "no_column" | "not_found";
export declare function setFinanceQuarterDdlOnAcademicTerms(pool: Pool, term: string, year: number, paymentDueDate: string | null): Promise<SetFinanceQuarterDdlResult>;
/** Students with any portal billing activity for the term (late fee candidates). */
export declare function listStudentIdsWithPortalQuarterActivity(pool: Pool, term: string, year: number): Promise<string[]>;
export declare function hasSystemLateFeeForQuarter(pool: Pool, studentExternalId: string, term: string, year: number): Promise<boolean>;
export declare function insertPortalBillingAdjustment(pool: PortalBillingSqlExecutor, params: {
    studentExternalId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category: PortalBillingCategory;
    adjustmentSource?: "manual" | "system_late_fee" | "system_clinical" | "system_late_fee_reversal";
    /** When set, links a `system_clinical` slot booking charge to `clinical_enrollments.id`. */
    clinicalEnrollmentId?: number | null;
    /** When set, links this row as a compensating reversal of another adjustment row. */
    reversalOfAdjustmentId?: number | null;
}): Promise<number>;
export declare function insertSystemLateFee(pool: PortalBillingSqlExecutor, params: {
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
}): Promise<void>;
export type SystemLateFeeRow = {
    id: number;
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
    reversedAmount: number;
    activeAmount: number;
};
export declare function listSystemLateFeeRowsForQuarter(pool: Pool, term: string, year: number): Promise<SystemLateFeeRow[]>;
export declare function insertSystemLateFeeReversal(pool: PortalBillingSqlExecutor, params: {
    studentExternalId: string;
    term: string;
    year: number;
    sourceAdjustmentId: number;
    amount: number;
    reason: string;
}): Promise<number>;
export declare function insertPortalPayment(pool: Pool, params: {
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
    paidAt: string;
    method: string;
    description: string | null;
}): Promise<void>;
export type BillingAdjustmentDbRow = {
    id: number;
    studentExternalId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category: PortalBillingCategory;
    adjustmentSource: string;
};
export declare function getBillingAdjustmentById(pool: Pool, id: number): Promise<BillingAdjustmentDbRow | null>;
export declare function updateManualBillingAdjustment(pool: Pool, id: number, params: {
    description: string;
    amount: number;
    category: PortalBillingCategory;
}): Promise<void>;
export declare function deleteManualBillingAdjustment(pool: Pool, id: number): Promise<void>;
export type PortalPaymentDbRow = {
    id: number;
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
    paidAt: string;
    method: string;
    description: string | null;
};
export declare function getPortalPaymentById(pool: Pool, id: number): Promise<PortalPaymentDbRow | null>;
/** Portal payments are treated as manually recorded (admin/student); all are editable. */
export declare function updatePortalPayment(pool: Pool, id: number, params: {
    amount: number;
    paidAt: string;
    method: string;
    description: string | null;
}): Promise<void>;
export declare function deletePortalPayment(pool: Pool, id: number): Promise<void>;
//# sourceMappingURL=adminFinanceRepository.d.ts.map
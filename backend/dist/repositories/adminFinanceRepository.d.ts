import type { Pool } from "mysql2/promise";
export type PortalBillingCategory = "tuition" | "clinical" | "fees" | "other";
export declare const LATE_FEE_DESCRIPTION = "Late Payment Fee";
export type FinanceRosterRow = {
    studentId: string;
    name: string;
};
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
export type TermFinanceSettingsRow = {
    term: string;
    year: number;
    paymentDueDate: string | null;
    lateFeeEnabled: boolean;
    lateFeeAmount: number;
    updatedBy: string | null;
};
export declare function getTermFinanceSettings(pool: Pool, term: string, year: number): Promise<TermFinanceSettingsRow | null>;
export declare function upsertTermFinanceSettings(pool: Pool, params: {
    term: string;
    year: number;
    paymentDueDate: string | null;
    lateFeeEnabled: boolean;
    lateFeeAmount: number;
    updatedBy: string | null;
}): Promise<void>;
/** Students with any portal billing activity for the term (late fee candidates). */
export declare function listStudentIdsWithPortalQuarterActivity(pool: Pool, term: string, year: number): Promise<string[]>;
export declare function hasSystemLateFeeForQuarter(pool: Pool, studentExternalId: string, term: string, year: number): Promise<boolean>;
export declare function insertPortalBillingAdjustment(pool: Pool, params: {
    studentExternalId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category: PortalBillingCategory;
    adjustmentSource?: "manual" | "system_late_fee";
}): Promise<void>;
export declare function insertSystemLateFee(pool: Pool, params: {
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
}): Promise<void>;
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
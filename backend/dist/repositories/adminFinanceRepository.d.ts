import type { Pool } from "mysql2/promise";
export type PortalBillingCategory = "tuition" | "clinical" | "fees" | "other";
export type FinanceRosterRow = {
    studentId: string;
    name: string;
};
/**
 * Legacy `students` roster plus `portal_students` rows that are not yet in `students`
 * (same external id key used across portal billing tables).
 */
export declare function listFinanceRosterRows(pool: Pool): Promise<FinanceRosterRow[]>;
export declare function insertPortalBillingAdjustment(pool: Pool, params: {
    studentExternalId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category: PortalBillingCategory;
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
//# sourceMappingURL=adminFinanceRepository.d.ts.map
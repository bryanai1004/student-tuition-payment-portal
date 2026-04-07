import { type PortalBillingCategory } from "../repositories/adminFinanceRepository.js";
export type AdminFinanceStudentRow = {
    studentId: string;
    name: string;
    /** Omitted on list until ledger is opened (avoids N× quarters+ledger on roster load). */
    balance: number | null;
};
export declare function listAdminFinanceStudents(): Promise<AdminFinanceStudentRow[]>;
export declare function getAdminFinanceQuarters(studentId: string): Promise<{
    studentId: string;
    quarters: import("./studentLedgerService.js").LedgerQuarterOption[];
}>;
export declare function getAdminFinanceLedger(studentId: string, term: string, year: number): Promise<{
    studentId: string;
    term: string;
    year: number;
    rows: import("./studentLedgerService.js").LedgerRowDto[];
    summary: import("./studentLedgerService.js").LedgerSummaryDto;
} | null>;
export type PostAdminChargeInput = {
    studentId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category?: PortalBillingCategory;
};
export type PostAdminPaymentInput = {
    studentId: string;
    term: string;
    year: number;
    amount: number;
    paidAt?: string;
    method?: string;
    description?: string;
};
export declare function validatePostChargeBody(raw: unknown): {
    ok: true;
    data: PostAdminChargeInput;
} | {
    ok: false;
    error: string;
};
export declare function validatePostPaymentBody(raw: unknown): {
    ok: true;
    data: PostAdminPaymentInput;
} | {
    ok: false;
    error: string;
};
export declare function postAdminFinanceCharge(input: PostAdminChargeInput): Promise<void>;
export declare function postAdminFinancePayment(input: PostAdminPaymentInput): Promise<void>;
//# sourceMappingURL=adminFinanceService.d.ts.map
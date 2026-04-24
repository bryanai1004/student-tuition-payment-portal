import { type AdminFinanceRosterBalanceFilter, type PortalBillingCategory } from "../repositories/adminFinanceRepository.js";
/** One row in the paginated admin finance student list. */
export type AdminFinanceStudentListItem = {
    studentId: string;
    name: string;
    /** Net balance for the selected quarter (legacy `accounting` + portal adjustments, or full portal ledger when no legacy rows). */
    balance: number;
};
export type AdminFinanceStudentsListResponse = {
    items: AdminFinanceStudentListItem[];
    total: number;
    page: number;
    pageSize: number;
};
export declare function listGlobalQuartersPayload(): Promise<{
    quarters: {
        term: string;
        year: number;
        label: string;
    }[];
}>;
export declare function getQuarterSettingsPayload(term: string, year: number): Promise<{
    term: string;
    year: number;
    paymentDueDate: string | null;
    lateFeeEnabled: boolean;
    lateFeeAmount: number;
    ddlPersistenceAvailable: boolean;
    ddlSaveNote: string | null;
}>;
export type LateFeeReconciliationPreview = {
    term: string;
    year: number;
    paymentDueDate: string | null;
    studentsScanned: number;
    wouldAddSystemLateFeeCount: number;
    wouldReverseInvalidSystemLateFeeCount: number;
    wouldRequireManualReviewCount: number;
    sampleReversalStudentId: string | null;
};
export declare function previewLateFeeReconciliationForQuarter(term: string, year: number, paymentDueDateOverride?: string | null): Promise<LateFeeReconciliationPreview>;
export type LateFeeReconciliationResult = {
    ok: true;
    term: string;
    year: number;
    paymentDueDate: string | null;
    studentsScanned: number;
    insertedCount: number;
    reversedCount: number;
    protectedSettledCount: number;
    skippedCount: number;
    sampleReversal: {
        studentId: string;
        originalLateFeeAdjustmentId: number;
        reversalAdjustmentId: number;
    } | null;
};
export declare function reconcileLateFeesForQuarter(term: string, year: number): Promise<LateFeeReconciliationResult>;
export declare function putQuarterSettings(input: {
    term: string;
    year: number;
    paymentDueDate: string | null;
    lateFeeEnabled?: boolean;
    lateFeeAmount?: number;
    updatedBy?: string | null;
}): Promise<{
    ok: true;
    reconciliation: LateFeeReconciliationResult;
} | {
    ok: false;
    message: string;
}>;
export declare function parseBalanceFilterParam(raw: string | undefined): AdminFinanceRosterBalanceFilter;
/**
 * Paginated finance roster: one roster SQL (search + paging), one batched balance pass
 * (legacy aggregates, portal adjustment/payment sums, and batched portal billing contexts).
 */
export declare function listAdminFinanceStudentsPaginated(term: string, year: number, query: {
    page: number;
    pageSize: number;
    search: string;
    balanceFilter: AdminFinanceRosterBalanceFilter;
}): Promise<AdminFinanceStudentsListResponse>;
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
export declare function validatePutChargeBody(raw: unknown): {
    ok: true;
    data: {
        description: string;
        amount: number;
        category: PortalBillingCategory;
    };
} | {
    ok: false;
    error: string;
};
export declare function validatePutPaymentBody(raw: unknown): {
    ok: true;
    data: {
        amount: number;
        paidAt: string;
        method: string;
        description: string | null;
    };
} | {
    ok: false;
    error: string;
};
export declare function putAdminFinanceCharge(id: number, body: {
    description: string;
    amount: number;
    category: PortalBillingCategory;
}): Promise<void>;
export declare function deleteAdminFinanceCharge(id: number): Promise<void>;
export declare function putAdminFinancePayment(id: number, body: {
    amount: number;
    paidAt: string;
    method: string;
    description: string | null;
}): Promise<void>;
export declare function deleteAdminFinancePayment(id: number): Promise<void>;
export declare function verifyManualChargeForStudentTerm(id: number, studentId: string, term: string, year: number): Promise<boolean>;
export declare function verifyPaymentForStudentTerm(id: number, studentId: string, term: string, year: number): Promise<boolean>;
export declare function runLateFeeCheckForQuarter(term: string, year: number): Promise<{
    ok: true;
    insertedCount: number;
    skippedCount: number;
    message?: string;
}>;
//# sourceMappingURL=adminFinanceService.d.ts.map
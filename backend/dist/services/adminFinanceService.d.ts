import { type PortalBillingCategory } from "../repositories/adminFinanceRepository.js";
export type AdminFinanceStudentRow = {
    studentId: string;
    name: string;
    balance: number | null;
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
}>;
export declare function putQuarterSettings(input: {
    term: string;
    year: number;
    paymentDueDate: string | null;
    lateFeeEnabled?: boolean;
    lateFeeAmount?: number;
    updatedBy?: string | null;
}): Promise<void>;
export declare function listAdminFinanceStudentsForQuarter(term: string, year: number): Promise<AdminFinanceStudentRow[]>;
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
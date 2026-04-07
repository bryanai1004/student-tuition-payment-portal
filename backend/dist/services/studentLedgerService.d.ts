export type LedgerQuarterOption = {
    term: string;
    year: number;
    label: string;
};
export type LedgerRowSourceType = "system" | "manual_charge" | "manual_payment" | "auto_late_fee";
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
};
export type LedgerSummaryDto = {
    totalCharges: number;
    totalPayments: number;
    balance: number;
};
export declare function getAccountingQuartersPayload(studentId: string): Promise<{
    studentId: string;
    quarters: LedgerQuarterOption[];
}>;
export declare function getAccountingLedgerPayload(studentId: string, term: string, year: number): Promise<{
    studentId: string;
    term: string;
    year: number;
    rows: LedgerRowDto[];
    summary: LedgerSummaryDto;
} | null>;
/** Quarter balance using the same ledger rules as `getAccountingLedgerPayload`. */
export declare function getStudentQuarterBalance(studentId: string, term: string, year: number): Promise<number>;
//# sourceMappingURL=studentLedgerService.d.ts.map
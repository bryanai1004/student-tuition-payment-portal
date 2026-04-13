export declare const ADMIN_LOA_QUARTERS: readonly ["Winter", "Spring", "Summer", "Fall"];
export type AdminLoaQuarter = (typeof ADMIN_LOA_QUARTERS)[number];
export declare function normalizeAdminLoaQuarter(raw: unknown): AdminLoaQuarter | null;
export declare function normalizeAdminLoaYear(raw: unknown): number | null;
export declare function deriveAdminLoaQuarterStartDate(quarter: AdminLoaQuarter, year: number): string;
//# sourceMappingURL=adminStudentLoaDates.d.ts.map
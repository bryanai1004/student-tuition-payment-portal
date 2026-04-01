import type { StudentAccountPayload } from "../types/studentAccount.js";
export type ActivityRow = {
    date: string;
    description: string;
    charges: number;
    credits: number;
    balance: number;
};
export declare function buildActivityRows(payload: StudentAccountPayload): ActivityRow[];
//# sourceMappingURL=activityView.d.ts.map
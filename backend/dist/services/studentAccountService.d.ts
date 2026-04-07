/**
 * Student account (billing + schedule + **merged** context): the layer where legacy **academic** schedule data and
 * **clinical** progress (`buildClinicalProgress`) may appear together for the dashboard. Keep domain separation
 * upstream — `computeDegreeAudit` is not wired here yet.
 */
import type { StudentAccountPayload } from "../types/studentAccount.js";
export type AccountTermYearInput = {
    mode: "explicit";
    term: string;
    year: number;
} | {
    mode: "auto";
};
export declare function getStudentAccountPayload(studentId: string, termYear: AccountTermYearInput): Promise<StudentAccountPayload | null>;
//# sourceMappingURL=studentAccountService.d.ts.map
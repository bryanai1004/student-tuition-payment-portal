import type { RowDataPacket } from "mysql2/promise";
import type { StudentProfilePayload } from "../types/studentProfile.js";
/** Normalize a legacy DB date column to ISO `YYYY-MM-DD`, or null if zero/invalid. */
export declare function legacyDbDateToIso(v: unknown): string | null;
/**
 * Prefer `signed_date` when it is a real calendar date; otherwise `EnrollStartDate`.
 */
export declare function resolveEnrollmentDate(signedDate: unknown, enrollStartDate: unknown): string | null;
/**
 * `age = floor((today - dob) / 365.25 days)` in whole UTC calendar days.
 */
export declare function ageFromDob(dobRaw: unknown, now?: Date): number | null;
export declare function combineAddressLine(address: unknown, address2: unknown): string | null;
export declare function trackFromRequirementsId(v: unknown): string | null;
export declare function mapLegacyStudentRowToProfile(row: RowDataPacket): StudentProfilePayload;
export declare function getLegacyStudentProfile(studentId: string): Promise<StudentProfilePayload | null>;
export type StudentSensitiveProfileUpdate = {
    dob?: string | null;
    ssn?: string | null;
    visa?: string | null;
    address?: string | null;
    phone1?: string | null;
    phone2?: string | null;
    phone3?: string | null;
    email?: string | null;
    citizenship?: string | null;
    race?: string | null;
    marital?: string | null;
};
export declare function updateLegacyStudentSensitiveProfile(studentId: string, patch: StudentSensitiveProfileUpdate): Promise<boolean>;
//# sourceMappingURL=studentProfileService.d.ts.map
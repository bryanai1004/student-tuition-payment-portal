import type { RowDataPacket } from "mysql2/promise";
import type { StudentProfilePayload } from "../types/studentProfile.js";
/**
 * Prefer `signed_date` when it is a real calendar date; otherwise `EnrollStartDate`.
 */
export declare function resolveEnrollmentDate(signedDate: unknown, enrollStartDate: unknown): string | null;
/**
 * `age = floor((today - dob) / 365.25 days)` in whole UTC calendar days.
 */
export declare function ageFromDob(dobRaw: unknown, now?: Date): number | null;
export declare function combineAddressLine(address: unknown, address2: unknown): string | null;
export declare function mapLegacyStudentRowToProfile(row: RowDataPacket): StudentProfilePayload;
export declare function getLegacyStudentProfile(studentId: string): Promise<StudentProfilePayload | null>;
//# sourceMappingURL=studentProfileService.d.ts.map
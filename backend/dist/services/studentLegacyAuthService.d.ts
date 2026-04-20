import type { Pool } from "mysql2/promise";
export type LegacyLoginResult = {
    studentId: string;
    displayName: string;
};
export declare function authenticateLegacyStudent(pool: Pool, studentIdRaw: string, passwordRaw: string): Promise<LegacyLoginResult | null>;
//# sourceMappingURL=studentLegacyAuthService.d.ts.map
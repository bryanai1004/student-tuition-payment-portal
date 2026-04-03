import type { Pool } from "mysql2/promise";
export type LegacyStudentRow = {
    id: string;
    name: string;
};
/**
 * Legacy `students` table: `id` matches portal registration id (e.g. C17310).
 */
export declare function findLegacyStudentById(pool: Pool, studentId: string): Promise<LegacyStudentRow | null>;
/**
 * Stored `password` from legacy `password_stu` (typically MD5 hex; may be plain in edge cases).
 */
export declare function findLegacyStudentPasswordStored(pool: Pool, studentId: string): Promise<string | null>;
//# sourceMappingURL=studentLegacyAuthRepository.d.ts.map
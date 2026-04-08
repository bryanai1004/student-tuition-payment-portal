import type { Pool } from "mysql2/promise";
export type UpsertMarkGradeInput = {
    studentId: string;
    courseCode: string;
    legacyTerm: string;
    year: number;
    grade: string;
    /** Null / non-numeric outcomes use 0 in legacy `grade2` (NOT NULL). */
    grade2Numeric: number | null;
};
/**
 * Updates or inserts one legacy `marks` row for student + course + term + year.
 * Does not touch `portal_enrollments`.
 */
export declare function upsertMarkGrade(pool: Pool, input: UpsertMarkGradeInput): Promise<void>;
//# sourceMappingURL=adminMarksRepository.d.ts.map
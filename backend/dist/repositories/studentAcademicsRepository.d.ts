import type { Pool } from "mysql2/promise";
/**
 * Legacy `marks` (live school DB):
 * - `id` — student key (same as `students.id`, e.g. C17310)
 * - `name` — student display name
 * - `code`, `course_title`, `days`, `time_from`, `time_to`, `instructor`, `term`, `year`, `grade`, `grade2`
 */
/** Same term ordering as registration/accounting: Winter < Spring < Summer < Fall within a year. */
export declare const MARKS_ORDER_BY_NEWEST = "year DESC,\n  CASE UPPER(TRIM(term))\n    WHEN 'FALL' THEN 4\n    WHEN 'SUMMER' THEN 3\n    WHEN 'SPRING' THEN 2\n    WHEN 'WINTER' THEN 1\n    ELSE 0\n  END DESC,\n  TRIM(code) ASC";
export type MarksRow = {
    name: string;
    code: string;
    course_title: string;
    units: number;
    days: string | null;
    time_from: unknown;
    time_to: unknown;
    instructor: string;
    term: string;
    year: number;
    grade: string;
    grade2: unknown;
};
/**
 * All `marks` rows for the student, newest term/year first (then course code).
 */
export declare function listMarksForStudent(pool: Pool, studentId: string): Promise<MarksRow[]>;
/**
 * `marks` rows for one student and quarter (legacy schedule / enrollment-of-record).
 */
export declare function listMarksForStudentTerm(pool: Pool, studentId: string, term: string, year: number): Promise<MarksRow[]>;
/** Display name from legacy `students` when the student has no `marks` rows yet. */
export declare function getLegacyStudentDisplayName(pool: Pool, studentId: string): Promise<string | null>;
//# sourceMappingURL=studentAcademicsRepository.d.ts.map
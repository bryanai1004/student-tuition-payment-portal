/**
 * Read models for **transcript title lookup** (`courses`) and **clinic transcript lines** (`clinic`).
 *
 * - `clinic` rows here feed transcript **display** and attempt-shaped mappers — not academic unit totals for degree audit.
 * - Catalog `courses` map supports normalized English titles only; it is not registration or marks.
 */
import type { Pool } from "mysql2/promise";
export type CourseTranscriptLookupEntry = {
    eng_name: string;
    chi_name: string;
    units: number | null;
};
export type ClinicTranscriptRow = {
    name: string;
    code: string;
    course_title: string;
    units: number;
    hours: number;
    term: string;
    year: number;
    grade: string;
    grade2: unknown;
};
/**
 * Clinical / practice / portfolio transcript rows from legacy `clinic`.
 */
export declare function listClinicRowsForStudent(pool: Pool, studentId: string): Promise<ClinicTranscriptRow[]>;
/**
 * Map TRIM(course code) → English name and units for transcript title resolution.
 */
export declare function loadCoursesTranscriptLookup(pool: Pool): Promise<Map<string, CourseTranscriptLookupEntry>>;
//# sourceMappingURL=studentTranscriptRepository.d.ts.map
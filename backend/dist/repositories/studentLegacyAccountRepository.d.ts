import type { Pool, RowDataPacket } from "mysql2/promise";
/**
 * Legacy MySQL tables (live school DB):
 * - `students.id` — login / account key (e.g. C17310)
 * - `students.name` — display name (often "Last, First")
 * - `registration.id` — joins to `students.id`
 * - `registration.term`, `year`, `total_fees`, `date`
 * - `accounting.id` — same student key as `students.id` / `registration.id`
 * - `accounting.seqNumber` — row PK; `date` is YYYYMMDD int; signed `debit`/`credit` (e.g. refunds as negative debit)
 */
export type LegacyAccountSnapshot = {
    studentId: string;
    displayName: string;
    term: string;
    year: number;
    totalFees: number;
};
/** One ledger row from `accounting` for a student term. */
export type LegacyAccountingRow = {
    seqNumber: number;
    year: number;
    term: string;
    /** Legacy posting date as integer YYYYMMDD. */
    date: number;
    type: string;
    code: string;
    debit: number;
    credit: number;
    memo: string;
};
/**
 * Latest term/year from legacy registration for this student.
 * Order: highest year first, then Fall > Summer > Spring > Winter within the year.
 */
export declare function findLatestLegacyTermYear(pool: Pool, studentId: string): Promise<{
    term: string;
    year: number;
} | null>;
/**
 * Load display name from `students` and financial snapshot from `registration` for one term.
 */
export declare function loadLegacyAccountSnapshot(pool: Pool, studentId: string, term: string, year: number): Promise<LegacyAccountSnapshot | null>;
/** Distinct term/year pairs present in legacy `accounting` for this student. */
export type LegacyAccountingQuarter = {
    term: string;
    year: number;
};
/**
 * List quarters (calendar year + term) that have at least one `accounting` row for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export declare function listLegacyAccountingQuarters(pool: Pool, studentId: string): Promise<LegacyAccountingQuarter[]>;
/**
 * All `accounting` rows for one student (`id`), term, and year (signed debit/credit preserved).
 */
/** Raw row from `students` for profile mapping (column names as returned by MySQL driver). */
export type LegacyStudentProfileRow = RowDataPacket;
/**
 * Load one legacy `students` row by primary key `id` (e.g. C17310).
 */
export declare function loadLegacyStudentProfileRow(pool: Pool, studentId: string): Promise<LegacyStudentProfileRow | null>;
export declare function loadLegacyAccountingRows(pool: Pool, studentId: string, term: string, year: number): Promise<LegacyAccountingRow[]>;
//# sourceMappingURL=studentLegacyAccountRepository.d.ts.map
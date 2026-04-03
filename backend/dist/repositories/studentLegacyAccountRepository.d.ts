import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
/** Pool or a single connection (for transactions). */
export type LegacyMysqlClient = Pool | PoolConnection;
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
 * Distinct term/year pairs from legacy `registration` for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export declare function listLegacyRegistrationTermsForStudent(pool: Pool, studentId: string): Promise<{
    term: string;
    year: number;
}[]>;
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
/** Raw row for admin student list: legacy `students` + latest `registration` term/year. */
export type LegacyAdminStudentListRow = RowDataPacket & {
    id: string;
    name: unknown;
    email: unknown;
    background: unknown;
    requirements_id: unknown;
    tertiary: unknown;
    signed_date: unknown;
    enroll_start_date: unknown;
    latest_term: unknown;
    latest_year: unknown;
};
/**
 * All legacy `students` rows with latest registration term/year (same ordering as
 * `findLatestLegacyTermYear`). Used for the admin student roster.
 */
export declare function listLegacyAdminStudentRows(pool: Pool): Promise<LegacyAdminStudentListRow[]>;
export type LegacyStudentMasterUpdate = {
    name: string;
    email: string;
    gender: string;
    background: string;
    tertiary: string;
    requirements_id: number | null;
    address: string;
    address2: string;
    city: string;
    state: string;
    zip: number;
    signed_date_sql: string;
    enroll_start_sql: string;
};
/**
 * Update safe legacy `students` master columns only. Returns whether a row was updated.
 * Date strings must already be validated SQL `YYYY-MM-DD` or `0000-00-00` for NOT NULL legacy columns.
 */
export declare function updateLegacyStudentMasterRow(pool: Pool, studentId: string, patch: LegacyStudentMasterUpdate): Promise<boolean>;
export type LegacyStudentMasterInsert = {
    studentId: string;
    name: string;
    email: string;
    gender: string;
    requirements_id: number | null;
    tertiary: string;
    background: string;
    signed_date_sql: string;
    enroll_start_sql: string;
    address: string;
    address2: string;
    city: string;
    state: string;
    zip: number;
};
/**
 * Next student id in a division + calendar year + month bucket.
 * Query uses `LIKE 'C174%'` (prefix + YY + month); empty bucket starts at ...01.
 */
export declare function getNextLegacyStudentId(pool: LegacyMysqlClient, division: "Chinese" | "English", entryYear: number, entryMonth: number): Promise<string>;
export declare function legacyStudentMasterExists(pool: LegacyMysqlClient, studentId: string): Promise<boolean>;
export declare function legacyStudentPasswordRowExists(pool: LegacyMysqlClient, studentId: string): Promise<boolean>;
/**
 * Insert one legacy `students` row with safe defaults for columns not exposed in the admin create form.
 */
export declare function createLegacyStudentMasterRow(pool: LegacyMysqlClient, input: LegacyStudentMasterInsert): Promise<void>;
export declare function createLegacyStudentPasswordRow(pool: LegacyMysqlClient, studentId: string, password: string): Promise<void>;
//# sourceMappingURL=studentLegacyAccountRepository.d.ts.map
/**
 * Legacy **financial registration** and accounting (`registration`, `accounting`, `students` profile slices).
 *
 * Domain boundary: these queries anchor **billing term** and ledger rows — not academic attempts (`marks`),
 * not portal course registration (`portal_enrollments`), not transcript or degree audit. Do not treat
 * `registration` as authoritative for grades or earned units.
 */
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
 *
 * `registration` here = legacy **tuition / enrollment term** snapshot for finance, distinct from portal enrollments and marks.
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
/** Columns aligned with admin student profile (`getAdminStudentDetail` / `students` table). */
export type LegacyStudentProfileExportRow = {
    id: string;
    name: string | null;
    gender: string | null;
    email: string | null;
    program: string | null;
    highestDegree: string | null;
    backgroundSchool: string | null;
};
/**
 * Batch-load legacy `students` rows for CSV export (same source as admin profile).
 */
export declare function mapLegacyStudentProfileExportRowsById(pool: Pool, studentIds: string[]): Promise<Map<string, LegacyStudentProfileExportRow>>;
export declare function loadLegacyAccountingRows(pool: Pool, studentId: string, term: string, year: number): Promise<LegacyAccountingRow[]>;
/**
 * Per-student net balance from legacy `accounting` for one quarter:
 * `SUM(debit - credit)` (same sign convention as the finance ledger).
 */
export declare function sumLegacyAccountingBalanceByStudentForQuarter(pool: Pool, term: string, year: number): Promise<Map<string, number>>;
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
export type LegacyAdminStudentListQuery = {
    /** Trimmed search string; matches student id, name, email, and program (`requirements_id`) case-insensitively. */
    search: string;
    /** Temporary admin roster program filter: DAHM = exists in legacy `daim_students_info`; MAHM = not in that set. */
    program: "all" | "dahm" | "mahm";
};
/**
 * Count of students matching the admin roster search (before pagination).
 */
export declare function countLegacyAdminStudentListRows(pool: Pool, query: LegacyAdminStudentListQuery): Promise<number>;
export type LegacyAdminStudentListPageQuery = LegacyAdminStudentListQuery & {
    limit: number;
    offset: number;
};
/**
 * One page of legacy `students` rows with latest registration term/year (admin roster).
 * Search is applied in SQL before `LIMIT` / `OFFSET`.
 */
export declare function listLegacyAdminStudentListRowsPage(pool: Pool, query: LegacyAdminStudentListPageQuery): Promise<LegacyAdminStudentListRow[]>;
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
/** Legacy `password_stu.password` values are MD5 hex (32 chars), matching the school database. */
export declare function legacyStudentPasswordMd5Hex(plainPassword: string): string;
export declare function createLegacyStudentPasswordRow(pool: LegacyMysqlClient, studentId: string, plainPassword: string): Promise<void>;
export declare function hasLegacyStudentRegistration(pool: LegacyMysqlClient, studentId: string): Promise<boolean>;
export declare function hasLegacyStudentAccounting(pool: LegacyMysqlClient, studentId: string): Promise<boolean>;
export declare function hasLegacyStudentMarks(pool: LegacyMysqlClient, studentId: string): Promise<boolean>;
export declare function deleteLegacyStudentPasswordRow(pool: LegacyMysqlClient, studentId: string): Promise<void>;
export declare function deleteLegacyStudentMasterRow(pool: LegacyMysqlClient, studentId: string): Promise<void>;
//# sourceMappingURL=studentLegacyAccountRepository.d.ts.map
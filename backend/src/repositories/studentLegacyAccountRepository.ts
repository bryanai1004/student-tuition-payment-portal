/**
 * Legacy **financial registration** and accounting (`registration`, `accounting`, `students` profile slices).
 *
 * Domain boundary: these queries anchor **billing term** and ledger rows — not academic attempts (`marks`),
 * not portal course registration (`portal_enrollments`), not transcript or degree audit. Do not treat
 * `registration` as authoritative for grades or earned units.
 */

import { createHash } from "node:crypto";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

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

function normalizeTerm(raw: unknown): string {
  return String(raw ?? "").trim();
}

function legacyQuarterOrderSql(termSql: string): string {
  return `CASE UPPER(TRIM(${termSql}))
    WHEN 'FALL' THEN 4
    WHEN 'SUMMER' THEN 3
    WHEN 'SPRING' THEN 2
    WHEN 'WINTER' THEN 1
    ELSE 0
  END`;
}

/**
 * Latest term/year from legacy registration for this student.
 * Order: highest year first, then Fall > Summer > Spring > Winter within the year.
 */
export async function findLatestLegacyTermYear(
  pool: Pool,
  studentId: string,
): Promise<{ term: string; year: number } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(term) AS term, year
     FROM registration
     WHERE id = ?
     ORDER BY year DESC,
      ${legacyQuarterOrderSql("term")} DESC
     LIMIT 1`,
    [studentId],
  );

  if (rows.length === 0) {
    return null;
  }

  const r = rows[0]!;
  return { term: normalizeTerm(r.term), year: Number(r.year) };
}

/**
 * Distinct term/year pairs from legacy `registration` for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export async function listLegacyRegistrationTermsForStudent(
  pool: Pool,
  studentId: string,
): Promise<{ term: string; year: number }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT TRIM(term) AS term, year
     FROM registration
     WHERE id = ?
     ORDER BY year DESC,
      ${legacyQuarterOrderSql("term")} DESC`,
    [studentId],
  );
  return rows.map((r) => ({
    term: normalizeTerm(r.term),
    year: Number(r.year),
  }));
}

/**
 * Load display name from `students` and financial snapshot from `registration` for one term.
 */
export async function loadLegacyAccountSnapshot(
  pool: Pool,
  studentId: string,
  term: string,
  year: number,
): Promise<LegacyAccountSnapshot | null> {
  const [[studentRow]] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name FROM students WHERE id = ? LIMIT 1`,
    [studentId],
  );

  const [regRows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(term) AS term, year, total_fees AS totalFees
     FROM registration
     WHERE id = ?
       AND LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND year = ?
     ORDER BY date DESC
     LIMIT 1`,
    [studentId, term, year],
  );

  if (regRows.length === 0) {
    return null;
  }

  const reg = regRows[0]!;
  const regTerm = normalizeTerm(reg.term);
  const regYear = Number(reg.year);
  const rawName =
    studentRow?.name != null && String(studentRow.name).trim() !== ""
      ? String(studentRow.name).trim()
      : "";
  const displayName = rawName || studentId;
  const totalFees = Number(reg.totalFees);
  const fees = Number.isFinite(totalFees) ? totalFees : 0;

  return {
    studentId,
    displayName,
    term: regTerm,
    year: regYear,
    totalFees: fees,
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Distinct term/year pairs present in legacy `accounting` for this student. */
export type LegacyAccountingQuarter = {
  term: string;
  year: number;
};

/**
 * List quarters (calendar year + term) that have at least one `accounting` row for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export async function listLegacyAccountingQuarters(
  pool: Pool,
  studentId: string,
): Promise<LegacyAccountingQuarter[]> {
  // Inner query: GROUP BY only (MySQL ONLY_FULL_GROUP_BY rejects ORDER BY on raw `term`
  // in the same SELECT as GROUP BY). Outer query orders by normalized `q.term`.
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT q.term, q.year
     FROM (
       SELECT TRIM(term) AS term, year
       FROM accounting
       WHERE id = ?
       GROUP BY TRIM(term), year
     ) AS q
     ORDER BY q.year DESC,
       CASE UPPER(q.term)
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC`,
    [studentId],
  );

  return rows.map((r) => ({
    term: normalizeTerm(r.term),
    year: Math.trunc(num(r.year)),
  }));
}

/**
 * All `accounting` rows for one student (`id`), term, and year (signed debit/credit preserved).
 */
/** Raw row from `students` for profile mapping (column names as returned by MySQL driver). */
export type LegacyStudentProfileRow = RowDataPacket;

/**
 * Load one legacy `students` row by primary key `id` (e.g. C17310).
 */
export async function loadLegacyStudentProfileRow(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<LegacyStudentProfileRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       id,
       name,
       program,
       gender,
       dob,
       signed_date,
       EnrollStartDate,
       ssn,
       visa,
       phone1,
       phone2,
       phone3,
       citizenship,
       marital,
       background,
       admission_credits,
       tertiary,
       race,
       address,
       address2,
       city,
       state,
       zip,
       email,
       requirements_id
     FROM students
     WHERE id = ?
     LIMIT 1`,
    [studentId],
  );

  if (rows.length === 0) {
    return null;
  }
  return rows[0]!;
}

export type LegacyStudentLoaRow = {
  studentId: string;
  absentQuarter: string | null;
  absentYear: number | null;
  returnQuarter: string | null;
  returnYear: number | null;
  reason: string | null;
  hasStuReturned: string | null;
  actualReturn: string | null;
  seqNumber: number | null;
};

function parseLegacyNullableInt(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Latest LOA row for one student from legacy `loa`, matched by trimmed `student_id`.
 * Ordering: absent_year DESC, quarter DESC (Fall > Summer > Spring > Winter), seqNumber DESC.
 */
export async function findLatestLegacyStudentLoaRow(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<LegacyStudentLoaRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       TRIM(student_id) AS student_id,
       TRIM(absent_quarter) AS absent_quarter,
       absent_year,
       TRIM(return_quarter) AS return_quarter,
       return_year,
       TRIM(reasons) AS reasons,
       HasStuReturned,
       actual_return,
       seqNumber
     FROM loa
     WHERE TRIM(student_id) = ?
     ORDER BY
       CAST(NULLIF(TRIM(absent_year), '') AS SIGNED) DESC,
       ${legacyQuarterOrderSql("absent_quarter")} DESC,
       CAST(COALESCE(seqNumber, 0) AS SIGNED) DESC
     LIMIT 1`,
    [studentId.trim()],
  );
  if (rows.length === 0) {
    return null;
  }
  const row = rows[0]!;
  return {
    studentId: normalizeTerm(row.student_id),
    absentQuarter: strCell(row.absent_quarter),
    absentYear: parseLegacyNullableInt(row.absent_year),
    returnQuarter: strCell(row.return_quarter),
    returnYear: parseLegacyNullableInt(row.return_year),
    reason: strCell(row.reasons),
    hasStuReturned: strCell(row.HasStuReturned),
    actualReturn: strCell(row.actual_return),
    seqNumber: parseLegacyNullableInt(row.seqNumber),
  };
}

export type LegacyStudentLoaInsert = {
  studentId: string;
  absentQuarter: string;
  absentYear: number;
  absentStartingDate: string;
  returnQuarter: string;
  returnYear: number;
  returnDate: string;
  reason: string;
};

/** Insert one legacy `loa` row; `seqNumber` remains database-managed. */
export async function createLegacyStudentLoaRow(
  pool: LegacyMysqlClient,
  input: LegacyStudentLoaInsert,
): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO loa (
       student_id,
       absent_quarter,
       absent_year,
       absent_starting_date,
       return_quarter,
       return_year,
       return_date,
       reasons,
       HasStuReturned,
       actual_return
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'N', NULL)`,
    [
      input.studentId.trim(),
      input.absentQuarter,
      input.absentYear,
      input.absentStartingDate,
      input.returnQuarter,
      input.returnYear,
      input.returnDate,
      input.reason,
    ],
  );
  return result.insertId;
}

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

function strCell(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Batch-load legacy `students` rows for CSV export (same source as admin profile).
 */
export async function mapLegacyStudentProfileExportRowsById(
  pool: Pool,
  studentIds: string[],
): Promise<Map<string, LegacyStudentProfileExportRow>> {
  const ids = [
    ...new Set(
      studentIds.map((s) => String(s ?? "").trim()).filter((s) => s !== ""),
    ),
  ];
  const out = new Map<string, LegacyStudentProfileExportRow>();
  if (ids.length === 0) return out;
  const ph = ids.map(() => "?").join(", ");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       TRIM(id) AS id,
       name,
       gender,
       email,
       program,
       tertiary,
       background
     FROM students
     WHERE TRIM(id) IN (${ph})`,
    ids,
  );
  for (const r of rows) {
    const id = strCell(r.id);
    if (id == null) continue;
    const name = strCell(r.name);
    const gender = strCell(r.gender);
    const email = strCell(r.email);
    const program = strCell(r.program);
    const tertiary = strCell(r.tertiary);
    const bg = strCell(r.background);
    out.set(id, {
      id,
      name,
      gender,
      email,
      program,
      highestDegree: tertiary,
      backgroundSchool: bg,
    });
  }
  return out;
}

export async function loadLegacyAccountingRows(
  pool: Pool,
  studentId: string,
  term: string,
  year: number,
): Promise<LegacyAccountingRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT seqNumber, year, TRIM(term) AS term, date, type, code, debit, credit, memo
     FROM accounting
     WHERE id = ?
       AND LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND year = ?
     ORDER BY date ASC, seqNumber ASC`,
    [studentId, term, year],
  );

  return rows.map((r) => ({
    seqNumber: num(r.seqNumber),
    year: num(r.year),
    term: normalizeTerm(r.term),
    date: Math.trunc(num(r.date)),
    type: String(r.type ?? "").trim(),
    code: String(r.code ?? "").trim(),
    debit: num(r.debit),
    credit: num(r.credit),
    memo: String(r.memo ?? "").trim(),
  }));
}

/**
 * Per-student net balance from legacy `accounting` for one quarter:
 * `SUM(debit - credit)` (same sign convention as the finance ledger).
 */
export async function sumLegacyAccountingBalanceByStudentForQuarter(
  pool: Pool,
  term: string,
  year: number,
): Promise<Map<string, number>> {
  const t = term.trim();
  const y = Math.trunc(year);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(id) AS studentId,
            COALESCE(SUM(debit - credit), 0) AS balance
     FROM accounting
     WHERE LOWER(TRIM(term)) = LOWER(TRIM(?))
       AND CAST(year AS SIGNED) = ?
     GROUP BY TRIM(id)`,
    [t, y],
  );
  const out = new Map<string, number>();
  for (const r of rows) {
    const id = String(r.studentId ?? "").trim();
    if (id === "") continue;
    out.set(id, num(r.balance));
  }
  return out;
}

/** Raw row for admin student list: legacy `students` + latest `registration` term/year. */
export type LegacyAdminStudentListRow = RowDataPacket & {
  id: string;
  name: unknown;
  email: unknown;
  status: unknown;
  program: unknown;
  /** Omitted in lightweight roster `SELECT`; mapper treats as empty. */
  background?: unknown;
  requirements_id?: unknown;
  tertiary?: unknown;
  signed_date: unknown;
  enroll_start_date: unknown;
  latest_term: unknown;
  latest_year: unknown;
};

/** Latest registration row per student (same ordering as `findLatestLegacyTermYear`). */
const ADMIN_STUDENT_LIST_LATEST_REG_JOIN = `LEFT JOIN (
       SELECT
         id,
         TRIM(term) AS term,
         year,
         ROW_NUMBER() OVER (
           PARTITION BY id
           ORDER BY year DESC,
            ${legacyQuarterOrderSql("term")} DESC
         ) AS rn
       FROM registration
     ) lr ON lr.id = s.id AND lr.rn = 1`;

/** Escape `%`, `_`, and `\\` for use in a MySQL `LIKE` pattern with `ESCAPE '\\\\'`. */
function escapeMysqlLikePattern(fragment: string): string {
  return fragment
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

export type LegacyAdminStudentListQuery = {
  /** Trimmed search string; matches student id, name, email, and program case-insensitively. */
  search: string;
  /** Admin roster program filter backed by `students.program`. */
  program: "all" | "dahm" | "mahm";
  /** Derived from the first character of `students.id`. */
  track: "all" | "C" | "E";
  /** Derived 4-digit year from `students.id` characters 2-3. */
  entryYear: string | null;
  /** Derived intake code from `students.id` character 4. */
  intakeCode: string | null;
  /** Presence filter backed by legacy `loa` rows. */
  loa: "all" | "yes" | "no";
  /** LOA start quarter from `loa.absent_quarter`. */
  loaQuarter: "Winter" | "Spring" | "Summer" | "Fall" | null;
  /** LOA start year from `loa.absent_year`. */
  loaYear: number | null;
};

const ADMIN_STUDENT_ID_TRIM_SQL = "TRIM(s.id)";
const ADMIN_STUDENT_TRACK_SQL = `CASE
  WHEN s.id IS NOT NULL AND CHAR_LENGTH(${ADMIN_STUDENT_ID_TRIM_SQL}) >= 4
    THEN UPPER(LEFT(${ADMIN_STUDENT_ID_TRIM_SQL}, 1))
  ELSE NULL
END`;
const ADMIN_STUDENT_ENTRY_YEAR_SQL = `CASE
  WHEN s.id IS NOT NULL
    AND CHAR_LENGTH(${ADMIN_STUDENT_ID_TRIM_SQL}) >= 4
    AND SUBSTRING(${ADMIN_STUDENT_ID_TRIM_SQL}, 2, 2) REGEXP '^[0-9]{2}$'
    THEN CONCAT('20', SUBSTRING(${ADMIN_STUDENT_ID_TRIM_SQL}, 2, 2))
  ELSE NULL
END`;
const ADMIN_STUDENT_INTAKE_CODE_SQL = `CASE
  WHEN s.id IS NOT NULL AND CHAR_LENGTH(${ADMIN_STUDENT_ID_TRIM_SQL}) >= 4
    THEN UPPER(SUBSTRING(${ADMIN_STUDENT_ID_TRIM_SQL}, 4, 1))
  ELSE NULL
END`;

function buildAdminStudentProgramClause(
  program: LegacyAdminStudentListQuery["program"],
): string {
  switch (program) {
    case "dahm":
      return `UPPER(TRIM(s.program)) = 'DAHM'`;
    case "mahm":
      return `UPPER(TRIM(s.program)) = 'MAHM'`;
    default:
      return "";
  }
}

function buildAdminStudentTrackClause(
  track: LegacyAdminStudentListQuery["track"],
): string {
  switch (track) {
    case "C":
    case "E":
      return `${ADMIN_STUDENT_TRACK_SQL} = '${track}'`;
    default:
      return "";
  }
}

function buildAdminStudentLoaPresenceClause(
  loa: LegacyAdminStudentListQuery["loa"],
): string {
  switch (loa) {
    case "yes":
      return `EXISTS (
        SELECT 1
        FROM loa
        WHERE TRIM(loa.student_id) = TRIM(s.id)
      )`;
    case "no":
      return `NOT EXISTS (
        SELECT 1
        FROM loa
        WHERE TRIM(loa.student_id) = TRIM(s.id)
      )`;
    default:
      return "";
  }
}

function buildAdminStudentListFilters(
  query: LegacyAdminStudentListQuery,
): { clause: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  const searchTrimmed = query.search.trim();
  if (searchTrimmed !== "") {
    const like = `%${escapeMysqlLikePattern(searchTrimmed.toLowerCase())}%`;
    clauses.push(`(
      LOWER(TRIM(s.id)) LIKE ? ESCAPE '\\\\'
      OR LOWER(COALESCE(s.name, '')) LIKE ? ESCAPE '\\\\'
      OR LOWER(COALESCE(s.email, '')) LIKE ? ESCAPE '\\\\'
      OR LOWER(TRIM(COALESCE(s.program, ''))) LIKE ? ESCAPE '\\\\'
    )`);
    params.push(like, like, like, like);
  }
  const programClause = buildAdminStudentProgramClause(query.program);
  if (programClause !== "") {
    clauses.push(programClause);
  }
  const trackClause = buildAdminStudentTrackClause(query.track);
  if (trackClause !== "") {
    clauses.push(trackClause);
  }
  const loaPresenceClause = buildAdminStudentLoaPresenceClause(query.loa);
  if (loaPresenceClause !== "") {
    clauses.push(loaPresenceClause);
  }
  if (query.entryYear != null) {
    clauses.push(`${ADMIN_STUDENT_ENTRY_YEAR_SQL} = ?`);
    params.push(query.entryYear);
  }
  if (query.intakeCode != null) {
    clauses.push(`${ADMIN_STUDENT_INTAKE_CODE_SQL} = ?`);
    params.push(query.intakeCode);
  }
  if (query.loaQuarter != null && query.loaYear != null) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM loa
      WHERE TRIM(loa.student_id) = TRIM(s.id)
        AND UPPER(TRIM(loa.absent_quarter)) = UPPER(?)
        AND CAST(NULLIF(TRIM(loa.absent_year), '') AS SIGNED) = ?
    )`);
    params.push(query.loaQuarter, query.loaYear);
  }
  if (clauses.length === 0) {
    return { clause: "", params };
  }
  return {
    clause: ` WHERE ${clauses.join("\n AND ")}`,
    params,
  };
}

/**
 * Count of students matching the admin roster search (before pagination).
 */
export async function countLegacyAdminStudentListRows(
  pool: Pool,
  query: LegacyAdminStudentListQuery,
): Promise<number> {
  const { clause, params } = buildAdminStudentListFilters(query);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM students s
     ${clause}`,
    params,
  );
  const row = rows[0];
  if (row == null) return 0;
  const n = Number((row as { cnt?: unknown }).cnt);
  return Number.isFinite(n) ? n : 0;
}

/** Roster list: only columns needed for the admin table + enrollment metadata derived from `id`. */
const ADMIN_STUDENT_LIST_SELECT_SQL = `SELECT
       TRIM(s.id) AS id,
       s.name,
       s.email,
       NULLIF(TRIM(s.status), '') AS status,
       TRIM(s.program) AS program,
       s.signed_date,
       s.EnrollStartDate AS enroll_start_date,
       lr.term AS latest_term,
       lr.year AS latest_year
     FROM students s
     ${ADMIN_STUDENT_LIST_LATEST_REG_JOIN}`;

export type LegacyAdminStudentListPageQuery = LegacyAdminStudentListQuery & {
  limit: number;
  offset: number;
};

/**
 * One page of legacy `students` rows with latest registration term/year (admin roster).
 * Search is applied in SQL before `LIMIT` / `OFFSET`.
 */
export async function listLegacyAdminStudentListRowsPage(
  pool: Pool,
  query: LegacyAdminStudentListPageQuery,
): Promise<LegacyAdminStudentListRow[]> {
  const { clause, params } = buildAdminStudentListFilters(query);
  const limit = Math.max(0, Math.trunc(query.limit));
  const offset = Math.max(0, Math.trunc(query.offset));
  const [rows] = await pool.query<LegacyAdminStudentListRow[]>(
    `${ADMIN_STUDENT_LIST_SELECT_SQL}
     ${clause}
     ORDER BY s.name ASC, s.id ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows;
}

/**
 * Full admin roster result set for the same search/program filters as the paginated list.
 */
export async function listLegacyAdminStudentListRows(
  pool: Pool,
  query: LegacyAdminStudentListQuery,
): Promise<LegacyAdminStudentListRow[]> {
  const { clause, params } = buildAdminStudentListFilters(query);
  const [rows] = await pool.query<LegacyAdminStudentListRow[]>(
    `${ADMIN_STUDENT_LIST_SELECT_SQL}
     ${clause}
     ORDER BY s.name ASC, s.id ASC`,
    params,
  );
  return rows;
}

export type LegacyAdminStudentEnrollmentFacetRow = RowDataPacket & {
  entry_year: string | null;
  intake_code: string | null;
};

export async function listLegacyAdminStudentEnrollmentFacetRows(
  pool: Pool,
  query: LegacyAdminStudentListQuery,
): Promise<LegacyAdminStudentEnrollmentFacetRow[]> {
  const { clause, params } = buildAdminStudentListFilters(query);
  const [rows] = await pool.query<LegacyAdminStudentEnrollmentFacetRow[]>(
    `SELECT DISTINCT
       ${ADMIN_STUDENT_ENTRY_YEAR_SQL} AS entry_year,
       ${ADMIN_STUDENT_INTAKE_CODE_SQL} AS intake_code
     FROM students s
     ${clause}
     ORDER BY entry_year DESC, intake_code ASC`,
    params,
  );
  return rows;
}

export type LegacyAdminStudentLoaTermFacetRow = RowDataPacket & {
  absent_quarter: string | null;
  absent_year: number | null;
};

export async function listLegacyAdminStudentLoaTermFacetRows(
  pool: Pool,
  query: LegacyAdminStudentListQuery,
): Promise<LegacyAdminStudentLoaTermFacetRow[]> {
  const { clause, params } = buildAdminStudentListFilters(query);
  const [rows] = await pool.query<LegacyAdminStudentLoaTermFacetRow[]>(
    `SELECT DISTINCT
       TRIM(l.absent_quarter) AS absent_quarter,
       CAST(NULLIF(TRIM(l.absent_year), '') AS SIGNED) AS absent_year
     FROM loa l
     INNER JOIN students s
       ON TRIM(l.student_id) = TRIM(s.id)
     ${clause}
     HAVING absent_quarter IS NOT NULL
       AND absent_quarter <> ''
       AND absent_year IS NOT NULL
     ORDER BY absent_year DESC,
       ${legacyQuarterOrderSql("absent_quarter")} ASC`,
    params,
  );
  return rows;
}

/**
 * Export rows for an explicit student selection, sorted by student id for stable CSV output.
 */
export async function listLegacyAdminStudentListRowsByStudentIds(
  pool: Pool,
  studentIds: readonly string[],
): Promise<LegacyAdminStudentListRow[]> {
  const normalized = Array.from(
    new Set(
      studentIds
        .map((studentId) => studentId.trim())
        .filter((studentId) => studentId !== ""),
    ),
  );
  if (normalized.length === 0) return [];
  const placeholders = normalized.map(() => "?").join(", ");
  const [rows] = await pool.query<LegacyAdminStudentListRow[]>(
    `${ADMIN_STUDENT_LIST_SELECT_SQL}
     WHERE TRIM(s.id) IN (${placeholders})
     ORDER BY TRIM(s.id) ASC`,
    normalized,
  );
  return rows;
}

export type LegacyStudentMasterUpdate = {
  name: string;
  email: string;
  program: string;
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
  ssn: string;
  visa: string;
  dob_sql: string;
  phone1: string;
  phone2: string;
  phone3: string;
  citizenship: string;
  race: string;
  marital: string;
};

/**
 * Update safe legacy `students` master columns only. Returns whether a row was updated.
 * Date strings must already be validated SQL `YYYY-MM-DD` or `0000-00-00` for NOT NULL legacy columns.
 */
export async function updateLegacyStudentMasterRow(
  pool: Pool,
  studentId: string,
  patch: LegacyStudentMasterUpdate,
): Promise<boolean> {
  const [result] = await pool.execute(
    `UPDATE students SET
       name = ?,
       email = ?,
       program = ?,
       gender = ?,
       background = ?,
       tertiary = ?,
       requirements_id = ?,
       address = ?,
       address2 = ?,
       city = ?,
       state = ?,
       zip = ?,
       signed_date = ?,
       EnrollStartDate = ?,
       ssn = ?,
       visa = ?,
       dob = ?,
       phone1 = ?,
       phone2 = ?,
       phone3 = ?,
       citizenship = ?,
       race = ?,
       marital = ?
     WHERE id = ?`,
    [
      patch.name,
      patch.email,
      patch.program,
      patch.gender,
      patch.background,
      patch.tertiary,
      patch.requirements_id,
      patch.address,
      patch.address2,
      patch.city,
      patch.state,
      patch.zip,
      patch.signed_date_sql,
      patch.enroll_start_sql,
      patch.ssn,
      patch.visa,
      patch.dob_sql,
      patch.phone1,
      patch.phone2,
      patch.phone3,
      patch.citizenship,
      patch.race,
      patch.marital,
      studentId,
    ],
  );
  const header = result as { affectedRows?: number };
  return (header.affectedRows ?? 0) > 0;
}

export type LegacyStudentMasterInsert = {
  studentId: string;
  name: string;
  email: string;
  program: string;
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
 * Legacy id: [C|E][YY][M][NN] — month M is 1–12 without leading zero; NN is 2-digit sequence in that bucket.
 * Parses sequence as the last two characters; month is the substring between YY and NN.
 */
function parseSequenceFromLegacyStudentId(
  id: string,
  head: string,
  expectedMonthStr: string,
): number | null {
  const trimmed = id.trim();
  if (trimmed.length < head.length + 3) return null;
  if (!trimmed.toUpperCase().startsWith(head.toUpperCase())) return null;
  const rest = trimmed.slice(head.length);
  if (rest.length < 3) return null;
  const seqStr = rest.slice(-2);
  const monthStr = rest.slice(0, -2);
  if (monthStr !== expectedMonthStr) return null;
  const month = Number.parseInt(monthStr, 10);
  const seq = Number.parseInt(seqStr, 10);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (!Number.isFinite(seq) || seq < 1 || seq > 99) return null;
  if (String(month) !== monthStr) return null;
  return seq;
}

/**
 * Next student id in a division + calendar year + month bucket.
 * Query uses `LIKE 'C174%'` (prefix + YY + month); empty bucket starts at ...01.
 */
export async function getNextLegacyStudentId(
  pool: LegacyMysqlClient,
  division: "Chinese" | "English",
  entryYear: number,
  entryMonth: number,
): Promise<string> {
  const letter = division === "Chinese" ? "C" : "E";
  const y = Math.trunc(entryYear);
  const m = Math.trunc(entryMonth);
  if (m < 1 || m > 12) {
    throw new Error("Entry month must be between 1 and 12.");
  }
  const year2 = String(((y % 100) + 100) % 100).padStart(2, "0");
  const monthStr = String(m);
  const head = `${letter}${year2}`;
  /** Anchored match so month `1` does not pick up `C1710…` (October) rows. */
  const regexpPattern = `^${head}${monthStr}[0-9]{2}$`;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(id) AS id
     FROM students
     WHERE TRIM(id) REGEXP ?`,
    [regexpPattern],
  );

  let maxSeq = 0;
  for (const row of rows) {
    const rawId = row?.id != null ? String(row.id).trim() : "";
    if (rawId === "") continue;
    const seq = parseSequenceFromLegacyStudentId(rawId, head, monthStr);
    if (seq != null && seq > maxSeq) maxSeq = seq;
  }

  const nextSeq = maxSeq + 1;
  if (nextSeq > 99) {
    throw new Error(
      `Legacy student id sequence overflow for ${head}${monthStr} (max 99).`,
    );
  }

  return `${head}${monthStr}${String(nextSeq).padStart(2, "0")}`;
}

export async function legacyStudentMasterExists(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM students WHERE id = ? LIMIT 1`,
    [studentId],
  );
  return rows.length > 0;
}

export async function getLegacyStudentPhotoPath(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT photo_path
     FROM students
     WHERE id = ?
     LIMIT 1`,
    [studentId.trim()],
  );
  if (rows.length === 0) return null;
  const raw = rows[0]?.photo_path;
  if (raw == null) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

export async function updateLegacyStudentPhotoPath(
  pool: LegacyMysqlClient,
  studentId: string,
  photoPath: string | null,
): Promise<boolean> {
  const [result] = await pool.execute(
    `UPDATE students
     SET photo_path = ?
     WHERE id = ?`,
    [photoPath, studentId.trim()],
  );
  const header = result as { affectedRows?: number };
  return (header.affectedRows ?? 0) > 0;
}

export async function legacyStudentPasswordRowExists(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM password_stu WHERE id = ? LIMIT 1`,
    [studentId],
  );
  return rows.length > 0;
}

/**
 * Insert one legacy `students` row with safe defaults for columns not exposed in the admin create form.
 */
export async function createLegacyStudentMasterRow(
  pool: LegacyMysqlClient,
  input: LegacyStudentMasterInsert,
): Promise<void> {
  await pool.execute(
    `INSERT INTO students (
       name, alias, id, dob,
       address, address2, city, state, zip, country, ssn,
       gender, race, status,
       phone1, phone2, phone3, email,
       background, tertiary, visa,
       regis_fee, clinic_fee, admission_credits,
       notes, cpr, toefl, exam, level1exam, level2exam, level3exam, cnt,
       hold, signed_date, grad_date, grad_term, grad_year, withdraw_date,
       required_units_to_grad, marital, citizenship,
       EnrollStartDate, requirements_id, program, financial_aid, grad_check_out,
       cale_license, cale_date, level1practice
     ) VALUES (
       ?, '', ?, '0000-00-00',
       ?, ?, ?, ?, ?, '', '',
       ?, '', '',
       '', '', '', ?,
       ?, ?, '',
       0, 0, 0,
       '', '', '', '', '', '', '', '',
       0, ?, '0000-00-00', '-', 0, '0000-00-00',
       0, '', '',
       ?, ?, ?, 0, 0,
       NULL, '0000-00-00', ''
     )`,
    [
      input.name,
      input.studentId,
      input.address,
      input.address2,
      input.city,
      input.state,
      input.zip,
      input.gender,
      input.email,
      input.background,
      input.tertiary,
      input.signed_date_sql,
      input.enroll_start_sql,
      input.requirements_id,
      input.program,
    ],
  );
}

/** Legacy `password_stu.password` values are MD5 hex (32 chars), matching the school database. */
export function legacyStudentPasswordMd5Hex(plainPassword: string): string {
  return createHash("md5").update(plainPassword, "utf8").digest("hex");
}

export async function createLegacyStudentPasswordRow(
  pool: LegacyMysqlClient,
  studentId: string,
  plainPassword: string,
): Promise<void> {
  const hash = legacyStudentPasswordMd5Hex(plainPassword);
  await pool.execute(`INSERT INTO password_stu (id, password) VALUES (?, ?)`, [
    studentId,
    hash,
  ]);
}

export async function hasLegacyStudentRegistration(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM registration WHERE TRIM(id) = ? LIMIT 1`,
    [studentId.trim()],
  );
  return rows.length > 0;
}

export async function hasLegacyStudentAccounting(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM accounting WHERE TRIM(id) = ? LIMIT 1`,
    [studentId.trim()],
  );
  return rows.length > 0;
}

export async function hasLegacyStudentMarks(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM marks WHERE TRIM(id) = ? LIMIT 1`,
    [studentId.trim()],
  );
  return rows.length > 0;
}

export async function deleteLegacyStudentPasswordRow(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<void> {
  await pool.execute(`DELETE FROM password_stu WHERE TRIM(id) = ?`, [
    studentId.trim(),
  ]);
}

export async function deleteLegacyStudentMasterRow(
  pool: LegacyMysqlClient,
  studentId: string,
): Promise<void> {
  await pool.execute(`DELETE FROM students WHERE id = ?`, [studentId.trim()]);
}

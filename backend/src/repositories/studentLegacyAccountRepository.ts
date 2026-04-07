import { createHash } from "node:crypto";
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

function normalizeTerm(raw: unknown): string {
  return String(raw ?? "").trim();
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
       CASE UPPER(TRIM(term))
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC
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
       CASE UPPER(TRIM(term))
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
  pool: Pool,
  studentId: string,
): Promise<LegacyStudentProfileRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       id,
       name,
       gender,
       dob,
       signed_date,
       EnrollStartDate,
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
export async function listLegacyAdminStudentRows(
  pool: Pool,
): Promise<LegacyAdminStudentListRow[]> {
  const [rows] = await pool.query<LegacyAdminStudentListRow[]>(
    `SELECT
       TRIM(s.id) AS id,
       s.name,
       s.email,
       s.background,
       s.requirements_id,
       s.tertiary,
       s.signed_date,
       s.EnrollStartDate AS enroll_start_date,
       lr.term AS latest_term,
       lr.year AS latest_year
     FROM students s
     LEFT JOIN (
       SELECT
         id,
         TRIM(term) AS term,
         year,
         ROW_NUMBER() OVER (
           PARTITION BY id
           ORDER BY year DESC,
             CASE UPPER(TRIM(term))
               WHEN 'FALL' THEN 4
               WHEN 'SUMMER' THEN 3
               WHEN 'SPRING' THEN 2
               WHEN 'WINTER' THEN 1
               ELSE 0
             END DESC
         ) AS rn
       FROM registration
     ) lr ON lr.id = s.id AND lr.rn = 1
     ORDER BY s.name ASC, s.id ASC`,
  );
  return rows;
}

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
export async function updateLegacyStudentMasterRow(
  pool: Pool,
  studentId: string,
  patch: LegacyStudentMasterUpdate,
): Promise<boolean> {
  const [result] = await pool.execute(
    `UPDATE students SET
       name = ?,
       email = ?,
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
       EnrollStartDate = ?
     WHERE id = ?`,
    [
      patch.name,
      patch.email,
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
       EnrollStartDate, requirements_id, financial_aid, grad_check_out,
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
       ?, ?, 0, 0,
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

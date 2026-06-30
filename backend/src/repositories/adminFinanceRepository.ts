import { type ResultSetHeader, type RowDataPacket, type Pool, type PoolConnection } from "../lib/db.js";
import { isUniqueViolation } from "../lib/dbErrors.js";

/** Pool or transaction connection for inserts. */
export type PortalBillingSqlExecutor = Pool | PoolConnection;

export type PortalBillingCategory = "tuition" | "clinical" | "fees" | "other" | "exam";

function termSortOrder(term: string): number {
  switch (term.trim().toUpperCase()) {
    case "FALL":
      return 4;
    case "SUMMER":
      return 3;
    case "SPRING":
      return 2;
    case "WINTER":
      return 1;
    default:
      return 0;
  }
}

export const LATE_FEE_DESCRIPTION = "Late Payment Fee";

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export type FinanceRosterRow = {
  studentId: string;
  name: string;
};

/** Balance sign filter for admin finance roster (applied in the service after merged balances). */
export type AdminFinanceRosterBalanceFilter =
  | "all"
  | "positive"
  | "negative"
  | "zero";

/** Roster population: all legacy students vs those with finance activity in the selected quarter. */
export type AdminFinanceRosterScope = "quarter" | "all";

export type AdminFinanceRosterQuery = {
  searchTrimmed: string;
  rosterScope: AdminFinanceRosterScope;
  term: string;
  year: number;
};

function buildFinanceRosterQuarterJoin(
  rosterScope: AdminFinanceRosterScope,
  term: string,
  year: number,
): { joinClause: string; params: Array<string | number> } {
  if (rosterScope === "all") {
    return { joinClause: "", params: [] };
  }
  const t = term.trim();
  const y = Math.trunc(year);
  return {
    joinClause: ` INNER JOIN (
      SELECT DISTINCT TRIM(student_id) AS student_id FROM (
        SELECT TRIM(student_external_id) AS student_id
        FROM portal_enrollments
        WHERE term = ? AND year = ?
        UNION
        SELECT TRIM(student_external_id) AS student_id
        FROM portal_billing_adjustments
        WHERE term = ? AND year = ?
        UNION
        SELECT TRIM(student_external_id) AS student_id
        FROM portal_payments
        WHERE term = ? AND year = ?
        UNION
        SELECT TRIM(id) AS student_id
        FROM accounting
        WHERE LOWER(TRIM(term)) = LOWER(TRIM(?))
          AND year = ?
      ) q
      WHERE TRIM(COALESCE(student_id, '')) <> ''
    ) qa ON qa.student_id = r.student_id`,
    params: [t, y, t, y, t, y, t, y],
  };
}

function buildFinanceRosterSearchClause(
  searchTrimmed: string,
): { clause: string; params: string[] } {
  if (searchTrimmed === "") {
    return { clause: "", params: [] };
  }
  const needle = searchTrimmed.toLowerCase();
  return {
    clause: ` AND (
      POSITION(? IN LOWER(r.student_id)) > 0
      OR POSITION(? IN LOWER(r.display_name)) > 0
    )`,
    params: [needle, needle],
  };
}

const ADMIN_FINANCE_ROSTER_BASE_SQL = `WITH roster AS (
    SELECT TRIM(s.id) AS student_id,
           CASE
             WHEN TRIM(COALESCE(s.name, '')) = '' THEN TRIM(s.id)
             ELSE TRIM(s.name)
           END AS display_name
    FROM students s
    UNION ALL
    SELECT ps.student_external_id AS student_id,
           CASE
             WHEN TRIM(COALESCE(ps.full_name, '')) = '' THEN ps.student_external_id
             ELSE TRIM(ps.full_name)
           END AS display_name
    FROM portal_students ps
    LEFT JOIN students s ON TRIM(s.id) = ps.student_external_id
    WHERE s.id IS NULL
  )`;

export type AdminFinanceRosterStudentRow = {
  studentId: string;
  name: string;
};

/** @deprecated Use {@link AdminFinanceRosterStudentRow} */
export type AdminFinanceRosterPageRow = AdminFinanceRosterStudentRow;

/**
 * Count of finance roster rows after search only (balance filters run in the service).
 */
export async function countAdminFinanceRosterSearchOnly(
  pool: Pool,
  params: AdminFinanceRosterQuery,
): Promise<number> {
  const { clause: searchClause, params: searchParams } =
    buildFinanceRosterSearchClause(params.searchTrimmed);
  const { joinClause, params: joinParams } = buildFinanceRosterQuarterJoin(
    params.rosterScope,
    params.term,
    params.year,
  );
  const sql = `${ADMIN_FINANCE_ROSTER_BASE_SQL}
    SELECT COUNT(*) AS cnt
    FROM roster r
    ${joinClause}
    WHERE 1 = 1
    ${searchClause}`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [
    ...joinParams,
    ...searchParams,
  ]);
  const row = rows[0];
  if (row == null) return 0;
  const n = Number((row as { cnt?: unknown }).cnt);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One page of finance roster (student id + name) after search; stable name / id ordering.
 */
export async function listAdminFinanceRosterPageSearchOnly(
  pool: Pool,
  params: AdminFinanceRosterQuery & {
    limit: number;
    offset: number;
  },
): Promise<AdminFinanceRosterStudentRow[]> {
  const limit = Math.max(0, Math.trunc(params.limit));
  const offset = Math.max(0, Math.trunc(params.offset));
  const { clause: searchClause, params: searchParams } =
    buildFinanceRosterSearchClause(params.searchTrimmed);
  const { joinClause, params: joinParams } = buildFinanceRosterQuarterJoin(
    params.rosterScope,
    params.term,
    params.year,
  );
  const sql = `${ADMIN_FINANCE_ROSTER_BASE_SQL}
    SELECT r.student_id AS studentId,
           r.display_name AS name
    FROM roster r
    ${joinClause}
    WHERE 1 = 1
    ${searchClause}
    ORDER BY r.display_name ASC, r.student_id ASC
    LIMIT ? OFFSET ?`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [
    ...joinParams,
    ...searchParams,
    limit,
    offset,
  ]);
  return rows.map((r) => ({
    studentId: str(r.studentId),
    name: str(r.name),
  }));
}

/** Full roster after search (ordered), used when applying balance filters before pagination. */
export async function listAdminFinanceRosterAllSearchOnlyOrdered(
  pool: Pool,
  params: AdminFinanceRosterQuery,
): Promise<AdminFinanceRosterStudentRow[]> {
  const { clause: searchClause, params: searchParams } =
    buildFinanceRosterSearchClause(params.searchTrimmed);
  const { joinClause, params: joinParams } = buildFinanceRosterQuarterJoin(
    params.rosterScope,
    params.term,
    params.year,
  );
  const sql = `${ADMIN_FINANCE_ROSTER_BASE_SQL}
    SELECT r.student_id AS studentId,
           r.display_name AS name
    FROM roster r
    ${joinClause}
    WHERE 1 = 1
    ${searchClause}
    ORDER BY r.display_name ASC, r.student_id ASC`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [
    ...joinParams,
    ...searchParams,
  ]);
  return rows.map((r) => ({
    studentId: str(r.studentId),
    name: str(r.name),
  }));
}

/** `SUM(amount)` of `portal_billing_adjustments` per student for a quarter (signed; matches ledger adjustment lines). */
export async function sumPortalBillingAdjustmentsNetByStudentForQuarter(
  pool: Pool,
  term: string,
  year: number,
): Promise<Map<string, number>> {
  const t = term.trim();
  const y = Math.trunc(year);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(student_external_id) AS studentId,
            COALESCE(SUM(amount), 0) AS net
     FROM portal_billing_adjustments
     WHERE term = ? AND year = ?
     GROUP BY TRIM(student_external_id)`,
    [t, y],
  );
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = str(r.studentId);
    if (id === "") continue;
    const n = Number((r as { net?: unknown }).net);
    m.set(id, Number.isFinite(n) ? n : 0);
  }
  return m;
}

/** Total `portal_payments.amount` per student for a quarter (amounts stored as positive credits). */
export async function sumPortalPaymentsByStudentForQuarter(
  pool: Pool,
  term: string,
  year: number,
): Promise<Map<string, number>> {
  const t = term.trim();
  const y = Math.trunc(year);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(student_external_id) AS studentId,
            COALESCE(SUM(amount), 0) AS paid
     FROM portal_payments
     WHERE term = ? AND year = ?
     GROUP BY TRIM(student_external_id)`,
    [t, y],
  );
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = str(r.studentId);
    if (id === "") continue;
    const n = Number((r as { paid?: unknown }).paid);
    m.set(id, Number.isFinite(n) ? n : 0);
  }
  return m;
}

/**
 * Legacy `students` roster plus `portal_students` rows that are not yet in `students`
 * (same external id key used across portal billing tables).
 */
export async function listFinanceRosterRows(pool: Pool): Promise<FinanceRosterRow[]> {
  const [legacyRows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(s.id) AS studentId, s.name AS name
     FROM students s`,
  );

  const byId = new Map<string, string>();
  for (const r of legacyRows) {
    const studentId = str(r.studentId);
    if (studentId === "") continue;
    const nameRaw = str(r.name);
    byId.set(studentId, nameRaw.length > 0 ? nameRaw : studentId);
  }

  const [portalRows] = await pool.query<RowDataPacket[]>(
    `SELECT ps.student_external_id AS studentId, ps.full_name AS name
     FROM portal_students ps
     LEFT JOIN students s ON TRIM(s.id) = ps.student_external_id
     WHERE s.id IS NULL`,
  );

  for (const r of portalRows) {
    const studentId = str(r.studentId);
    if (studentId === "") continue;
    if (byId.has(studentId)) continue;
    const nameRaw = str(r.name);
    byId.set(studentId, nameRaw.length > 0 ? nameRaw : studentId);
  }

  return [...byId.entries()]
    .map(([studentId, name]) => ({ studentId, name }))
    .sort((a, b) => {
      const c = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (c !== 0) return c;
      return a.studentId.localeCompare(b.studentId, undefined, {
        sensitivity: "base",
      });
    });
}

function quarterDedupeKey(term: string, year: number): string {
  return `${Math.trunc(year)}:${term.trim().toLowerCase()}`;
}

/**
 * All term/year pairs that appear anywhere in finance-related tables (newest first).
 */
export async function listGlobalFinanceQuarters(
  pool: Pool,
): Promise<{ term: string; year: number }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT term, year FROM (
       SELECT DISTINCT
         TRIM(COALESCE(term, '')) AS term,
         CAST(year AS INTEGER) AS year
       FROM portal_enrollments
       UNION
       SELECT DISTINCT
         TRIM(COALESCE(term, '')) AS term,
         CAST(year AS INTEGER) AS year
       FROM portal_billing_adjustments
       UNION
       SELECT DISTINCT
         TRIM(COALESCE(term, '')) AS term,
         CAST(year AS INTEGER) AS year
       FROM portal_payments
       UNION
       SELECT DISTINCT
         TRIM(COALESCE(term, '')) AS term,
         CAST(year AS INTEGER) AS year
       FROM registration
       UNION
       SELECT DISTINCT
         TRIM(COALESCE(term, '')) AS term,
         CAST(year AS INTEGER) AS year
       FROM accounting
       UNION
       SELECT DISTINCT
         TRIM(COALESCE(term_name, '')) AS term,
         CAST(year AS INTEGER) AS year
       FROM academic_terms
     ) q
     WHERE TRIM(term) <> ''`,
  );

  const byKey = new Map<string, { term: string; year: number }>();
  for (const r of rows) {
    const term = str(r.term);
    const year = Number(r.year);
    if (term === "" || !Number.isFinite(year)) continue;
    const k = quarterDedupeKey(term, year);
    if (!byKey.has(k)) {
      byKey.set(k, { term, year: Math.trunc(year) });
    }
  }

  return [...byKey.values()].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return termSortOrder(b.term) - termSortOrder(a.term);
  });
}

let cachedAcademicTermsPaymentDueDateColumn: boolean | null = null;

/**
 * Detects optional `academic_terms.payment_due_date` without migrations.
 * Cached for the process lifetime.
 */
export async function academicTermsPaymentDueDateColumnExists(
  pool: Pool,
): Promise<boolean> {
  if (cachedAcademicTermsPaymentDueDateColumn !== null) {
    return cachedAcademicTermsPaymentDueDateColumn;
  }
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE table_schema = 'public'
         AND table_name = 'academic_terms'
         AND COLUMN_NAME = 'payment_due_date'`,
    );
    cachedAcademicTermsPaymentDueDateColumn = Number(rows[0]?.c) > 0;
  } catch {
    cachedAcademicTermsPaymentDueDateColumn = false;
  }
  return cachedAcademicTermsPaymentDueDateColumn;
}

function paymentDueDateFromDbValue(due: unknown): string | null {
  if (due == null) return null;
  if (due instanceof Date) {
    return due.toISOString().slice(0, 10);
  }
  if (typeof due === "string" && due.trim() !== "") {
    return due.trim().slice(0, 10);
  }
  return null;
}

/** Payment DDL and whether a matching `academic_terms` row exists for this finance quarter. */
export async function getFinanceQuarterDdlFromAcademicTerms(
  pool: Pool,
  term: string,
  year: number,
): Promise<{ paymentDueDate: string | null; rowExists: boolean }> {
  const t = term.trim();
  const y = Math.trunc(year);
  const [existRows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM academic_terms
     WHERE LOWER(TRIM(term_name)) = LOWER(TRIM(?)) AND year = ?
     LIMIT 1`,
    [t, y],
  );
  const rowExists = existRows.length > 0;
  const hasCol = await academicTermsPaymentDueDateColumnExists(pool);
  if (!hasCol) {
    return { paymentDueDate: null, rowExists };
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT payment_due_date AS paymentDueDate FROM academic_terms
     WHERE LOWER(TRIM(term_name)) = LOWER(TRIM(?)) AND year = ?
     LIMIT 1`,
    [t, y],
  );
  const r = rows[0];
  if (!r) {
    return { paymentDueDate: null, rowExists };
  }
  return {
    paymentDueDate: paymentDueDateFromDbValue(r.paymentDueDate),
    rowExists,
  };
}

export type SetFinanceQuarterDdlResult = "ok" | "no_column" | "not_found";

export async function setFinanceQuarterDdlOnAcademicTerms(
  pool: Pool,
  term: string,
  year: number,
  paymentDueDate: string | null,
): Promise<SetFinanceQuarterDdlResult> {
  const hasCol = await academicTermsPaymentDueDateColumnExists(pool);
  if (!hasCol) return "no_column";
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE academic_terms SET payment_due_date = ?
     WHERE LOWER(TRIM(term_name)) = LOWER(TRIM(?)) AND year = ?`,
    [paymentDueDate, term.trim(), Math.trunc(year)],
  );
  const affected = res.affectedRows ?? 0;
  if (affected === 0) return "not_found";
  return "ok";
}

/** Students with any portal billing activity for the term (late fee candidates). */
export async function listStudentIdsWithPortalQuarterActivity(
  pool: Pool,
  term: string,
  year: number,
): Promise<string[]> {
  const t = term.trim();
  const y = Math.trunc(year);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT student_external_id AS studentId FROM (
       SELECT student_external_id FROM portal_enrollments WHERE term = ? AND year = ?
       UNION
       SELECT student_external_id FROM portal_billing_adjustments WHERE term = ? AND year = ?
       UNION
       SELECT student_external_id FROM portal_payments WHERE term = ? AND year = ?
     ) u`,
    [t, y, t, y, t, y],
  );
  return rows
    .map((r) => str(r.studentId))
    .filter((id) => id !== "");
}

export async function hasSystemLateFeeForQuarter(
  pool: Pool,
  studentExternalId: string,
  term: string,
  year: number,
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     FROM portal_billing_adjustments
     WHERE student_external_id = ?
       AND term = ?
       AND year = ?
       AND adjustment_source = 'system_late_fee'
     LIMIT 1`,
    [studentExternalId.trim(), term.trim(), Math.trunc(year)],
  );
  return rows.length > 0;
}

export async function insertPortalBillingAdjustment(
  pool: PortalBillingSqlExecutor,
  params: {
    studentExternalId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category: PortalBillingCategory;
    adjustmentSource?:
      | "manual"
      | "admin_manual_charge"
      | "store_purchase"
      | "store_cart_pending"
      | "system_late_fee"
      | "system_clinical"
      | "system_late_fee_reversal";
    /** When set, links a `system_clinical` slot booking charge to `clinical_enrollments.id`. */
    clinicalEnrollmentId?: number | null;
    /** When set, links this row as a compensating reversal of another adjustment row. */
    reversalOfAdjustmentId?: number | null;
  },
): Promise<number> {
  const src = params.adjustmentSource ?? "manual";
  const ce = params.clinicalEnrollmentId;
  const hasCe =
    ce != null && Number.isFinite(Number(ce)) && Math.trunc(Number(ce)) > 0;
  const rawReversal = params.reversalOfAdjustmentId;
  const hasReversal =
    rawReversal != null &&
    Number.isFinite(Number(rawReversal)) &&
    Math.trunc(Number(rawReversal)) > 0;
  if (hasReversal && !(await portalBillingAdjustmentsReversalColumnExists(pool))) {
    throw new Error("MISSING_REVERSAL_COLUMN");
  }
  const reversalId = hasReversal ? Math.trunc(Number(rawReversal)) : null;
  const values = hasCe
    ? hasReversal
      ? [
          params.studentExternalId.trim(),
          params.term.trim(),
          Math.trunc(params.year),
          params.description.trim(),
          params.amount,
          params.category,
          src,
          Math.trunc(Number(ce)),
          reversalId,
        ]
      : [
          params.studentExternalId.trim(),
          params.term.trim(),
          Math.trunc(params.year),
          params.description.trim(),
          params.amount,
          params.category,
          src,
          Math.trunc(Number(ce)),
        ]
    : [
        params.studentExternalId.trim(),
        params.term.trim(),
        Math.trunc(params.year),
        params.description.trim(),
        params.amount,
        params.category,
        src,
        ...(hasReversal ? [reversalId] : []),
      ];
  const sql = hasCe
    ? hasReversal
      ? `INSERT INTO portal_billing_adjustments
          (student_external_id, term, year, description, amount, category, adjustment_source, clinical_enrollment_id, reversal_of_adjustment_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO portal_billing_adjustments
          (student_external_id, term, year, description, amount, category, adjustment_source, clinical_enrollment_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    : hasReversal
      ? `INSERT INTO portal_billing_adjustments
          (student_external_id, term, year, description, amount, category, adjustment_source, reversal_of_adjustment_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO portal_billing_adjustments
          (student_external_id, term, year, description, amount, category, adjustment_source)
         VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const [res] = await pool.execute<ResultSetHeader>(sql, values);
  return Math.trunc(Number(res.insertId));
}

let cachedPortalBillingReversalColumnExists: boolean | null = null;

async function portalBillingAdjustmentsReversalColumnExists(
  pool: PortalBillingSqlExecutor,
): Promise<boolean> {
  if (cachedPortalBillingReversalColumnExists !== null) {
    return cachedPortalBillingReversalColumnExists;
  }
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE table_schema = 'public'
         AND table_name = 'portal_billing_adjustments'
         AND COLUMN_NAME = 'reversal_of_adjustment_id'`,
    );
    cachedPortalBillingReversalColumnExists = Number(rows[0]?.c) > 0;
  } catch {
    cachedPortalBillingReversalColumnExists = false;
  }
  return cachedPortalBillingReversalColumnExists;
}

export async function insertSystemLateFee(
  pool: PortalBillingSqlExecutor,
  params: {
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
  },
): Promise<void> {
  const studentId = params.studentExternalId.trim();
  const term = params.term.trim();
  const year = Math.trunc(params.year);
  try {
    await pool.execute(
      `INSERT INTO portal_billing_adjustments
        (student_external_id, term, year, description, amount, category, adjustment_source)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1
         FROM portal_billing_adjustments
         WHERE student_external_id = ?
           AND term = ?
           AND year = ?
           AND adjustment_source = 'system_late_fee'
         LIMIT 1
       )`,
      [
        studentId,
        term,
        year,
        LATE_FEE_DESCRIPTION,
        params.amount,
        "fees",
        "system_late_fee",
        studentId,
        term,
        year,
      ],
    );
  } catch (error) {
    // Secondary safeguard: ignore race duplicates once unique DB constraint exists.
    if (isUniqueViolation(error)) {
      return;
    }
    throw error;
  }
}

export type SystemLateFeeRow = {
  id: number;
  studentExternalId: string;
  term: string;
  year: number;
  amount: number;
  reversedAmount: number;
  activeAmount: number;
};

export async function listSystemLateFeeRowsForQuarter(
  pool: Pool,
  term: string,
  year: number,
): Promise<SystemLateFeeRow[]> {
  const t = term.trim();
  const y = Math.trunc(year);
  const hasReversalColumn = await portalBillingAdjustmentsReversalColumnExists(pool);
  if (!hasReversalColumn) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id,
              student_external_id AS studentExternalId,
              term,
              year,
              amount
       FROM portal_billing_adjustments
       WHERE adjustment_source = 'system_late_fee'
         AND term = ?
         AND year = ?`,
      [t, y],
    );
    return rows.map((r) => {
      const amount = Number(r.amount);
      return {
        id: Number(r.id),
        studentExternalId: str(r.studentExternalId),
        term: str(r.term),
        year: Number(r.year),
        amount,
        reversedAmount: 0,
        activeAmount: amount,
      };
    });
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT fee.id,
            fee.student_external_id AS studentExternalId,
            fee.term,
            fee.year,
            fee.amount,
            COALESCE(SUM(
              CASE
                WHEN rev.amount < 0 THEN ABS(rev.amount)
                ELSE 0
              END
            ), 0) AS reversedAmount
     FROM portal_billing_adjustments fee
     LEFT JOIN portal_billing_adjustments rev
       ON rev.reversal_of_adjustment_id = fee.id
      AND rev.adjustment_source = 'system_late_fee_reversal'
     WHERE fee.adjustment_source = 'system_late_fee'
       AND fee.term = ?
       AND fee.year = ?
     GROUP BY fee.id, fee.student_external_id, fee.term, fee.year, fee.amount`,
    [t, y],
  );
  return rows.map((r) => {
    const amount = Number(r.amount);
    const reversedAmount = Number(r.reversedAmount);
    return {
      id: Number(r.id),
      studentExternalId: str(r.studentExternalId),
      term: str(r.term),
      year: Number(r.year),
      amount,
      reversedAmount,
      activeAmount: Math.max(0, amount - reversedAmount),
    };
  });
}

export async function insertSystemLateFeeReversal(
  pool: PortalBillingSqlExecutor,
  params: {
    studentExternalId: string;
    term: string;
    year: number;
    sourceAdjustmentId: number;
    amount: number;
    reason: string;
  },
): Promise<number> {
  return insertPortalBillingAdjustment(pool, {
    studentExternalId: params.studentExternalId,
    term: params.term,
    year: params.year,
    description: `Late fee reversal: ${params.reason}`.slice(0, 255),
    amount: -Math.abs(params.amount),
    category: "fees",
    adjustmentSource: "system_late_fee_reversal",
    reversalOfAdjustmentId: params.sourceAdjustmentId,
  });
}

export async function insertPortalPayment(
  pool: Pool,
  params: {
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
    paidAt: string;
    method: string;
    description: string | null;
  },
): Promise<void> {
  await pool.execute(
    `INSERT INTO portal_payments
      (student_external_id, term, year, amount, paid_at, method, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.studentExternalId.trim(),
      params.term.trim(),
      Math.trunc(params.year),
      params.amount,
      params.paidAt.trim().slice(0, 10),
      params.method.trim(),
      params.description,
    ],
  );
}

export type BillingAdjustmentDbRow = {
  id: number;
  studentExternalId: string;
  term: string;
  year: number;
  description: string;
  amount: number;
  category: PortalBillingCategory;
  adjustmentSource: string;
};

export async function getBillingAdjustmentById(
  pool: Pool,
  id: number,
): Promise<BillingAdjustmentDbRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,
            student_external_id AS studentExternalId,
            term,
            year,
            description,
            amount,
            category,
            adjustment_source AS adjustmentSource
     FROM portal_billing_adjustments
     WHERE id = ?
     LIMIT 1`,
    [Math.trunc(id)],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    studentExternalId: str(r.studentExternalId),
    term: str(r.term),
    year: Number(r.year),
    description: str(r.description),
    amount: Number(r.amount),
    category: str(r.category) as PortalBillingCategory,
    adjustmentSource: str(r.adjustmentSource),
  };
}

export async function updateManualBillingAdjustment(
  pool: Pool,
  id: number,
  params: { description: string; amount: number; category: PortalBillingCategory },
): Promise<void> {
  const [res] = await pool.execute(
    `UPDATE portal_billing_adjustments
     SET description = ?, amount = ?, category = ?
     WHERE id = ?
       AND adjustment_source IN ('manual', 'admin_manual_charge')`,
    [
      params.description.trim(),
      params.amount,
      params.category,
      Math.trunc(id),
    ],
  );
  const ok = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (ok === 0) {
    throw new Error("NOT_MANUAL_OR_MISSING");
  }
}

export async function deleteManualBillingAdjustment(
  pool: Pool,
  id: number,
): Promise<void> {
  const [res] = await pool.execute(
    `DELETE FROM portal_billing_adjustments
     WHERE id = ?
       AND adjustment_source IN ('manual', 'admin_manual_charge')`,
    [Math.trunc(id)],
  );
  const ok = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (ok === 0) {
    throw new Error("NOT_MANUAL_OR_MISSING");
  }
}

export async function deleteStoreCartPendingAdjustment(
  pool: Pool | PoolConnection,
  id: number,
): Promise<void> {
  const [res] = await pool.execute(
    `DELETE FROM portal_billing_adjustments
     WHERE id = ?
       AND adjustment_source = 'store_cart_pending'`,
    [Math.trunc(id)],
  );
  const ok = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (ok === 0) {
    throw new Error("NOT_STORE_CART_PENDING");
  }
}

export async function updateStoreCartPendingAdjustment(
  pool: Pool | PoolConnection,
  id: number,
  params: { description: string; amount: number },
): Promise<void> {
  const [res] = await pool.execute(
    `UPDATE portal_billing_adjustments
     SET description = ?, amount = ?
     WHERE id = ?
       AND adjustment_source = 'store_cart_pending'`,
    [params.description.trim().slice(0, 255), params.amount, Math.trunc(id)],
  );
  const ok = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (ok === 0) {
    throw new Error("NOT_STORE_CART_PENDING");
  }
}

export async function promoteStoreCartPendingAdjustments(
  conn: PoolConnection,
  params: {
    adjustmentIds: number[];
    orderId: number;
  },
): Promise<void> {
  if (params.adjustmentIds.length === 0) return;
  const placeholders = params.adjustmentIds.map(() => "?").join(", ");
  await conn.execute(
    `UPDATE portal_billing_adjustments
     SET adjustment_source = 'store_purchase',
         description = CONCAT(
           TRIM(TRAILING ' (cart)' FROM TRIM(TRAILING ' [cart]' FROM description)),
           ' [store order #', ?, ']'
         )
     WHERE id IN (${placeholders})
       AND adjustment_source = 'store_cart_pending'`,
    [Math.trunc(params.orderId), ...params.adjustmentIds.map((id) => Math.trunc(id))],
  );
}

export type PortalPaymentDbRow = {
  id: number;
  studentExternalId: string;
  term: string;
  year: number;
  amount: number;
  paidAt: string;
  method: string;
  description: string | null;
};

export async function getPortalPaymentById(
  pool: Pool,
  id: number,
): Promise<PortalPaymentDbRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,
            student_external_id AS studentExternalId,
            term,
            year,
            amount,
            paid_at AS paidAt,
            method,
            description
     FROM portal_payments
     WHERE id = ?
     LIMIT 1`,
    [Math.trunc(id)],
  );
  const r = rows[0];
  if (!r) return null;
  const paid = r.paidAt;
  let paidAt = "";
  if (paid instanceof Date) {
    paidAt = paid.toISOString().slice(0, 10);
  } else {
    paidAt = str(paid).slice(0, 10);
  }
  return {
    id: Number(r.id),
    studentExternalId: str(r.studentExternalId),
    term: str(r.term),
    year: Number(r.year),
    amount: Number(r.amount),
    paidAt,
    method: str(r.method),
    description: r.description != null ? String(r.description) : null,
  };
}

/** Portal payments are treated as manually recorded (admin/student); all are editable. */
export async function updatePortalPayment(
  pool: Pool,
  id: number,
  params: {
    amount: number;
    paidAt: string;
    method: string;
    description: string | null;
  },
): Promise<void> {
  await pool.execute(
    `UPDATE portal_payments
     SET amount = ?, paid_at = ?, method = ?, description = ?
     WHERE id = ?`,
    [
      params.amount,
      params.paidAt.trim().slice(0, 10),
      params.method.trim(),
      params.description,
      Math.trunc(id),
    ],
  );
}

export async function deletePortalPayment(pool: Pool, id: number): Promise<void> {
  const [res] = await pool.execute(`DELETE FROM portal_payments WHERE id = ?`, [
    Math.trunc(id),
  ]);
  const ok = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (ok === 0) {
    throw new Error("MISSING_PAYMENT");
  }
}

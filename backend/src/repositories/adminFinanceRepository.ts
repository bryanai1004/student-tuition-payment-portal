import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { Pool } from "mysql2/promise";

export type PortalBillingCategory = "tuition" | "clinical" | "fees" | "other";

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
       SELECT DISTINCT term, year FROM portal_enrollments
       UNION
       SELECT DISTINCT term, year FROM portal_billing_adjustments
       UNION
       SELECT DISTINCT term, year FROM portal_payments
       UNION
       SELECT DISTINCT TRIM(term) AS term, year FROM registration
       UNION
       SELECT DISTINCT TRIM(term) AS term, year FROM accounting
       UNION
       SELECT DISTINCT TRIM(term_name) AS term, year FROM academic_terms
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
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'academic_terms'
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
  pool: Pool,
  params: {
    studentExternalId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category: PortalBillingCategory;
    adjustmentSource?: "manual" | "system_late_fee";
  },
): Promise<void> {
  const src = params.adjustmentSource ?? "manual";
  await pool.execute(
    `INSERT INTO portal_billing_adjustments
      (student_external_id, term, year, description, amount, category, adjustment_source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.studentExternalId.trim(),
      params.term.trim(),
      Math.trunc(params.year),
      params.description.trim(),
      params.amount,
      params.category,
      src,
    ],
  );
}

export async function insertSystemLateFee(
  pool: Pool,
  params: {
    studentExternalId: string;
    term: string;
    year: number;
    amount: number;
  },
): Promise<void> {
  await insertPortalBillingAdjustment(pool, {
    studentExternalId: params.studentExternalId,
    term: params.term,
    year: params.year,
    description: LATE_FEE_DESCRIPTION,
    amount: params.amount,
    category: "fees",
    adjustmentSource: "system_late_fee",
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
       AND adjustment_source = 'manual'`,
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
       AND adjustment_source = 'manual'`,
    [Math.trunc(id)],
  );
  const ok = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (ok === 0) {
    throw new Error("NOT_MANUAL_OR_MISSING");
  }
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

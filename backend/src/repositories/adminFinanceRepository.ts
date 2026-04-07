import type { Pool, RowDataPacket } from "mysql2/promise";

export type PortalBillingCategory = "tuition" | "clinical" | "fees" | "other";

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

export async function insertPortalBillingAdjustment(
  pool: Pool,
  params: {
    studentExternalId: string;
    term: string;
    year: number;
    description: string;
    amount: number;
    category: PortalBillingCategory;
  },
): Promise<void> {
  await pool.execute(
    `INSERT INTO portal_billing_adjustments
      (student_external_id, term, year, description, amount, category)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.studentExternalId.trim(),
      params.term.trim(),
      Math.trunc(params.year),
      params.description.trim(),
      params.amount,
      params.category,
    ],
  );
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

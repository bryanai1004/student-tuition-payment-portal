import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db.js";

export type ClinicalBookingPaymentHoldStatus =
  | "active"
  | "satisfied_paid"
  | "expired_auto_dropped"
  | "cancelled_manual_drop"
  | "cancelled_enrollment_inactive"
  | "cancelled_superseded";

export type ClinicalBookingPaymentHoldRow = {
  id: number;
  clinicalEnrollmentId: number;
  studentId: string;
  billingAdjustmentId: number;
  term: string;
  year: number;
  chargeAmount: number;
  balanceBeforeCharge: number;
  holdExpiresAt: Date;
  status: ClinicalBookingPaymentHoldStatus;
};

let holdsTableExistsCache: boolean | null = null;

export async function clinicalBookingPaymentHoldsTableExists(): Promise<boolean> {
  if (holdsTableExistsCache != null) return holdsTableExistsCache;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_booking_payment_holds'
      LIMIT 1`,
  );
  holdsTableExistsCache = rows.length > 0;
  return holdsTableExistsCache;
}

export async function insertClinicalBookingPaymentHold(params: {
  clinicalEnrollmentId: number;
  studentId: string;
  billingAdjustmentId: number;
  term: string;
  year: number;
  chargeAmount: number;
  balanceBeforeCharge: number;
}): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO clinical_booking_payment_holds
      (clinical_enrollment_id, student_id, billing_adjustment_id, term, year,
       charge_amount, balance_before_charge, hold_expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 HOUR), 'active')`,
    [
      Math.trunc(params.clinicalEnrollmentId),
      params.studentId.trim(),
      Math.trunc(params.billingAdjustmentId),
      params.term.trim(),
      Math.trunc(params.year),
      params.chargeAmount,
      params.balanceBeforeCharge,
    ],
  );
  return Math.trunc(Number(res.insertId));
}

export async function cancelActiveClinicalBookingPaymentHoldsForEnrollment(
  conn: PoolConnection,
  clinicalEnrollmentId: number,
  reason: "manual_drop" | "superseded",
): Promise<void> {
  const status: ClinicalBookingPaymentHoldStatus =
    reason === "superseded" ? "cancelled_superseded" : "cancelled_manual_drop";
  await conn.execute(
    `UPDATE clinical_booking_payment_holds
        SET status = ?,
            satisfied_at = NULL
      WHERE clinical_enrollment_id = ?
        AND status = 'active'`,
    [status, Math.trunc(clinicalEnrollmentId)],
  );
}

export async function cancelActiveClinicalBookingPaymentHoldsForEnrollmentPool(
  clinicalEnrollmentId: number,
  reason: "manual_drop" | "superseded",
): Promise<void> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) return;
  const status: ClinicalBookingPaymentHoldStatus =
    reason === "superseded" ? "cancelled_superseded" : "cancelled_manual_drop";
  await pool.execute(
    `UPDATE clinical_booking_payment_holds
        SET status = ?,
            satisfied_at = NULL
      WHERE clinical_enrollment_id = ?
        AND status = 'active'`,
    [status, Math.trunc(clinicalEnrollmentId)],
  );
}

export async function voidSystemClinicalChargesForEnrollmentPool(
  clinicalEnrollmentId: number,
): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE portal_billing_adjustments
        SET amount = 0,
            description = LEFT(
              CONCAT(TRIM(description), ' [voided: clinical booking superseded]'),
              255
            )
      WHERE clinical_enrollment_id = ?
        AND adjustment_source = 'system_clinical'
        AND category = 'clinical'
        AND amount <> 0`,
    [Math.trunc(clinicalEnrollmentId)],
  );
  return Math.trunc(Number(res.affectedRows ?? 0));
}

export async function voidSystemClinicalChargesForEnrollmentInConn(
  conn: PoolConnection,
  clinicalEnrollmentId: number,
): Promise<number> {
  const [res] = await conn.execute<ResultSetHeader>(
    `UPDATE portal_billing_adjustments
        SET amount = 0,
            description = LEFT(
              CONCAT(TRIM(description), ' [voided: clinical booking superseded]'),
              255
            )
      WHERE clinical_enrollment_id = ?
        AND adjustment_source = 'system_clinical'
        AND category = 'clinical'
        AND amount <> 0`,
    [Math.trunc(clinicalEnrollmentId)],
  );
  return Math.trunc(Number(res.affectedRows ?? 0));
}

/** Voids a single system clinical booking charge row (used when a hold expires). */
export async function voidSystemClinicalBillingAdjustmentByIdInConn(
  conn: PoolConnection,
  billingAdjustmentId: number,
): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(
    `UPDATE portal_billing_adjustments
        SET amount = 0,
            description = LEFT(
              CONCAT(TRIM(description), ' [voided: clinical booking hold expired]'),
              255
            )
      WHERE id = ?
        AND adjustment_source = 'system_clinical'
        AND category = 'clinical'
        AND amount <> 0`,
    [Math.trunc(billingAdjustmentId)],
  );
  return Math.trunc(Number(res.affectedRows ?? 0)) > 0;
}

export async function listDueActiveClinicalBookingPaymentHoldIds(
  limit: number,
): Promise<number[]> {
  const lim = Math.min(500, Math.max(1, Math.trunc(limit)));
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id
       FROM clinical_booking_payment_holds
      WHERE status = 'active'
        AND hold_expires_at <= UTC_TIMESTAMP()
      ORDER BY hold_expires_at ASC, id ASC
      LIMIT ?`,
    [lim],
  );
  return rows.map((r) => Math.trunc(Number((r as { id?: unknown }).id)));
}

export async function lockClinicalBookingPaymentHoldById(
  conn: PoolConnection,
  holdId: number,
): Promise<ClinicalBookingPaymentHoldRow | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id,
            clinical_enrollment_id AS clinicalEnrollmentId,
            TRIM(student_id) AS studentId,
            billing_adjustment_id AS billingAdjustmentId,
            TRIM(term) AS term,
            year,
            charge_amount AS chargeAmount,
            balance_before_charge AS balanceBeforeCharge,
            hold_expires_at AS holdExpiresAt,
            TRIM(status) AS status
       FROM clinical_booking_payment_holds
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
    [Math.trunc(holdId)],
  );
  const r = rows[0];
  if (!r) return null;
  const he = r.holdExpiresAt;
  return {
    id: Math.trunc(Number(r.id)),
    clinicalEnrollmentId: Math.trunc(Number(r.clinicalEnrollmentId)),
    studentId: String(r.studentId ?? "").trim(),
    billingAdjustmentId: Math.trunc(Number(r.billingAdjustmentId)),
    term: String(r.term ?? "").trim(),
    year: Math.trunc(Number(r.year)),
    chargeAmount: Number(r.chargeAmount),
    balanceBeforeCharge: Number(r.balanceBeforeCharge),
    holdExpiresAt: he instanceof Date ? he : new Date(String(he)),
    status: String(r.status ?? "").trim() as ClinicalBookingPaymentHoldStatus,
  };
}

export async function updateClinicalBookingPaymentHoldStatus(
  conn: PoolConnection,
  holdId: number,
  status: ClinicalBookingPaymentHoldStatus,
  fields: { satisfiedAt?: Date | null; autoDroppedAt?: Date | null },
): Promise<void> {
  await conn.execute(
    `UPDATE clinical_booking_payment_holds
        SET status = ?,
            satisfied_at = ?,
            auto_dropped_at = ?
      WHERE id = ?`,
    [
      status,
      fields.satisfiedAt ?? null,
      fields.autoDroppedAt ?? null,
      Math.trunc(holdId),
    ],
  );
}

export async function markClinicalBookingPaymentHoldSatisfiedOutsideTxn(
  holdId: number,
): Promise<void> {
  await pool.execute(
    `UPDATE clinical_booking_payment_holds
        SET status = 'satisfied_paid',
            satisfied_at = UTC_TIMESTAMP()
      WHERE id = ?
        AND status = 'active'`,
    [Math.trunc(holdId)],
  );
}

export async function listActiveClinicalBookingPaymentHoldsForStudent(
  studentId: string,
): Promise<
  {
    id: number;
    balanceBeforeCharge: number;
    chargeAmount: number;
    term: string;
    year: number;
  }[]
> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) return [];
  const sid = studentId.trim();
  if (sid === "") return [];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id,
            balance_before_charge AS balanceBeforeCharge,
            charge_amount AS chargeAmount,
            TRIM(term) AS term,
            year
       FROM clinical_booking_payment_holds
      WHERE TRIM(student_id) = TRIM(?)
        AND status = 'active'
      ORDER BY id ASC
      LIMIT 50`,
    [sid],
  );
  return rows.map((r) => ({
    id: Math.trunc(Number((r as { id?: unknown }).id)),
    balanceBeforeCharge: Number((r as { balanceBeforeCharge?: unknown }).balanceBeforeCharge),
    chargeAmount: Number((r as { chargeAmount?: unknown }).chargeAmount),
    term: String((r as { term?: unknown }).term ?? "").trim(),
    year: Math.trunc(Number((r as { year?: unknown }).year)),
  }));
}

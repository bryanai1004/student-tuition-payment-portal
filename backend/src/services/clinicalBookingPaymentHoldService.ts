import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db.js";
import {
  clinicalBookingPaymentHoldsTableExists,
  listActiveClinicalBookingPaymentHoldsForStudent,
  listDueActiveClinicalBookingPaymentHoldIds,
  lockClinicalBookingPaymentHoldById,
  markClinicalBookingPaymentHoldSatisfiedOutsideTxn,
  updateClinicalBookingPaymentHoldStatus,
  voidSystemClinicalBillingAdjustmentByIdInConn,
} from "../repositories/clinicalBookingPaymentHoldRepository.js";
import { dropClinicalEnrollmentInConn } from "../repositories/clinicalEnrollmentRepository.js";
import { getStudentQuarterBalance } from "./studentLedgerService.js";

/**
 * Whether the student's current quarter balance indicates this clinical booking charge
 * is covered, using the snapshot taken at charge time (`balanceBeforeCharge`).
 *
 * - When `balanceBeforeCharge >= 0`, we require the balance to return to at most that
 *   baseline (so new charges since the snapshot must be offset by payments).
 * - When `balanceBeforeCharge < 0` (net credit before the charge), we require the
 *   balance to remain at most `balanceBeforeCharge + chargeAmount` (the balance
 *   immediately after posting this clinical debit).
 */
export function isClinicalBookingHoldFinanciallySatisfied(
  balanceBeforeCharge: number,
  chargeAmount: number,
  currentBalance: number,
): boolean {
  const thr =
    balanceBeforeCharge >= 0
      ? balanceBeforeCharge
      : balanceBeforeCharge + chargeAmount;
  return currentBalance <= thr + 0.009;
}

export async function reconcilePaidClinicalBookingPaymentHoldsForStudent(
  studentId: string,
): Promise<void> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) return;
  const sid = studentId.trim();
  if (sid === "") return;
  const holds = await listActiveClinicalBookingPaymentHoldsForStudent(sid);
  for (const h of holds) {
    const bal = await getStudentQuarterBalance(sid, h.term, h.year);
    if (
      isClinicalBookingHoldFinanciallySatisfied(
        h.balanceBeforeCharge,
        h.chargeAmount,
        bal,
      )
    ) {
      await markClinicalBookingPaymentHoldSatisfiedOutsideTxn(h.id);
    }
  }
}

export type ClinicalBookingPaymentHoldCleanupStats = {
  candidates: number;
  satisfied: number;
  autoDropped: number;
  skipped: number;
  inconsistencies: number;
};

/**
 * Marks satisfied holds and auto-drops overdue unpaid clinical bookings (idempotent).
 */
export async function runClinicalBookingPaymentHoldCleanup(): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  const stats: ClinicalBookingPaymentHoldCleanupStats = {
    candidates: 0,
    satisfied: 0,
    autoDropped: 0,
    skipped: 0,
    inconsistencies: 0,
  };
  if (!(await clinicalBookingPaymentHoldsTableExists())) {
    return stats;
  }

  const dueIds = await listDueActiveClinicalBookingPaymentHoldIds(200);
  stats.candidates = dueIds.length;

  for (const holdId of dueIds) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const hold = await lockClinicalBookingPaymentHoldById(conn, holdId);
      if (hold == null || hold.status !== "active") {
        await conn.rollback();
        stats.skipped += 1;
        continue;
      }
      if (hold.holdExpiresAt.getTime() > Date.now()) {
        await conn.rollback();
        stats.skipped += 1;
        continue;
      }

      const [enRows] = await conn.query<RowDataPacket[]>(
        `SELECT id,
                TRIM(student_id) AS student_id,
                TRIM(status) AS status
           FROM clinical_enrollments
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [hold.clinicalEnrollmentId],
      );
      if (enRows.length === 0) {
        await updateClinicalBookingPaymentHoldStatus(
          conn,
          holdId,
          "cancelled_enrollment_inactive",
          {},
        );
        await conn.commit();
        stats.skipped += 1;
        continue;
      }
      const en = enRows[0] as Record<string, unknown>;
      const enStudent = String(en.student_id ?? "").trim();
      const enStatus = String(en.status ?? "").trim().toLowerCase();
      if (enStudent !== hold.studentId) {
        console.error(
          "[clinical payment hold cleanup] enrollment student mismatch; skipping destructive work",
          { holdId, holdStudent: hold.studentId, enrollmentStudent: enStudent },
        );
        await conn.rollback();
        stats.inconsistencies += 1;
        continue;
      }
      if (enStatus !== "enrolled") {
        await updateClinicalBookingPaymentHoldStatus(
          conn,
          holdId,
          "cancelled_enrollment_inactive",
          {},
        );
        await conn.commit();
        stats.skipped += 1;
        continue;
      }

      const currentBal = await getStudentQuarterBalance(
        hold.studentId,
        hold.term,
        hold.year,
      );
      if (
        isClinicalBookingHoldFinanciallySatisfied(
          hold.balanceBeforeCharge,
          hold.chargeAmount,
          currentBal,
        )
      ) {
        await updateClinicalBookingPaymentHoldStatus(
          conn,
          holdId,
          "satisfied_paid",
          { satisfiedAt: new Date() },
        );
        await conn.commit();
        stats.satisfied += 1;
        continue;
      }

      const voided = await voidSystemClinicalBillingAdjustmentByIdInConn(
        conn,
        hold.billingAdjustmentId,
      );
      if (!voided) {
        console.warn(
          "[clinical payment hold cleanup] expected system_clinical charge row not voided (already zero or missing); continuing with drop",
          { holdId, billingAdjustmentId: hold.billingAdjustmentId },
        );
      }

      const dropped = await dropClinicalEnrollmentInConn(
        conn,
        hold.studentId,
        hold.clinicalEnrollmentId,
      );
      if (!dropped.ok) {
        console.error(
          "[clinical payment hold cleanup] drop failed after void; rolling back txn",
          { holdId, message: dropped.error },
        );
        await conn.rollback();
        stats.inconsistencies += 1;
        continue;
      }

      await updateClinicalBookingPaymentHoldStatus(
        conn,
        holdId,
        "expired_auto_dropped",
        { autoDroppedAt: new Date() },
      );
      await conn.commit();
      stats.autoDropped += 1;
    } catch (e) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
      console.error("[clinical payment hold cleanup] fatal row error", {
        holdId,
        error: e,
      });
      stats.inconsistencies += 1;
    } finally {
      conn.release();
    }
  }

  return stats;
}

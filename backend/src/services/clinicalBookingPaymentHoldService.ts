import type { RowDataPacket } from "mysql2/promise";
import { isClinicalBookingExpired } from "../clinicalBookingPolicy.js";
import { pool } from "../lib/db.js";
import {
  clinicalBookingPaymentHoldsTableExists,
  getUrgentActiveClinicalBookingHoldForStudentPortal,
  listActiveClinicalBookingPaymentHoldsForStudent,
  listDueActiveClinicalBookingPaymentHoldIds,
  listDueActiveClinicalBookingPaymentHoldIdsForStudent,
  listDueActiveClinicalBookingPaymentHoldIdsForTimetable,
  lockClinicalBookingPaymentHoldById,
  markClinicalBookingPaymentHoldSatisfiedOutsideTxn,
  updateClinicalBookingPaymentHoldStatus,
  voidSystemClinicalBillingAdjustmentByIdInConn,
} from "../repositories/clinicalBookingPaymentHoldRepository.js";
import { getClinicTimetableById } from "../repositories/clinicalTimetableRepository.js";
import {
  buildClinicTimetableSlotLabel,
  formatClinicTimeHm,
} from "./clinicalScheduleService.js";
import { dropClinicalEnrollmentInConn } from "../repositories/clinicalEnrollmentRepository.js";

export {
  isClinicalBookingExpired,
  isClinicalBookingExpired as isClinicalBookingPaymentHoldPastDeadline,
} from "../clinicalBookingPolicy.js";

async function loadStudentQuarterBalanceForClinicalHold(
  studentId: string,
  term: string,
  year: number,
): Promise<number> {
  const { getStudentQuarterBalance } = await import("./studentLedgerService.js");
  return getStudentQuarterBalance(studentId, term, year);
}

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

export type StudentPortalClinicalBookingHoldDto = {
  holdExpiresAt: string;
  remainingSeconds: number;
  holdStatus: "active" | "expired";
  clinicalEnrollmentId: number;
  timetableId: number;
  slotLabel: string;
};

/**
 * Summarizes the student's most urgent open clinical booking payment hold for the student portal.
 * DB row must be `active` and tied to an `enrolled` clinical enrollment.
 */
export async function getStudentPortalClinicalBookingHold(
  studentId: string,
): Promise<StudentPortalClinicalBookingHoldDto | null> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) return null;
  const row = await getUrgentActiveClinicalBookingHoldForStudentPortal(studentId);
  if (row == null) return null;
  if (isClinicalBookingExpired(row.holdExpiresAt)) return null;
  const tt = await getClinicTimetableById(row.timetableId);
  const slotLabel =
    tt != null
      ? buildClinicTimetableSlotLabel({
          weekday: tt.weekday,
          timeFrom: formatClinicTimeHm(tt.time_from),
          timeTo: formatClinicTimeHm(tt.time_to),
          slot: tt.slot,
          instructor: tt.instructor?.trim() ? tt.instructor.trim() : null,
        })
      : "Clinical slot";
  const nowMs = Date.now();
  const endMs = row.holdExpiresAt.getTime();
  const diffSec = Math.floor((endMs - nowMs) / 1000);
  const remainingSeconds = Math.max(0, diffSec);
  const holdStatus: "active" | "expired" = "active";
  return {
    holdExpiresAt: row.holdExpiresAt.toISOString(),
    remainingSeconds,
    holdStatus,
    clinicalEnrollmentId: row.clinicalEnrollmentId,
    timetableId: row.timetableId,
    slotLabel,
  };
}

export async function reconcilePaidClinicalBookingPaymentHoldsForStudent(
  studentId: string,
): Promise<void> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) return;
  const sid = studentId.trim();
  if (sid === "") return;
  const holds = await listActiveClinicalBookingPaymentHoldsForStudent(sid);
  for (const h of holds) {
    const bal = await loadStudentQuarterBalanceForClinicalHold(sid, h.term, h.year);
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

function emptyCleanupStats(): ClinicalBookingPaymentHoldCleanupStats {
  return {
    candidates: 0,
    satisfied: 0,
    autoDropped: 0,
    skipped: 0,
    inconsistencies: 0,
  };
}

function mergeCleanupStats(
  a: ClinicalBookingPaymentHoldCleanupStats,
  b: ClinicalBookingPaymentHoldCleanupStats,
): void {
  a.candidates += b.candidates;
  a.satisfied += b.satisfied;
  a.autoDropped += b.autoDropped;
  a.skipped += b.skipped;
  a.inconsistencies += b.inconsistencies;
}

/**
 * Core idempotent processor: for each hold id, revoke unpaid expired booking or mark paid.
 */
export async function processDueClinicalBookingPaymentHoldIds(
  dueIds: number[],
): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  const stats = emptyCleanupStats();
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
      if (!isClinicalBookingExpired(hold.holdExpiresAt)) {
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

      const currentBal = await loadStudentQuarterBalanceForClinicalHold(
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

/**
 * Expired unpaid clinical reservation: `clinical_booking_payment_holds.status = 'active'`,
 * `hold_expires_at <= UTC_TIMESTAMP()`, enrollment still `enrolled`, and ledger shows the
 * charge is not financially satisfied vs `balance_before_charge` / `charge_amount`.
 * On success: void `portal_billing_adjustments` clinical row, set enrollment `dropped`,
 * hold `expired_auto_dropped`.
 */
export async function reconcileExpiredClinicalBookingHoldsForStudent(
  studentId: string,
): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) {
    return emptyCleanupStats();
  }
  const sid = studentId.trim();
  if (sid === "") return emptyCleanupStats();
  const dueIds = await listDueActiveClinicalBookingPaymentHoldIdsForStudent(sid, 200);
  return processDueClinicalBookingPaymentHoldIds(dueIds);
}

export async function reconcileExpiredClinicalBookingHoldsForTimetable(
  timetableId: number,
): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) {
    return emptyCleanupStats();
  }
  const dueIds = await listDueActiveClinicalBookingPaymentHoldIdsForTimetable(
    timetableId,
    200,
  );
  return processDueClinicalBookingPaymentHoldIds(dueIds);
}

/**
 * Process global due holds in batches until none remain or max batches (open-slot listing).
 */
export async function runDueClinicalBookingHoldCleanupBatches(
  opts?: { maxBatches?: number; batchSize?: number },
): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  const maxBatches = opts?.maxBatches ?? 25;
  const batchSize = Math.min(500, Math.max(50, Math.trunc(opts?.batchSize ?? 250)));
  const acc = emptyCleanupStats();
  if (!(await clinicalBookingPaymentHoldsTableExists())) {
    return acc;
  }
  for (let i = 0; i < maxBatches; i++) {
    const dueIds = await listDueActiveClinicalBookingPaymentHoldIds(batchSize);
    if (dueIds.length === 0) {
      break;
    }
    const batch = await processDueClinicalBookingPaymentHoldIds(dueIds);
    mergeCleanupStats(acc, batch);
  }
  return acc;
}

/**
 * Marks satisfied holds and auto-drops overdue unpaid clinical bookings (idempotent).
 */
export async function runClinicalBookingPaymentHoldCleanup(): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  if (!(await clinicalBookingPaymentHoldsTableExists())) {
    return emptyCleanupStats();
  }
  const dueIds = await listDueActiveClinicalBookingPaymentHoldIds(200);
  return processDueClinicalBookingPaymentHoldIds(dueIds);
}

/**
 * Revokes unpaid clinical registrations whose payment deadline has passed (student scope).
 * Idempotent; delegates to {@link reconcileExpiredClinicalBookingHoldsForStudent}.
 */
export async function revokeExpiredClinicalBooking(
  studentId: string,
): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  return reconcileExpiredClinicalBookingHoldsForStudent(studentId);
}

/**
 * Revokes overdue unpaid clinical registrations tied to a timetable slot (admin / slot views).
 */
export async function revokeExpiredClinicalBookingForTimetable(
  timetableId: number,
): Promise<ClinicalBookingPaymentHoldCleanupStats> {
  return reconcileExpiredClinicalBookingHoldsForTimetable(timetableId);
}

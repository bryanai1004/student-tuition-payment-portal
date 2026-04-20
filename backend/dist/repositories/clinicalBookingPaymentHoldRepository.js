import { pool } from "../lib/db.js";
let holdsTableExistsCache = null;
export async function clinicalBookingPaymentHoldsTableExists() {
    if (holdsTableExistsCache != null)
        return holdsTableExistsCache;
    const [rows] = await pool.query(`SELECT 1 AS ok
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_booking_payment_holds'
      LIMIT 1`);
    holdsTableExistsCache = rows.length > 0;
    return holdsTableExistsCache;
}
export async function insertClinicalBookingPaymentHold(params) {
    const [res] = await pool.execute(`INSERT INTO clinical_booking_payment_holds
      (clinical_enrollment_id, student_id, billing_adjustment_id, term, year,
       charge_amount, balance_before_charge, hold_expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 HOUR), 'active')`, [
        Math.trunc(params.clinicalEnrollmentId),
        params.studentId.trim(),
        Math.trunc(params.billingAdjustmentId),
        params.term.trim(),
        Math.trunc(params.year),
        params.chargeAmount,
        params.balanceBeforeCharge,
    ]);
    return Math.trunc(Number(res.insertId));
}
export async function cancelActiveClinicalBookingPaymentHoldsForEnrollment(conn, clinicalEnrollmentId, reason) {
    const status = reason === "superseded" ? "cancelled_superseded" : "cancelled_manual_drop";
    await conn.execute(`UPDATE clinical_booking_payment_holds
        SET status = ?,
            satisfied_at = NULL
      WHERE clinical_enrollment_id = ?
        AND status = 'active'`, [status, Math.trunc(clinicalEnrollmentId)]);
}
export async function cancelActiveClinicalBookingPaymentHoldsForEnrollmentPool(clinicalEnrollmentId, reason) {
    if (!(await clinicalBookingPaymentHoldsTableExists()))
        return;
    const status = reason === "superseded" ? "cancelled_superseded" : "cancelled_manual_drop";
    await pool.execute(`UPDATE clinical_booking_payment_holds
        SET status = ?,
            satisfied_at = NULL
      WHERE clinical_enrollment_id = ?
        AND status = 'active'`, [status, Math.trunc(clinicalEnrollmentId)]);
}
export async function voidSystemClinicalChargesForEnrollmentPool(clinicalEnrollmentId) {
    const [res] = await pool.execute(`UPDATE portal_billing_adjustments
        SET amount = 0,
            description = LEFT(
              CONCAT(TRIM(description), ' [voided: clinical booking superseded]'),
              255
            )
      WHERE clinical_enrollment_id = ?
        AND adjustment_source = 'system_clinical'
        AND category = 'clinical'
        AND amount <> 0`, [Math.trunc(clinicalEnrollmentId)]);
    return Math.trunc(Number(res.affectedRows ?? 0));
}
export async function voidSystemClinicalChargesForEnrollmentInConn(conn, clinicalEnrollmentId) {
    const [res] = await conn.execute(`UPDATE portal_billing_adjustments
        SET amount = 0,
            description = LEFT(
              CONCAT(TRIM(description), ' [voided: clinical booking superseded]'),
              255
            )
      WHERE clinical_enrollment_id = ?
        AND adjustment_source = 'system_clinical'
        AND category = 'clinical'
        AND amount <> 0`, [Math.trunc(clinicalEnrollmentId)]);
    return Math.trunc(Number(res.affectedRows ?? 0));
}
/** Voids a single system clinical booking charge row (used when a hold expires). */
export async function voidSystemClinicalBillingAdjustmentByIdInConn(conn, billingAdjustmentId) {
    const [res] = await conn.execute(`UPDATE portal_billing_adjustments
        SET amount = 0,
            description = LEFT(
              CONCAT(TRIM(description), ' [voided: clinical booking hold expired]'),
              255
            )
      WHERE id = ?
        AND adjustment_source = 'system_clinical'
        AND category = 'clinical'
        AND amount <> 0`, [Math.trunc(billingAdjustmentId)]);
    return Math.trunc(Number(res.affectedRows ?? 0)) > 0;
}
export async function listDueActiveClinicalBookingPaymentHoldIds(limit) {
    const lim = Math.min(500, Math.max(1, Math.trunc(limit)));
    const [rows] = await pool.query(`SELECT id
       FROM clinical_booking_payment_holds
      WHERE status = 'active'
        AND hold_expires_at <= UTC_TIMESTAMP()
      ORDER BY hold_expires_at ASC, id ASC
      LIMIT ?`, [lim]);
    return rows.map((r) => Math.trunc(Number(r.id)));
}
export async function lockClinicalBookingPaymentHoldById(conn, holdId) {
    const [rows] = await conn.query(`SELECT id,
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
      FOR UPDATE`, [Math.trunc(holdId)]);
    const r = rows[0];
    if (!r)
        return null;
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
        status: String(r.status ?? "").trim(),
    };
}
export async function updateClinicalBookingPaymentHoldStatus(conn, holdId, status, fields) {
    await conn.execute(`UPDATE clinical_booking_payment_holds
        SET status = ?,
            satisfied_at = ?,
            auto_dropped_at = ?
      WHERE id = ?`, [
        status,
        fields.satisfiedAt ?? null,
        fields.autoDroppedAt ?? null,
        Math.trunc(holdId),
    ]);
}
export async function markClinicalBookingPaymentHoldSatisfiedOutsideTxn(holdId) {
    await pool.execute(`UPDATE clinical_booking_payment_holds
        SET status = 'satisfied_paid',
            satisfied_at = UTC_TIMESTAMP()
      WHERE id = ?
        AND status = 'active'`, [Math.trunc(holdId)]);
}
export async function listActiveClinicalBookingPaymentHoldsForStudent(studentId) {
    if (!(await clinicalBookingPaymentHoldsTableExists()))
        return [];
    const sid = studentId.trim();
    if (sid === "")
        return [];
    const [rows] = await pool.query(`SELECT id,
            balance_before_charge AS balanceBeforeCharge,
            charge_amount AS chargeAmount,
            TRIM(term) AS term,
            year
       FROM clinical_booking_payment_holds
      WHERE TRIM(student_id) = TRIM(?)
        AND status = 'active'
      ORDER BY id ASC
      LIMIT 50`, [sid]);
    return rows.map((r) => ({
        id: Math.trunc(Number(r.id)),
        balanceBeforeCharge: Number(r.balanceBeforeCharge),
        chargeAmount: Number(r.chargeAmount),
        term: String(r.term ?? "").trim(),
        year: Math.trunc(Number(r.year)),
    }));
}
//# sourceMappingURL=clinicalBookingPaymentHoldRepository.js.map
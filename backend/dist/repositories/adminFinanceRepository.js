function termSortOrder(term) {
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
function str(v) {
    if (v == null)
        return "";
    return String(v).trim();
}
/**
 * Legacy `students` roster plus `portal_students` rows that are not yet in `students`
 * (same external id key used across portal billing tables).
 */
export async function listFinanceRosterRows(pool) {
    const [legacyRows] = await pool.query(`SELECT TRIM(s.id) AS studentId, s.name AS name
     FROM students s`);
    const byId = new Map();
    for (const r of legacyRows) {
        const studentId = str(r.studentId);
        if (studentId === "")
            continue;
        const nameRaw = str(r.name);
        byId.set(studentId, nameRaw.length > 0 ? nameRaw : studentId);
    }
    const [portalRows] = await pool.query(`SELECT ps.student_external_id AS studentId, ps.full_name AS name
     FROM portal_students ps
     LEFT JOIN students s ON TRIM(s.id) = ps.student_external_id
     WHERE s.id IS NULL`);
    for (const r of portalRows) {
        const studentId = str(r.studentId);
        if (studentId === "")
            continue;
        if (byId.has(studentId))
            continue;
        const nameRaw = str(r.name);
        byId.set(studentId, nameRaw.length > 0 ? nameRaw : studentId);
    }
    return [...byId.entries()]
        .map(([studentId, name]) => ({ studentId, name }))
        .sort((a, b) => {
        const c = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (c !== 0)
            return c;
        return a.studentId.localeCompare(b.studentId, undefined, {
            sensitivity: "base",
        });
    });
}
function quarterDedupeKey(term, year) {
    return `${Math.trunc(year)}:${term.trim().toLowerCase()}`;
}
/**
 * All term/year pairs that appear anywhere in finance-related tables (newest first).
 */
export async function listGlobalFinanceQuarters(pool) {
    const [rows] = await pool.query(`SELECT term, year FROM (
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
       SELECT DISTINCT term, year FROM portal_term_finance_settings
     ) q
     WHERE TRIM(term) <> ''`);
    const byKey = new Map();
    for (const r of rows) {
        const term = str(r.term);
        const year = Number(r.year);
        if (term === "" || !Number.isFinite(year))
            continue;
        const k = quarterDedupeKey(term, year);
        if (!byKey.has(k)) {
            byKey.set(k, { term, year: Math.trunc(year) });
        }
    }
    return [...byKey.values()].sort((a, b) => {
        if (b.year !== a.year)
            return b.year - a.year;
        return termSortOrder(b.term) - termSortOrder(a.term);
    });
}
export async function getTermFinanceSettings(pool, term, year) {
    const [rows] = await pool.query(`SELECT term, year,
            payment_due_date AS paymentDueDate,
            late_fee_enabled AS lateFeeEnabled,
            late_fee_amount AS lateFeeAmount,
            updated_by AS updatedBy
     FROM portal_term_finance_settings
     WHERE term = ? AND year = ?
     LIMIT 1`, [term.trim(), Math.trunc(year)]);
    const r = rows[0];
    if (!r)
        return null;
    const due = r.paymentDueDate;
    let paymentDueDate = null;
    if (due instanceof Date) {
        paymentDueDate = due.toISOString().slice(0, 10);
    }
    else if (typeof due === "string" && due.trim() !== "") {
        paymentDueDate = due.trim().slice(0, 10);
    }
    return {
        term: str(r.term),
        year: Number(r.year),
        paymentDueDate,
        lateFeeEnabled: Boolean(r.lateFeeEnabled),
        lateFeeAmount: Number(r.lateFeeAmount) || 30,
        updatedBy: r.updatedBy != null ? String(r.updatedBy) : null,
    };
}
export async function upsertTermFinanceSettings(pool, params) {
    await pool.execute(`INSERT INTO portal_term_finance_settings
      (term, year, payment_due_date, late_fee_enabled, late_fee_amount, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       payment_due_date = VALUES(payment_due_date),
       late_fee_enabled = VALUES(late_fee_enabled),
       late_fee_amount = VALUES(late_fee_amount),
       updated_by = VALUES(updated_by)`, [
        params.term.trim(),
        Math.trunc(params.year),
        params.paymentDueDate,
        params.lateFeeEnabled ? 1 : 0,
        params.lateFeeAmount,
        params.updatedBy,
    ]);
}
/** Students with any portal billing activity for the term (late fee candidates). */
export async function listStudentIdsWithPortalQuarterActivity(pool, term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const [rows] = await pool.query(`SELECT DISTINCT student_external_id AS studentId FROM (
       SELECT student_external_id FROM portal_enrollments WHERE term = ? AND year = ?
       UNION
       SELECT student_external_id FROM portal_billing_adjustments WHERE term = ? AND year = ?
       UNION
       SELECT student_external_id FROM portal_payments WHERE term = ? AND year = ?
     ) u`, [t, y, t, y, t, y]);
    return rows
        .map((r) => str(r.studentId))
        .filter((id) => id !== "");
}
export async function hasSystemLateFeeForQuarter(pool, studentExternalId, term, year) {
    const [rows] = await pool.query(`SELECT 1 AS ok
     FROM portal_billing_adjustments
     WHERE student_external_id = ?
       AND term = ?
       AND year = ?
       AND adjustment_source = 'system_late_fee'
     LIMIT 1`, [studentExternalId.trim(), term.trim(), Math.trunc(year)]);
    return rows.length > 0;
}
export async function insertPortalBillingAdjustment(pool, params) {
    const src = params.adjustmentSource ?? "manual";
    await pool.execute(`INSERT INTO portal_billing_adjustments
      (student_external_id, term, year, description, amount, category, adjustment_source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        params.studentExternalId.trim(),
        params.term.trim(),
        Math.trunc(params.year),
        params.description.trim(),
        params.amount,
        params.category,
        src,
    ]);
}
export async function insertSystemLateFee(pool, params) {
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
export async function insertPortalPayment(pool, params) {
    await pool.execute(`INSERT INTO portal_payments
      (student_external_id, term, year, amount, paid_at, method, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        params.studentExternalId.trim(),
        params.term.trim(),
        Math.trunc(params.year),
        params.amount,
        params.paidAt.trim().slice(0, 10),
        params.method.trim(),
        params.description,
    ]);
}
export async function getBillingAdjustmentById(pool, id) {
    const [rows] = await pool.query(`SELECT id,
            student_external_id AS studentExternalId,
            term,
            year,
            description,
            amount,
            category,
            adjustment_source AS adjustmentSource
     FROM portal_billing_adjustments
     WHERE id = ?
     LIMIT 1`, [Math.trunc(id)]);
    const r = rows[0];
    if (!r)
        return null;
    return {
        id: Number(r.id),
        studentExternalId: str(r.studentExternalId),
        term: str(r.term),
        year: Number(r.year),
        description: str(r.description),
        amount: Number(r.amount),
        category: str(r.category),
        adjustmentSource: str(r.adjustmentSource),
    };
}
export async function updateManualBillingAdjustment(pool, id, params) {
    const [res] = await pool.execute(`UPDATE portal_billing_adjustments
     SET description = ?, amount = ?, category = ?
     WHERE id = ?
       AND adjustment_source = 'manual'`, [
        params.description.trim(),
        params.amount,
        params.category,
        Math.trunc(id),
    ]);
    const ok = res.affectedRows ?? 0;
    if (ok === 0) {
        throw new Error("NOT_MANUAL_OR_MISSING");
    }
}
export async function deleteManualBillingAdjustment(pool, id) {
    const [res] = await pool.execute(`DELETE FROM portal_billing_adjustments
     WHERE id = ?
       AND adjustment_source = 'manual'`, [Math.trunc(id)]);
    const ok = res.affectedRows ?? 0;
    if (ok === 0) {
        throw new Error("NOT_MANUAL_OR_MISSING");
    }
}
export async function getPortalPaymentById(pool, id) {
    const [rows] = await pool.query(`SELECT id,
            student_external_id AS studentExternalId,
            term,
            year,
            amount,
            paid_at AS paidAt,
            method,
            description
     FROM portal_payments
     WHERE id = ?
     LIMIT 1`, [Math.trunc(id)]);
    const r = rows[0];
    if (!r)
        return null;
    const paid = r.paidAt;
    let paidAt = "";
    if (paid instanceof Date) {
        paidAt = paid.toISOString().slice(0, 10);
    }
    else {
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
export async function updatePortalPayment(pool, id, params) {
    await pool.execute(`UPDATE portal_payments
     SET amount = ?, paid_at = ?, method = ?, description = ?
     WHERE id = ?`, [
        params.amount,
        params.paidAt.trim().slice(0, 10),
        params.method.trim(),
        params.description,
        Math.trunc(id),
    ]);
}
export async function deletePortalPayment(pool, id) {
    const [res] = await pool.execute(`DELETE FROM portal_payments WHERE id = ?`, [
        Math.trunc(id),
    ]);
    const ok = res.affectedRows ?? 0;
    if (ok === 0) {
        throw new Error("MISSING_PAYMENT");
    }
}
//# sourceMappingURL=adminFinanceRepository.js.map
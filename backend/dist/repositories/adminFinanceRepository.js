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
/** Escape `%`, `_`, and `\\` for use in a MySQL `LIKE` pattern with `ESCAPE '\\\\'`. */
function escapeMysqlLikePattern(fragment) {
    return fragment
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
}
function buildFinanceRosterSearchClause(searchTrimmed) {
    if (searchTrimmed === "") {
        return { clause: "", params: [] };
    }
    const like = `%${escapeMysqlLikePattern(searchTrimmed.toLowerCase())}%`;
    return {
        clause: ` AND (
      LOWER(r.student_id) LIKE ? ESCAPE '\\\\'
      OR LOWER(r.display_name) LIKE ? ESCAPE '\\\\'
    )`,
        params: [like, like],
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
/**
 * Count of finance roster rows after search only (balance filters run in the service).
 */
export async function countAdminFinanceRosterSearchOnly(pool, params) {
    const { clause: searchClause, params: searchParams } = buildFinanceRosterSearchClause(params.searchTrimmed);
    const sql = `${ADMIN_FINANCE_ROSTER_BASE_SQL}
    SELECT COUNT(*) AS cnt
    FROM roster r
    WHERE 1 = 1
    ${searchClause}`;
    const [rows] = await pool.query(sql, [...searchParams]);
    const row = rows[0];
    if (row == null)
        return 0;
    const n = Number(row.cnt);
    return Number.isFinite(n) ? n : 0;
}
/**
 * One page of finance roster (student id + name) after search; stable name / id ordering.
 */
export async function listAdminFinanceRosterPageSearchOnly(pool, params) {
    const limit = Math.max(0, Math.trunc(params.limit));
    const offset = Math.max(0, Math.trunc(params.offset));
    const { clause: searchClause, params: searchParams } = buildFinanceRosterSearchClause(params.searchTrimmed);
    const sql = `${ADMIN_FINANCE_ROSTER_BASE_SQL}
    SELECT r.student_id AS studentId,
           r.display_name AS name
    FROM roster r
    WHERE 1 = 1
    ${searchClause}
    ORDER BY r.display_name ASC, r.student_id ASC
    LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [
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
export async function listAdminFinanceRosterAllSearchOnlyOrdered(pool, params) {
    const { clause: searchClause, params: searchParams } = buildFinanceRosterSearchClause(params.searchTrimmed);
    const sql = `${ADMIN_FINANCE_ROSTER_BASE_SQL}
    SELECT r.student_id AS studentId,
           r.display_name AS name
    FROM roster r
    WHERE 1 = 1
    ${searchClause}
    ORDER BY r.display_name ASC, r.student_id ASC`;
    const [rows] = await pool.query(sql, [...searchParams]);
    return rows.map((r) => ({
        studentId: str(r.studentId),
        name: str(r.name),
    }));
}
/** `SUM(amount)` of `portal_billing_adjustments` per student for a quarter (signed; matches ledger adjustment lines). */
export async function sumPortalBillingAdjustmentsNetByStudentForQuarter(pool, term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const [rows] = await pool.query(`SELECT TRIM(student_external_id) AS studentId,
            COALESCE(SUM(amount), 0) AS net
     FROM portal_billing_adjustments
     WHERE term = ? AND year = ?
     GROUP BY TRIM(student_external_id)`, [t, y]);
    const m = new Map();
    for (const r of rows) {
        const id = str(r.studentId);
        if (id === "")
            continue;
        const n = Number(r.net);
        m.set(id, Number.isFinite(n) ? n : 0);
    }
    return m;
}
/** Total `portal_payments.amount` per student for a quarter (amounts stored as positive credits). */
export async function sumPortalPaymentsByStudentForQuarter(pool, term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const [rows] = await pool.query(`SELECT TRIM(student_external_id) AS studentId,
            COALESCE(SUM(amount), 0) AS paid
     FROM portal_payments
     WHERE term = ? AND year = ?
     GROUP BY TRIM(student_external_id)`, [t, y]);
    const m = new Map();
    for (const r of rows) {
        const id = str(r.studentId);
        if (id === "")
            continue;
        const n = Number(r.paid);
        m.set(id, Number.isFinite(n) ? n : 0);
    }
    return m;
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
       SELECT DISTINCT
         CONVERT(TRIM(COALESCE(term, '')) USING utf8mb4) AS term,
         CAST(year AS SIGNED) AS year
       FROM portal_enrollments
       UNION
       SELECT DISTINCT
         CONVERT(TRIM(COALESCE(term, '')) USING utf8mb4) AS term,
         CAST(year AS SIGNED) AS year
       FROM portal_billing_adjustments
       UNION
       SELECT DISTINCT
         CONVERT(TRIM(COALESCE(term, '')) USING utf8mb4) AS term,
         CAST(year AS SIGNED) AS year
       FROM portal_payments
       UNION
       SELECT DISTINCT
         CONVERT(TRIM(COALESCE(term, '')) USING utf8mb4) AS term,
         CAST(year AS SIGNED) AS year
       FROM registration
       UNION
       SELECT DISTINCT
         CONVERT(TRIM(COALESCE(term, '')) USING utf8mb4) AS term,
         CAST(year AS SIGNED) AS year
       FROM accounting
       UNION
       SELECT DISTINCT
         CONVERT(TRIM(COALESCE(term_name, '')) USING utf8mb4) AS term,
         CAST(year AS SIGNED) AS year
       FROM academic_terms
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
let cachedAcademicTermsPaymentDueDateColumn = null;
/**
 * Detects optional `academic_terms.payment_due_date` without migrations.
 * Cached for the process lifetime.
 */
export async function academicTermsPaymentDueDateColumnExists(pool) {
    if (cachedAcademicTermsPaymentDueDateColumn !== null) {
        return cachedAcademicTermsPaymentDueDateColumn;
    }
    try {
        const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'academic_terms'
         AND COLUMN_NAME = 'payment_due_date'`);
        cachedAcademicTermsPaymentDueDateColumn = Number(rows[0]?.c) > 0;
    }
    catch {
        cachedAcademicTermsPaymentDueDateColumn = false;
    }
    return cachedAcademicTermsPaymentDueDateColumn;
}
function paymentDueDateFromDbValue(due) {
    if (due == null)
        return null;
    if (due instanceof Date) {
        return due.toISOString().slice(0, 10);
    }
    if (typeof due === "string" && due.trim() !== "") {
        return due.trim().slice(0, 10);
    }
    return null;
}
/** Payment DDL and whether a matching `academic_terms` row exists for this finance quarter. */
export async function getFinanceQuarterDdlFromAcademicTerms(pool, term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const [existRows] = await pool.query(`SELECT 1 AS ok FROM academic_terms
     WHERE LOWER(TRIM(term_name)) = LOWER(TRIM(?)) AND year = ?
     LIMIT 1`, [t, y]);
    const rowExists = existRows.length > 0;
    const hasCol = await academicTermsPaymentDueDateColumnExists(pool);
    if (!hasCol) {
        return { paymentDueDate: null, rowExists };
    }
    const [rows] = await pool.query(`SELECT payment_due_date AS paymentDueDate FROM academic_terms
     WHERE LOWER(TRIM(term_name)) = LOWER(TRIM(?)) AND year = ?
     LIMIT 1`, [t, y]);
    const r = rows[0];
    if (!r) {
        return { paymentDueDate: null, rowExists };
    }
    return {
        paymentDueDate: paymentDueDateFromDbValue(r.paymentDueDate),
        rowExists,
    };
}
export async function setFinanceQuarterDdlOnAcademicTerms(pool, term, year, paymentDueDate) {
    const hasCol = await academicTermsPaymentDueDateColumnExists(pool);
    if (!hasCol)
        return "no_column";
    const [res] = await pool.execute(`UPDATE academic_terms SET payment_due_date = ?
     WHERE LOWER(TRIM(term_name)) = LOWER(TRIM(?)) AND year = ?`, [paymentDueDate, term.trim(), Math.trunc(year)]);
    const affected = res.affectedRows ?? 0;
    if (affected === 0)
        return "not_found";
    return "ok";
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
    const ce = params.clinicalEnrollmentId;
    const hasCe = ce != null && Number.isFinite(Number(ce)) && Math.trunc(Number(ce)) > 0;
    const rawReversal = params.reversalOfAdjustmentId;
    const hasReversal = rawReversal != null &&
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
    const [res] = await pool.execute(sql, values);
    return Math.trunc(Number(res.insertId));
}
let cachedPortalBillingReversalColumnExists = null;
async function portalBillingAdjustmentsReversalColumnExists(pool) {
    if (cachedPortalBillingReversalColumnExists !== null) {
        return cachedPortalBillingReversalColumnExists;
    }
    try {
        const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'portal_billing_adjustments'
         AND COLUMN_NAME = 'reversal_of_adjustment_id'`);
        cachedPortalBillingReversalColumnExists = Number(rows[0]?.c) > 0;
    }
    catch {
        cachedPortalBillingReversalColumnExists = false;
    }
    return cachedPortalBillingReversalColumnExists;
}
export async function insertSystemLateFee(pool, params) {
    const studentId = params.studentExternalId.trim();
    const term = params.term.trim();
    const year = Math.trunc(params.year);
    try {
        await pool.execute(`INSERT INTO portal_billing_adjustments
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
       )`, [
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
        ]);
    }
    catch (error) {
        const code = error.code;
        // Secondary safeguard: ignore race duplicates once unique DB constraint exists.
        if (code === "ER_DUP_ENTRY") {
            return;
        }
        throw error;
    }
}
export async function listSystemLateFeeRowsForQuarter(pool, term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const hasReversalColumn = await portalBillingAdjustmentsReversalColumnExists(pool);
    if (!hasReversalColumn) {
        const [rows] = await pool.query(`SELECT id,
              student_external_id AS studentExternalId,
              term,
              year,
              amount
       FROM portal_billing_adjustments
       WHERE adjustment_source = 'system_late_fee'
         AND term = ?
         AND year = ?`, [t, y]);
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
    const [rows] = await pool.query(`SELECT fee.id,
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
     GROUP BY fee.id, fee.student_external_id, fee.term, fee.year, fee.amount`, [t, y]);
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
export async function insertSystemLateFeeReversal(pool, params) {
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
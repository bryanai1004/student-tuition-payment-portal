import { pool } from "../lib/db.js";
function rowWantsPersistedPaymentPolicy(row) {
    const pdd = row.payment_due_date;
    if (pdd != null && String(pdd).trim() !== "")
        return true;
    return row.lock_registration_if_overdue === true;
}
/**
 * When the DB has no payment-policy columns but the caller supplies values,
 * fail loudly instead of returning 200 with data that was never written.
 */
function assertPaymentPolicyWritable(hasPaymentPolicyColumns, row) {
    if (hasPaymentPolicyColumns)
        return;
    if (!rowWantsPersistedPaymentPolicy(row))
        return;
    throw new Error("Database schema is missing academic_terms.payment_due_date and/or lock_registration_if_overdue. Apply backend/migrations/001_academic_terms_payment_policy.sql.");
}
function nullableDateString(v) {
    if (v === undefined || v === null)
        return null;
    if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, "0");
        const d = String(v.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s))
        return s.slice(0, 10);
    return s;
}
function asBool(v) {
    if (typeof v === "boolean")
        return v;
    if (typeof v === "number")
        return v !== 0;
    if (typeof v === "bigint")
        return v !== 0n;
    const s = String(v).toLowerCase();
    return s === "1" || s === "true";
}
function normalizeRow(row) {
    const paymentDue = row.payment_due_date !== undefined
        ? nullableDateString(row.payment_due_date)
        : null;
    const lockReg = row.lock_registration_if_overdue !== undefined
        ? asBool(row.lock_registration_if_overdue)
        : false;
    const posted = row.is_posted_to_dashboard !== undefined
        ? asBool(row.is_posted_to_dashboard)
        : false;
    return {
        id: String(row.id ?? ""),
        term_label: String(row.term_label ?? ""),
        year: Number(row.year),
        term_name: row.term_name,
        quarter_index: Number(row.quarter_index),
        sequence_no: Number(row.sequence_no),
        start_date: nullableDateString(row.start_date),
        end_date: nullableDateString(row.end_date),
        registration_open: nullableDateString(row.registration_open),
        registration_close: nullableDateString(row.registration_close),
        withdraw_deadline: nullableDateString(row.withdraw_deadline),
        payment_due_date: paymentDue,
        lock_registration_if_overdue: lockReg,
        status: row.status,
        is_visible: asBool(row.is_visible),
        is_posted_to_dashboard: posted,
    };
}
function buildTermSelectSql(hasPaymentPolicyColumns, hasPostedToDashboardColumn) {
    const paymentBlock = hasPaymentPolicyColumns
        ? `    withdraw_deadline,
    payment_due_date,
    lock_registration_if_overdue,
`
        : `    withdraw_deadline,
`;
    const postedSuffix = hasPostedToDashboardColumn
        ? ",\n    is_posted_to_dashboard"
        : "";
    return `
  SELECT
    id,
    term_label,
    year,
    term_name,
    quarter_index,
    sequence_no,
    start_date,
    end_date,
    registration_open,
    registration_close,
${paymentBlock}    status,
    is_visible${postedSuffix}
  FROM academic_terms
`;
}
let cachedSchemaCaps = null;
function isMissingColumnError(e) {
    const err = e;
    return err.code === "ER_BAD_FIELD_ERROR" || err.errno === 1054;
}
/**
 * Detects once per process which optional `academic_terms` columns exist. Uses the same
 * table resolution as app queries (not information_schema), so capability matches
 * actual SELECT/INSERT/UPDATE behavior.
 */
export async function academicTermSchemaCaps() {
    if (cachedSchemaCaps !== null) {
        return cachedSchemaCaps;
    }
    let hasPaymentPolicyColumns = false;
    try {
        await pool.query(`SELECT payment_due_date, lock_registration_if_overdue FROM academic_terms WHERE 1=0`);
        hasPaymentPolicyColumns = true;
    }
    catch (e) {
        if (isMissingColumnError(e)) {
            hasPaymentPolicyColumns = false;
        }
        else {
            throw e;
        }
    }
    let hasPostedToDashboardColumn = false;
    try {
        await pool.query(`SELECT is_posted_to_dashboard FROM academic_terms WHERE 1=0`);
        hasPostedToDashboardColumn = true;
    }
    catch (e) {
        if (isMissingColumnError(e)) {
            hasPostedToDashboardColumn = false;
        }
        else {
            throw e;
        }
    }
    cachedSchemaCaps = {
        selectSql: buildTermSelectSql(hasPaymentPolicyColumns, hasPostedToDashboardColumn),
        hasPaymentPolicyColumns,
        hasPostedToDashboardColumn,
    };
    return cachedSchemaCaps;
}
async function termSelectSql() {
    return (await academicTermSchemaCaps()).selectSql;
}
export async function listAcademicTerms() {
    const sel = await termSelectSql();
    const sql = `${sel} ORDER BY sequence_no DESC`;
    const [rows] = await pool.query(sql);
    return rows.map((r) => normalizeRow(r));
}
export async function listVisibleAcademicTerms(limit) {
    const lim = typeof limit === "number" &&
        Number.isInteger(limit) &&
        limit > 0
        ? limit
        : undefined;
    const sel = await termSelectSql();
    const sql = lim
        ? `${sel} WHERE is_visible = 1 ORDER BY sequence_no DESC LIMIT ?`
        : `${sel} WHERE is_visible = 1 ORDER BY sequence_no DESC`;
    const [rows] = await pool.query(sql, lim ? [lim] : []);
    return rows.map((r) => normalizeRow(r));
}
export async function listRecentVisibleAcademicTerms(limit = 3) {
    return listVisibleAcademicTerms(limit);
}
export async function getAcademicTermById(id) {
    const sel = await termSelectSql();
    const sql = `${sel} WHERE id = ? LIMIT 1`;
    const [rows] = await pool.query(sql, [id]);
    const row = rows[0];
    return row ? normalizeRow(row) : null;
}
export async function getCurrentRegistrationOpenTerm() {
    const sel = await termSelectSql();
    const sql = `${sel} WHERE status = 'registration_open' ORDER BY sequence_no DESC LIMIT 1`;
    const [rows] = await pool.query(sql);
    const row = rows[0];
    return row ? normalizeRow(row) : null;
}
export async function getPostedToDashboardTerm() {
    const { hasPostedToDashboardColumn } = await academicTermSchemaCaps();
    if (!hasPostedToDashboardColumn) {
        return null;
    }
    const sel = await termSelectSql();
    const sql = `${sel} WHERE is_posted_to_dashboard = 1 ORDER BY sequence_no DESC LIMIT 1`;
    const [rows] = await pool.query(sql);
    const row = rows[0];
    return row ? normalizeRow(row) : null;
}
/**
 * Clears all posted flags, then marks `id` as posted. Requires `is_posted_to_dashboard` column.
 */
export async function postAcademicTermToDashboard(id) {
    const { hasPostedToDashboardColumn } = await academicTermSchemaCaps();
    if (!hasPostedToDashboardColumn) {
        throw new Error("Database schema is missing academic_terms.is_posted_to_dashboard. Apply backend/migrations/005_academic_terms_is_posted_to_dashboard.sql.");
    }
    const trimmed = id.trim();
    const existing = await getAcademicTermById(trimmed);
    if (!existing) {
        return null;
    }
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(`UPDATE academic_terms SET is_posted_to_dashboard = 0`);
        const [res] = await conn.query(`UPDATE academic_terms SET is_posted_to_dashboard = 1 WHERE id = ?`, [trimmed]);
        if (res.affectedRows === 0) {
            await conn.rollback();
            return null;
        }
        await conn.commit();
    }
    catch (e) {
        await conn.rollback();
        throw e;
    }
    finally {
        conn.release();
    }
    return getAcademicTermById(trimmed);
}
export async function insertAcademicTerm(row) {
    const { hasPaymentPolicyColumns, hasPostedToDashboardColumn } = await academicTermSchemaCaps();
    assertPaymentPolicyWritable(hasPaymentPolicyColumns, row);
    if (hasPaymentPolicyColumns) {
        const postedCols = hasPostedToDashboardColumn
            ? ",\n      is_posted_to_dashboard"
            : "";
        const postedVals = hasPostedToDashboardColumn ? ", ?" : "";
        const sql = `
    INSERT INTO academic_terms (
      id,
      term_label,
      year,
      term_name,
      quarter_index,
      sequence_no,
      start_date,
      end_date,
      registration_open,
      registration_close,
      withdraw_deadline,
      payment_due_date,
      lock_registration_if_overdue,
      status,
      is_visible${postedCols}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${postedVals})
  `;
        const params = [
            row.id,
            row.term_label,
            row.year,
            row.term_name,
            row.quarter_index,
            row.sequence_no,
            row.start_date,
            row.end_date,
            row.registration_open,
            row.registration_close,
            row.withdraw_deadline,
            row.payment_due_date,
            row.lock_registration_if_overdue ? 1 : 0,
            row.status,
            row.is_visible ? 1 : 0,
        ];
        if (hasPostedToDashboardColumn) {
            params.push(row.is_posted_to_dashboard ? 1 : 0);
        }
        await pool.query(sql, params);
    }
    else {
        const postedCols = hasPostedToDashboardColumn
            ? ",\n      is_posted_to_dashboard"
            : "";
        const postedVals = hasPostedToDashboardColumn ? ", ?" : "";
        const sql = `
    INSERT INTO academic_terms (
      id,
      term_label,
      year,
      term_name,
      quarter_index,
      sequence_no,
      start_date,
      end_date,
      registration_open,
      registration_close,
      withdraw_deadline,
      status,
      is_visible${postedCols}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${postedVals})
  `;
        const params = [
            row.id,
            row.term_label,
            row.year,
            row.term_name,
            row.quarter_index,
            row.sequence_no,
            row.start_date,
            row.end_date,
            row.registration_open,
            row.registration_close,
            row.withdraw_deadline,
            row.status,
            row.is_visible ? 1 : 0,
        ];
        if (hasPostedToDashboardColumn) {
            params.push(row.is_posted_to_dashboard ? 1 : 0);
        }
        await pool.query(sql, params);
    }
    const created = await getAcademicTermById(row.id);
    if (!created) {
        throw new Error("Failed to load academic term after insert");
    }
    return created;
}
/**
 * Full row replace by current primary key `currentId` (supports changing `id` when year/term_name change).
 */
export async function updateAcademicTermRow(currentId, row) {
    const existing = await getAcademicTermById(currentId);
    if (!existing)
        return null;
    const { hasPaymentPolicyColumns, hasPostedToDashboardColumn } = await academicTermSchemaCaps();
    assertPaymentPolicyWritable(hasPaymentPolicyColumns, row);
    const postedSet = hasPostedToDashboardColumn
        ? ",\n      is_posted_to_dashboard = ?"
        : "";
    if (hasPaymentPolicyColumns) {
        const sql = `
    UPDATE academic_terms SET
      id = ?,
      term_label = ?,
      year = ?,
      term_name = ?,
      quarter_index = ?,
      sequence_no = ?,
      start_date = ?,
      end_date = ?,
      registration_open = ?,
      registration_close = ?,
      withdraw_deadline = ?,
      payment_due_date = ?,
      lock_registration_if_overdue = ?,
      status = ?,
      is_visible = ?${postedSet}
    WHERE id = ?
  `;
        const params = [
            row.id,
            row.term_label,
            row.year,
            row.term_name,
            row.quarter_index,
            row.sequence_no,
            row.start_date,
            row.end_date,
            row.registration_open,
            row.registration_close,
            row.withdraw_deadline,
            row.payment_due_date,
            row.lock_registration_if_overdue ? 1 : 0,
            row.status,
            row.is_visible ? 1 : 0,
        ];
        if (hasPostedToDashboardColumn) {
            params.push(row.is_posted_to_dashboard ? 1 : 0);
        }
        params.push(currentId);
        await pool.query(sql, params);
    }
    else {
        const sql = `
    UPDATE academic_terms SET
      id = ?,
      term_label = ?,
      year = ?,
      term_name = ?,
      quarter_index = ?,
      sequence_no = ?,
      start_date = ?,
      end_date = ?,
      registration_open = ?,
      registration_close = ?,
      withdraw_deadline = ?,
      status = ?,
      is_visible = ?${postedSet}
    WHERE id = ?
  `;
        const params = [
            row.id,
            row.term_label,
            row.year,
            row.term_name,
            row.quarter_index,
            row.sequence_no,
            row.start_date,
            row.end_date,
            row.registration_open,
            row.registration_close,
            row.withdraw_deadline,
            row.status,
            row.is_visible ? 1 : 0,
        ];
        if (hasPostedToDashboardColumn) {
            params.push(row.is_posted_to_dashboard ? 1 : 0);
        }
        params.push(currentId);
        await pool.query(sql, params);
    }
    return getAcademicTermById(row.id);
}
//# sourceMappingURL=academicTermRepository.js.map
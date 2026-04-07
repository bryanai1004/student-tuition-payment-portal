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
        payment_due_date: paymentDue,
        lock_registration_if_overdue: lockReg,
        status: row.status,
        is_visible: asBool(row.is_visible),
    };
}
/** Columns shared by legacy and current `academic_terms` schemas. */
const TERM_SELECT_BASE = `
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
    status,
    is_visible
  FROM academic_terms
`;
const TERM_SELECT_WITH_PAYMENT_COLUMNS = `
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
    payment_due_date,
    lock_registration_if_overdue,
    status,
    is_visible
  FROM academic_terms
`;
let cachedSchemaCaps = null;
/**
 * Detects once per process whether `payment_due_date` and `lock_registration_if_overdue`
 * exist on `academic_terms`. Uses the same table resolution as app queries (not
 * information_schema), so capability matches actual SELECT/INSERT/UPDATE behavior.
 */
export async function academicTermSchemaCaps() {
    if (cachedSchemaCaps !== null) {
        return cachedSchemaCaps;
    }
    try {
        await pool.query(`SELECT payment_due_date, lock_registration_if_overdue FROM academic_terms WHERE 1=0`);
        cachedSchemaCaps = {
            selectSql: TERM_SELECT_WITH_PAYMENT_COLUMNS,
            hasPaymentPolicyColumns: true,
        };
    }
    catch (e) {
        const err = e;
        const missingColumn = err.code === "ER_BAD_FIELD_ERROR" || err.errno === 1054;
        if (missingColumn) {
            cachedSchemaCaps = {
                selectSql: TERM_SELECT_BASE,
                hasPaymentPolicyColumns: false,
            };
        }
        else {
            throw e;
        }
    }
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
export async function insertAcademicTerm(row) {
    const { hasPaymentPolicyColumns } = await academicTermSchemaCaps();
    assertPaymentPolicyWritable(hasPaymentPolicyColumns, row);
    if (hasPaymentPolicyColumns) {
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
      payment_due_date,
      lock_registration_if_overdue,
      status,
      is_visible
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            row.payment_due_date,
            row.lock_registration_if_overdue ? 1 : 0,
            row.status,
            row.is_visible ? 1 : 0,
        ];
        await pool.query(sql, params);
    }
    else {
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
      status,
      is_visible
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            row.status,
            row.is_visible ? 1 : 0,
        ];
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
    const { hasPaymentPolicyColumns } = await academicTermSchemaCaps();
    assertPaymentPolicyWritable(hasPaymentPolicyColumns, row);
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
      payment_due_date = ?,
      lock_registration_if_overdue = ?,
      status = ?,
      is_visible = ?
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
            row.payment_due_date,
            row.lock_registration_if_overdue ? 1 : 0,
            row.status,
            row.is_visible ? 1 : 0,
            currentId,
        ];
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
      status = ?,
      is_visible = ?
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
            row.status,
            row.is_visible ? 1 : 0,
            currentId,
        ];
        await pool.query(sql, params);
    }
    return getAcademicTermById(row.id);
}
//# sourceMappingURL=academicTermRepository.js.map
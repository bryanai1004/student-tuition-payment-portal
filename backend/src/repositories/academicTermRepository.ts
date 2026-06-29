import { pool, type ResultSetHeader, type RowDataPacket } from "../lib/db.js";
import { isMissingColumn } from "../lib/dbErrors.js";
import type { AcademicTermDetail, AcademicTermName, AcademicTermStatus } from "../types/academicTerm.js";

function rowWantsPersistedPaymentPolicy(row: AcademicTermInsertRow): boolean {
  const pdd = row.payment_due_date;
  if (pdd != null && String(pdd).trim() !== "") return true;
  return row.lock_registration_if_overdue === true;
}

/**
 * When the DB has no payment-policy columns but the caller supplies values,
 * fail loudly instead of returning 200 with data that was never written.
 */
function assertPaymentPolicyWritable(
  hasPaymentPolicyColumns: boolean,
  row: AcademicTermInsertRow,
): void {
  if (hasPaymentPolicyColumns) return;
  if (!rowWantsPersistedPaymentPolicy(row)) return;
  throw new Error(
    "Database schema is missing academic_terms.payment_due_date and/or lock_registration_if_overdue. Apply backend/migrations/001_academic_terms_payment_policy.sql.",
  );
}

function nullableDateString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "bigint") return v !== 0n;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true";
}

function normalizeRow(row: RowDataPacket): AcademicTermDetail {
  const paymentDue =
    row.payment_due_date !== undefined
      ? nullableDateString(row.payment_due_date)
      : null;
  const lockReg =
    row.lock_registration_if_overdue !== undefined
      ? asBool(row.lock_registration_if_overdue)
      : false;
  const posted =
    row.is_posted_to_dashboard !== undefined
      ? asBool(row.is_posted_to_dashboard)
      : false;
  return {
    id: String(row.id ?? ""),
    term_label: String(row.term_label ?? ""),
    year: Number(row.year),
    term_name: row.term_name as AcademicTermName,
    quarter_index: Number(row.quarter_index),
    sequence_no: Number(row.sequence_no),
    start_date: nullableDateString(row.start_date),
    end_date: nullableDateString(row.end_date),
    registration_open: nullableDateString(row.registration_open),
    registration_close: nullableDateString(row.registration_close),
    withdraw_deadline: nullableDateString(row.withdraw_deadline),
    payment_due_date: paymentDue,
    clinic_appointment_deadline: nullableDateString(row.clinic_appointment_deadline),
    lock_registration_if_overdue: lockReg,
    status: row.status as AcademicTermStatus,
    is_visible: asBool(row.is_visible),
    is_posted_to_dashboard: posted,
  };
}

function buildTermSelectSql(
  hasPaymentPolicyColumns: boolean,
  hasPostedToDashboardColumn: boolean,
): string {
  const paymentBlock = hasPaymentPolicyColumns
    ? `    withdraw_deadline,
    payment_due_date,
    clinic_appointment_deadline,
    lock_registration_if_overdue,
`
    : `    withdraw_deadline,
    clinic_appointment_deadline,
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

export type AcademicTermSchemaCaps = {
  selectSql: string;
  /** True only when both optional columns exist (partial schemas use legacy paths). */
  hasPaymentPolicyColumns: boolean;
  hasPostedToDashboardColumn: boolean;
};

let cachedSchemaCaps: AcademicTermSchemaCaps | null = null;

function isMissingColumnError(e: unknown): boolean {
  return isMissingColumn(e);
}

/**
 * Detects once per process which optional `academic_terms` columns exist. Uses the same
 * table resolution as app queries (not information_schema), so capability matches
 * actual SELECT/INSERT/UPDATE behavior.
 */
export async function academicTermSchemaCaps(): Promise<AcademicTermSchemaCaps> {
  if (cachedSchemaCaps !== null) {
    return cachedSchemaCaps;
  }
  let hasPaymentPolicyColumns = false;
  try {
    await pool.query(
      `SELECT payment_due_date, lock_registration_if_overdue FROM academic_terms WHERE 1=0`,
    );
    hasPaymentPolicyColumns = true;
  } catch (e) {
    if (isMissingColumnError(e)) {
      hasPaymentPolicyColumns = false;
    } else {
      throw e;
    }
  }
  let hasPostedToDashboardColumn = false;
  try {
    await pool.query(
      `SELECT is_posted_to_dashboard FROM academic_terms WHERE 1=0`,
    );
    hasPostedToDashboardColumn = true;
  } catch (e) {
    if (isMissingColumnError(e)) {
      hasPostedToDashboardColumn = false;
    } else {
      throw e;
    }
  }
  cachedSchemaCaps = {
    selectSql: buildTermSelectSql(
      hasPaymentPolicyColumns,
      hasPostedToDashboardColumn,
    ),
    hasPaymentPolicyColumns,
    hasPostedToDashboardColumn,
  };
  return cachedSchemaCaps;
}

async function termSelectSql(): Promise<string> {
  return (await academicTermSchemaCaps()).selectSql;
}

export async function listAcademicTerms(): Promise<AcademicTermDetail[]> {
  const sel = await termSelectSql();
  const sql = `${sel} ORDER BY sequence_no DESC`;
  const [rows] = await pool.query<RowDataPacket[]>(sql);
  return rows.map((r) => normalizeRow(r));
}

export async function listVisibleAcademicTerms(
  limit?: number,
): Promise<AcademicTermDetail[]> {
  const lim =
    typeof limit === "number" &&
    Number.isInteger(limit) &&
    limit > 0
      ? limit
      : undefined;
  const sel = await termSelectSql();
  const sql = lim
    ? `${sel} WHERE is_visible = 1 ORDER BY sequence_no DESC LIMIT ?`
    : `${sel} WHERE is_visible = 1 ORDER BY sequence_no DESC`;
  const [rows] = await pool.query<RowDataPacket[]>(
    sql,
    lim ? [lim] : [],
  );
  return rows.map((r) => normalizeRow(r));
}

export async function listRecentVisibleAcademicTerms(
  limit = 3,
): Promise<AcademicTermDetail[]> {
  return listVisibleAcademicTerms(limit);
}

export async function getAcademicTermById(
  id: string,
): Promise<AcademicTermDetail | null> {
  const sel = await termSelectSql();
  const sql = `${sel} WHERE id = ? LIMIT 1`;
  const [rows] = await pool.query<RowDataPacket[]>(sql, [id]);
  const row = rows[0];
  return row ? normalizeRow(row) : null;
}

export async function getCurrentRegistrationOpenTerm(): Promise<AcademicTermDetail | null> {
  const sel = await termSelectSql();
  const sql = `${sel} WHERE status = 'registration_open' ORDER BY sequence_no DESC LIMIT 1`;
  const [rows] = await pool.query<RowDataPacket[]>(sql);
  const row = rows[0];
  return row ? normalizeRow(row) : null;
}

export async function getPostedToDashboardTerm(): Promise<AcademicTermDetail | null> {
  const { hasPostedToDashboardColumn } = await academicTermSchemaCaps();
  if (!hasPostedToDashboardColumn) {
    return null;
  }
  const sel = await termSelectSql();
  const sql = `${sel} WHERE is_posted_to_dashboard = 1 ORDER BY sequence_no DESC LIMIT 1`;
  const [rows] = await pool.query<RowDataPacket[]>(sql);
  const row = rows[0];
  return row ? normalizeRow(row) : null;
}

async function listExistingTables(tableNames: readonly string[]): Promise<Set<string>> {
  if (tableNames.length === 0) return new Set<string>();
  const placeholders = tableNames.map(() => "?").join(", ");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${placeholders})`,
    [...tableNames],
  );
  return new Set(rows.map((r) => String(r.table_name ?? r.TABLE_NAME ?? "").trim()));
}

async function countRows(
  sql: string,
  params: readonly (string | number)[],
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, [...params]);
  const cntRaw = rows[0]?.cnt;
  const cnt = Number(cntRaw);
  return Number.isFinite(cnt) && cnt > 0 ? Math.trunc(cnt) : 0;
}

const TERM_YEAR_TABLES = [
  "course_sections",
  "portal_enrollments",
  "portal_student_term_prefs",
  "portal_payments",
  "portal_billing_adjustments",
  "portal_term_finance_settings",
  "clinic_timetable",
  "clinical_enrollments",
  "clinical_assignments",
  "clinical_requests",
] as const;

const TERM_ID_TABLES = [
  "portal_document_requirements",
  "portal_document_requirement_attempts",
] as const;

export type AcademicTermDeleteDependencies = {
  courseSections: number;
  portalEnrollments: number;
  clinicalTimetableSlots: number;
  clinicalEnrollments: number;
  clinicalAssignments: number;
  clinicalRequests: number;
  portalDocumentRequirements: number;
  portalDocumentRequirementAttempts: number;
  portalTermFinanceSettings: number;
  portalPayments: number;
  portalBillingAdjustments: number;
  portalStudentTermPrefs: number;
};

export async function countAcademicTermDeleteDependencies(
  id: string,
  termName: string,
  year: number,
): Promise<AcademicTermDeleteDependencies> {
  const existing = await listExistingTables([...TERM_YEAR_TABLES, ...TERM_ID_TABLES]);
  const out: AcademicTermDeleteDependencies = {
    courseSections: 0,
    portalEnrollments: 0,
    clinicalTimetableSlots: 0,
    clinicalEnrollments: 0,
    clinicalAssignments: 0,
    clinicalRequests: 0,
    portalDocumentRequirements: 0,
    portalDocumentRequirementAttempts: 0,
    portalTermFinanceSettings: 0,
    portalPayments: 0,
    portalBillingAdjustments: 0,
    portalStudentTermPrefs: 0,
  };

  const termYearCountSql = (tableName: string, alias: string): string => `
    SELECT COUNT(*) AS cnt
      FROM ${tableName} ${alias}
     WHERE ${alias}.term = ?
       AND ${alias}.year = ?
  `;

  const promises: Array<Promise<void>> = [];

  if (existing.has("course_sections")) {
    promises.push(
      countRows(
        termYearCountSql("course_sections", "cs"),
        [termName, year],
      ).then((cnt) => {
        out.courseSections = cnt;
      }),
    );
  }
  if (existing.has("portal_enrollments")) {
    promises.push(
      countRows(
        termYearCountSql("portal_enrollments", "pe"),
        [termName, year],
      ).then((cnt) => {
        out.portalEnrollments = cnt;
      }),
    );
  }
  if (existing.has("clinic_timetable")) {
    promises.push(
      countRows(
        termYearCountSql("clinic_timetable", "ct"),
        [termName, year],
      ).then((cnt) => {
        out.clinicalTimetableSlots = cnt;
      }),
    );
  }
  if (existing.has("clinical_enrollments")) {
    promises.push(
      countRows(
        termYearCountSql("clinical_enrollments", "ce"),
        [termName, year],
      ).then((cnt) => {
        out.clinicalEnrollments = cnt;
      }),
    );
  }
  if (existing.has("clinical_assignments")) {
    promises.push(
      countRows(
        termYearCountSql("clinical_assignments", "ca"),
        [termName, year],
      ).then((cnt) => {
        out.clinicalAssignments = cnt;
      }),
    );
  }
  if (existing.has("clinical_requests")) {
    promises.push(
      countRows(
        termYearCountSql("clinical_requests", "cr"),
        [termName, year],
      ).then((cnt) => {
        out.clinicalRequests = cnt;
      }),
    );
  }
  if (existing.has("portal_term_finance_settings")) {
    promises.push(
      countRows(
        termYearCountSql("portal_term_finance_settings", "ptfs"),
        [termName, year],
      ).then((cnt) => {
        out.portalTermFinanceSettings = cnt;
      }),
    );
  }
  if (existing.has("portal_payments")) {
    promises.push(
      countRows(
        termYearCountSql("portal_payments", "pp"),
        [termName, year],
      ).then((cnt) => {
        out.portalPayments = cnt;
      }),
    );
  }
  if (existing.has("portal_billing_adjustments")) {
    promises.push(
      countRows(
        termYearCountSql("portal_billing_adjustments", "pba"),
        [termName, year],
      ).then((cnt) => {
        out.portalBillingAdjustments = cnt;
      }),
    );
  }
  if (existing.has("portal_student_term_prefs")) {
    promises.push(
      countRows(
        termYearCountSql("portal_student_term_prefs", "pstp"),
        [termName, year],
      ).then((cnt) => {
        out.portalStudentTermPrefs = cnt;
      }),
    );
  }
  if (existing.has("portal_document_requirements")) {
    promises.push(
      countRows(
        `SELECT COUNT(*) AS cnt
           FROM portal_document_requirements
          WHERE academic_term_id = ?`,
        [id],
      ).then((cnt) => {
        out.portalDocumentRequirements = cnt;
      }),
    );
  }
  if (existing.has("portal_document_requirement_attempts")) {
    promises.push(
      countRows(
        `SELECT COUNT(*) AS cnt
           FROM portal_document_requirement_attempts
          WHERE academic_term_id = ?`,
        [id],
      ).then((cnt) => {
        out.portalDocumentRequirementAttempts = cnt;
      }),
    );
  }

  await Promise.all(promises);
  return out;
}

/**
 * Clears all posted flags, then marks `id` as posted. Requires `is_posted_to_dashboard` column.
 */
export async function postAcademicTermToDashboard(
  id: string,
): Promise<AcademicTermDetail | null> {
  const { hasPostedToDashboardColumn } = await academicTermSchemaCaps();
  if (!hasPostedToDashboardColumn) {
    throw new Error(
      "Database schema is missing academic_terms.is_posted_to_dashboard. Apply backend/migrations/005_academic_terms_is_posted_to_dashboard.sql.",
    );
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
    const [res] = await conn.query<ResultSetHeader>(
      `UPDATE academic_terms SET is_posted_to_dashboard = 1 WHERE id = ?`,
      [trimmed],
    );
    if (res.affectedRows === 0) {
      await conn.rollback();
      return null;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return getAcademicTermById(trimmed);
}

export type AcademicTermInsertRow = Omit<
  AcademicTermDetail,
  "is_visible"
> & { is_visible: boolean };

export async function insertAcademicTerm(
  row: AcademicTermInsertRow,
): Promise<AcademicTermDetail> {
  const { hasPaymentPolicyColumns, hasPostedToDashboardColumn } =
    await academicTermSchemaCaps();
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
      clinic_appointment_deadline,
      lock_registration_if_overdue,
      status,
      is_visible${postedCols}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${postedVals})
  `;
    const params: unknown[] = [
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
      row.clinic_appointment_deadline,
      row.lock_registration_if_overdue ? 1 : 0,
      row.status,
      row.is_visible ? 1 : 0,
    ];
    if (hasPostedToDashboardColumn) {
      params.push(row.is_posted_to_dashboard ? 1 : 0);
    }
    await pool.query<ResultSetHeader>(sql, params);
  } else {
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
      clinic_appointment_deadline,
      status,
      is_visible${postedCols}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${postedVals})
  `;
    const params: unknown[] = [
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
      row.clinic_appointment_deadline,
      row.status,
      row.is_visible ? 1 : 0,
    ];
    if (hasPostedToDashboardColumn) {
      params.push(row.is_posted_to_dashboard ? 1 : 0);
    }
    await pool.query<ResultSetHeader>(sql, params);
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
export async function updateAcademicTermRow(
  currentId: string,
  row: AcademicTermInsertRow,
): Promise<AcademicTermDetail | null> {
  const existing = await getAcademicTermById(currentId);
  if (!existing) return null;
  const { hasPaymentPolicyColumns, hasPostedToDashboardColumn } =
    await academicTermSchemaCaps();
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
      clinic_appointment_deadline = ?,
      lock_registration_if_overdue = ?,
      status = ?,
      is_visible = ?${postedSet}
    WHERE id = ?
  `;
    const params: unknown[] = [
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
      row.clinic_appointment_deadline,
      row.lock_registration_if_overdue ? 1 : 0,
      row.status,
      row.is_visible ? 1 : 0,
    ];
    if (hasPostedToDashboardColumn) {
      params.push(row.is_posted_to_dashboard ? 1 : 0);
    }
    params.push(currentId);
    await pool.query<ResultSetHeader>(sql, params);
  } else {
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
      clinic_appointment_deadline = ?,
      status = ?,
      is_visible = ?${postedSet}
    WHERE id = ?
  `;
    const params: unknown[] = [
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
      row.clinic_appointment_deadline,
      row.status,
      row.is_visible ? 1 : 0,
    ];
    if (hasPostedToDashboardColumn) {
      params.push(row.is_posted_to_dashboard ? 1 : 0);
    }
    params.push(currentId);
    await pool.query<ResultSetHeader>(sql, params);
  }
  return getAcademicTermById(row.id);
}

export async function deleteAcademicTermById(id: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM academic_terms WHERE id = ?`,
    [id],
  );
  return result.affectedRows > 0;
}

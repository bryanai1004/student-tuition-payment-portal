import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  AccountContext,
  BillingAdjustmentRecord,
  BillingAdjustmentSource,
  BillingCategory,
  CourseRecord,
  EnrollmentRecord,
  PaymentRecord,
  StudentTermPreference,
} from "../types/studentAccount.js";

/**
 * MySQL-first account reads. Expect these tables (adjust names in migrations as needed):
 *
 * `student_external_id` is the portal-side key for the student; in a legacy schema this matches
 * `registration.id` (e.g. C17310), not a separate `students.student_id` column.
 *
 * portal_students (student_external_id PK, full_name)
 * portal_courses (course_id PK, course_code, title, type ENUM, units, hours)
 * portal_enrollments (student_external_id, course_id, term, year)
 * portal_student_term_prefs (student_external_id, term, year, use_installment_plan,
 *   tuition_paid_in_full_at_reg, installment_count, registration_period_ends)
 * portal_payments (student_external_id, term, year, amount, paid_at, method, description)
 * portal_billing_adjustments (..., adjustment_source manual|system_late_fee|system_clinical)
 */

function formatSqlDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return String(value);
}

function asBool(v: unknown): boolean {
  if (v === true || v === 1 || v === "1") return true;
  return false;
}

function asCourseType(raw: unknown): CourseRecord["type"] {
  const s = String(raw);
  if (s === "didactic" || s === "lab" || s === "clinical" || s === "other") {
    return s;
  }
  return "other";
}

function asBillingCategory(raw: unknown): BillingCategory {
  const s = String(raw);
  if (s === "tuition" || s === "clinical" || s === "fees" || s === "other") {
    return s;
  }
  return "other";
}

function asAdjustmentSource(raw: unknown): BillingAdjustmentSource {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "system_late_fee") return "system_late_fee";
  if (s === "system_clinical") return "system_clinical";
  if (s === "system_late_fee_reversal") return "system_late_fee_reversal";
  return "manual";
}

/** In-process cache: whether `portal_billing_adjustments.adjustment_source` exists (older prod DBs may lack it). */
let portalBillingAdjustmentsHasAdjustmentSource: boolean | undefined;
let portalBillingAdjustmentsAdjustmentSourceDetect: Promise<boolean> | null =
  null;

/** In-process cache: whether `reversal_of_adjustment_id` exists. */
let portalBillingAdjustmentsHasReversalOfColumn: boolean | undefined;
let portalBillingAdjustmentsReversalOfDetect: Promise<boolean> | null = null;

async function hasPortalBillingAdjustmentsAdjustmentSourceColumn(
  pool: Pool,
): Promise<boolean> {
  if (portalBillingAdjustmentsHasAdjustmentSource !== undefined) {
    return portalBillingAdjustmentsHasAdjustmentSource;
  }
  if (!portalBillingAdjustmentsAdjustmentSourceDetect) {
    portalBillingAdjustmentsAdjustmentSourceDetect = pool
      .query<RowDataPacket[]>(
        `SELECT 1 AS ok
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'portal_billing_adjustments'
           AND COLUMN_NAME = 'adjustment_source'
         LIMIT 1`,
      )
      .then(([rows]) => {
        const has = rows.length > 0;
        portalBillingAdjustmentsHasAdjustmentSource = has;
        return has;
      })
      .finally(() => {
        portalBillingAdjustmentsAdjustmentSourceDetect = null;
      });
  }
  return portalBillingAdjustmentsAdjustmentSourceDetect;
}

async function hasPortalBillingAdjustmentsReversalOfColumn(
  pool: Pool,
): Promise<boolean> {
  if (portalBillingAdjustmentsHasReversalOfColumn !== undefined) {
    return portalBillingAdjustmentsHasReversalOfColumn;
  }
  if (!portalBillingAdjustmentsReversalOfDetect) {
    portalBillingAdjustmentsReversalOfDetect = pool
      .query<RowDataPacket[]>(
        `SELECT 1 AS ok
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'portal_billing_adjustments'
           AND COLUMN_NAME = 'reversal_of_adjustment_id'
         LIMIT 1`,
      )
      .then(([rows]) => {
        const has = rows.length > 0;
        portalBillingAdjustmentsHasReversalOfColumn = has;
        return has;
      })
      .finally(() => {
        portalBillingAdjustmentsReversalOfDetect = null;
      });
  }
  return portalBillingAdjustmentsReversalOfDetect;
}

/**
 * Latest term/year for which the student has at least one enrollment row.
 * Ordering: highest calendar year first, then Fall > Summer > Spring > Winter within the year.
 */
export async function findLatestTermYearForStudent(
  pool: Pool,
  studentExternalId: string,
): Promise<{ term: string; year: number } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT term, year
     FROM portal_enrollments
     WHERE student_external_id = ?
     ORDER BY year DESC,
       CASE UPPER(TRIM(term))
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC
     LIMIT 1`,
    [studentExternalId],
  );

  if (rows.length === 0) {
    return null;
  }

  const r = rows[0]!;
  return { term: String(r.term), year: Number(r.year) };
}

/**
 * Distinct term/year pairs from `portal_enrollments` for this student.
 * Newest first: year DESC, then Fall > Summer > Spring > Winter within the year.
 */
export async function listPortalScheduleTermsForStudent(
  pool: Pool,
  studentExternalId: string,
): Promise<{ term: string; year: number }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT term, year
     FROM portal_enrollments
     WHERE student_external_id = ?
     ORDER BY year DESC,
       CASE UPPER(TRIM(term))
         WHEN 'FALL' THEN 4
         WHEN 'SUMMER' THEN 3
         WHEN 'SPRING' THEN 2
         WHEN 'WINTER' THEN 1
         ELSE 0
       END DESC`,
    [studentExternalId],
  );
  return rows.map((r) => ({
    term: String(r.term),
    year: Number(r.year),
  }));
}

/**
 * `portal_billing_adjustments` for one student + quarter (no dependency on portal course rows).
 * Used when merging portal-side charges into the student ledger alongside legacy `accounting`.
 */
export async function loadPortalBillingAdjustmentsForQuarter(
  pool: Pool,
  studentId: string,
  term: string,
  year: number,
): Promise<BillingAdjustmentRecord[]> {
  const [adjustmentsSelectHasSource, adjustmentsSelectHasReversalOf] =
    await Promise.all([
      hasPortalBillingAdjustmentsAdjustmentSourceColumn(pool),
      hasPortalBillingAdjustmentsReversalOfColumn(pool),
    ]);

  const cols = [
    "id",
    "description",
    "amount",
    "category",
    ...(adjustmentsSelectHasSource
      ? ["adjustment_source AS adjustmentSource"]
      : []),
    ...(adjustmentsSelectHasReversalOf
      ? ["reversal_of_adjustment_id AS reversalOfAdjustmentId"]
      : []),
  ];
  const adjustmentsSql = `SELECT ${cols.join(", ")}
     FROM portal_billing_adjustments
     WHERE student_external_id = ? AND term = ? AND year = ?`;

  const [adjQ] = await pool.query<RowDataPacket[]>(adjustmentsSql, [
    studentId,
    term,
    year,
  ]);
  const adjustmentRowList = adjQ as RowDataPacket[];
  return adjustmentRowList.map((r) => {
    const rec: BillingAdjustmentRecord = {
      id: r.id != null ? Number(r.id) : undefined,
      description: String(r.description),
      amount: Number(r.amount),
      category: asBillingCategory(r.category),
      adjustmentSource: adjustmentsSelectHasSource
        ? asAdjustmentSource(
            (r as { adjustmentSource?: unknown }).adjustmentSource,
          )
        : "manual",
    };
    if (adjustmentsSelectHasReversalOf) {
      const raw = (r as { reversalOfAdjustmentId?: unknown })
        .reversalOfAdjustmentId;
      if (raw != null && Number.isFinite(Number(raw))) {
        rec.reversalOfAdjustmentId = Math.trunc(Number(raw));
      }
    }
    return rec;
  });
}

async function loadPortalTermBillingContextCore(
  pool: Pool,
  studentId: string,
  term: string,
  year: number,
  enrollmentRows: RowDataPacket[],
): Promise<AccountContext> {
  const [[nameRow]] = await pool.query<RowDataPacket[]>(
    `SELECT full_name AS fullName
     FROM portal_students
     WHERE student_external_id = ?
     LIMIT 1`,
    [studentId],
  );
  const studentDisplayName =
    nameRow?.fullName != null && String(nameRow.fullName).trim() !== ""
      ? String(nameRow.fullName).trim()
      : null;

  const enrollments: EnrollmentRecord[] = enrollmentRows.map((r) => ({
    studentId: String(r.studentId),
    courseId: String(r.courseId),
    term: String(r.term),
    year: Number(r.year),
    sectionCode:
      r.sectionCode == null || String(r.sectionCode).trim() === ""
        ? null
        : String(r.sectionCode).trim(),
    scheduleTrack:
      r.scheduleTrack == null || String(r.scheduleTrack).trim() === ""
        ? null
        : String(r.scheduleTrack).trim(),
  }));

  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  const placeholders =
    courseIds.length > 0 ? courseIds.map(() => "?").join(",") : "";

  const coursesSql =
    courseIds.length > 0
      ? `SELECT course_id AS courseId, course_code AS courseCode, title, type,
                units, hours
         FROM portal_courses
         WHERE course_id IN (${placeholders})`
      : `SELECT course_id AS courseId, course_code AS courseCode, title, type,
                units, hours
         FROM portal_courses
         WHERE 1 = 0`;

  const [coursesQ, prefsQ, paymentsQ, adjustments] = await Promise.all([
    pool.query<RowDataPacket[]>(
      coursesSql,
      courseIds.length > 0 ? courseIds : [],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT use_installment_plan AS useInstallmentPlan,
              tuition_paid_in_full_at_reg AS tuitionPaidInFullDuringRegistration,
              installment_count AS installmentCount,
              registration_period_ends AS registrationPeriodEnds
       FROM portal_student_term_prefs
       WHERE student_external_id = ? AND term = ? AND year = ?
       LIMIT 1`,
      [studentId, term, year],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT id, amount, paid_at AS paidAt, method, description
       FROM portal_payments
       WHERE student_external_id = ? AND term = ? AND year = ?
       ORDER BY paid_at ASC, id ASC`,
      [studentId, term, year],
    ),
    loadPortalBillingAdjustmentsForQuarter(pool, studentId, term, year),
  ]);

  const courseRowList = coursesQ[0] as RowDataPacket[];
  const prefRowList = prefsQ[0] as RowDataPacket[];
  const paymentRowList = paymentsQ[0] as RowDataPacket[];

  const courses: CourseRecord[] = courseRowList.map((r) => ({
    courseId: String(r.courseId),
    courseCode: String(r.courseCode),
    title: String(r.title),
    type: asCourseType(r.type),
    units: r.units != null ? Number(r.units) : undefined,
    hours: r.hours != null ? Number(r.hours) : undefined,
  }));

  let preference: StudentTermPreference | null = null;
  const pr = prefRowList[0];
  if (pr) {
    preference = {
      useInstallmentPlan: asBool(pr.useInstallmentPlan),
      tuitionPaidInFullDuringRegistration: asBool(
        pr.tuitionPaidInFullDuringRegistration,
      ),
      installmentCount: Number(pr.installmentCount) || 3,
      registrationPeriodEnds: pr.registrationPeriodEnds
        ? formatSqlDate(pr.registrationPeriodEnds)
        : "2026-09-05",
    };
  }

  const payments: PaymentRecord[] = paymentRowList.map((r) => ({
    id: r.id != null ? Number(r.id) : undefined,
    amount: Number(r.amount),
    paidAt: formatSqlDate(r.paidAt),
    method: String(r.method),
    description: r.description != null ? String(r.description) : undefined,
  }));

  return {
    studentId,
    studentDisplayName,
    term,
    year,
    enrollments,
    preference,
    payments,
    adjustments,
    courses,
  };
}

export async function loadAccountContext(
  pool: Pool,
  studentId: string,
  term: string,
  year: number,
): Promise<AccountContext | null> {
  const [enrollmentRows] = await pool.query<RowDataPacket[]>(
    `SELECT student_external_id AS studentId, course_id AS courseId, term, year,
            NULLIF(TRIM(section_code), '') AS sectionCode,
            NULLIF(TRIM(schedule_track), '') AS scheduleTrack
     FROM portal_enrollments
     WHERE student_external_id = ? AND term = ? AND year = ?
       AND (status IS NULL OR LOWER(TRIM(status)) = 'active')`,
    [studentId, term, year],
  );

  if (enrollmentRows.length === 0) {
    return null;
  }

  return loadPortalTermBillingContextCore(
    pool,
    studentId,
    term,
    year,
    enrollmentRows,
  );
}

/**
 * Portal billing context for a term/year, including empty enrollments (payments/adjustments only).
 * Used to synthesize a ledger when legacy `accounting` has no rows for that quarter.
 */
export async function loadPortalTermBillingContext(
  pool: Pool,
  studentId: string,
  term: string,
  year: number,
): Promise<AccountContext> {
  const [enrollmentRows] = await pool.query<RowDataPacket[]>(
    `SELECT student_external_id AS studentId, course_id AS courseId, term, year,
            NULLIF(TRIM(section_code), '') AS sectionCode,
            NULLIF(TRIM(schedule_track), '') AS scheduleTrack
     FROM portal_enrollments
     WHERE student_external_id = ? AND term = ? AND year = ?
       AND (status IS NULL OR LOWER(TRIM(status)) = 'active')`,
    [studentId, term, year],
  );
  return loadPortalTermBillingContextCore(
    pool,
    studentId,
    term,
    year,
    enrollmentRows,
  );
}

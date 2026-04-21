import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { pool } from "../lib/db.js";

/** Row shape from legacy `clinic_timetable` (see school.sql). */
export type ClinicTimetableDbRow = {
  id: number;
  year: number;
  term: string;
  weekday: string;
  time_from: string;
  time_to: string;
  slot: string;
  instructor_id: string;
  instructor: string;
  /** Legacy per-level caps (`100Max` … `123Max`); summed for portal capacity when present. */
  cap_100: number;
  cap_200: number;
  cap_300: number;
  cap_123: number;
};

function mapTimetableRow(r: RowDataPacket): ClinicTimetableDbRow {
  const row = r as Record<string, unknown>;
  const tf = row.time_from;
  const tt = row.time_to;
  const asTime = (v: unknown): string => {
    if (v instanceof Date) {
      const h = v.getUTCHours();
      const m = v.getUTCMinutes();
      const s = v.getUTCSeconds();
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return String(v ?? "").trim();
  };
  const asInt = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };
  return {
    id: Number(row.id),
    year: Number(row.year),
    term: String(row.term ?? "").trim(),
    weekday: String(row.weekday ?? "").trim(),
    time_from: asTime(tf),
    time_to: asTime(tt),
    slot: String(row.slot ?? "").trim(),
    instructor_id: String(row.instructor_id ?? "").trim(),
    instructor: String(row.instructor ?? "").trim(),
    cap_100: asInt(row.cap_100),
    cap_200: asInt(row.cap_200),
    cap_300: asInt(row.cap_300),
    cap_123: asInt(row.cap_123),
  };
}

/**
 * Optional filters: when `year` or `term` is null/undefined, that filter is skipped.
 */
export async function listClinicTimetableSlots(options?: {
  year?: number | null;
  term?: string | null;
}): Promise<ClinicTimetableDbRow[]> {
  const y = options?.year;
  const t = options?.term != null ? String(options.term).trim() : "";
  const yearClause =
    y != null && Number.isFinite(y) ? " AND year = ? " : "";
  const termClause = t !== "" ? " AND TRIM(term) = TRIM(?) " : "";
  const params: (string | number)[] = [];
  if (y != null && Number.isFinite(y)) {
    params.push(Number(y));
  }
  if (t !== "") {
    params.push(t);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT seqNum AS id, year, term, day AS weekday,
            time_from, time_to, slot, instructor_id, instructor,
            \`100Max\` AS cap_100, \`200Max\` AS cap_200,
            \`300Max\` AS cap_300, \`123Max\` AS cap_123
       FROM clinic_timetable
      WHERE 1=1
      ${yearClause}
      ${termClause}
      ORDER BY year DESC, term ASC, weekday ASC, time_from ASC, seqNum ASC`,
    params,
  );
  return rows.map(mapTimetableRow);
}

export async function getClinicTimetableById(
  seqNum: number,
): Promise<ClinicTimetableDbRow | null> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return null;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT seqNum AS id, year, term, day AS weekday,
            time_from, time_to, slot, instructor_id, instructor,
            \`100Max\` AS cap_100, \`200Max\` AS cap_200,
            \`300Max\` AS cap_300, \`123Max\` AS cap_123
       FROM clinic_timetable
      WHERE seqNum = ?
      LIMIT 1`,
    [seqNum],
  );
  if (rows.length === 0) {
    return null;
  }
  return mapTimetableRow(rows[0]!);
}

export type ClinicTimetableAdminRow = ClinicTimetableDbRow & {
  /** `academic_terms.id` when year + legacy term matches a portal term; otherwise null. */
  academic_term_id: string | null;
  /**
   * Non-dropped rows on `clinical_enrollments` for this timetable id
   * (same filter as `listActiveClinicalRosterForTimetable`).
   */
  active_enrolled_count: number;
  enrolled_bucket_100: number;
  enrolled_bucket_200: number;
  enrolled_bucket_300: number;
  enrolled_bucket_all: number;
};

function mapTimetableAdminRow(r: RowDataPacket): ClinicTimetableAdminRow {
  const base = mapTimetableRow(r);
  const row = r as Record<string, unknown>;
  const aid = row.academic_term_id;
  const cntRaw = Number(row.active_enrolled_count);
  const active_enrolled_count =
    Number.isFinite(cntRaw) && cntRaw > 0 ? Math.trunc(cntRaw) : 0;
  const b100 = Math.max(0, Math.trunc(Number(row.enrolled_bucket_100)));
  const b200 = Math.max(0, Math.trunc(Number(row.enrolled_bucket_200)));
  const b300 = Math.max(0, Math.trunc(Number(row.enrolled_bucket_300)));
  const bAll = Math.max(0, Math.trunc(Number(row.enrolled_bucket_all)));
  return {
    ...base,
    academic_term_id:
      aid == null || aid === "" ? null : String(aid).trim() || null,
    active_enrolled_count,
    enrolled_bucket_100: b100,
    enrolled_bucket_200: b200,
    enrolled_bucket_300: b300,
    enrolled_bucket_all: bAll,
  };
}

/**
 * Admin list: same filters as `listClinicTimetableSlots`, plus optional `academic_terms.id` via join.
 */
export async function listClinicTimetableSlotsForAdmin(options?: {
  year?: number | null;
  term?: string | null;
}): Promise<ClinicTimetableAdminRow[]> {
  const y = options?.year;
  const t = options?.term != null ? String(options.term).trim() : "";
  const yearClause =
    y != null && Number.isFinite(y) ? " AND ct.year = ? " : "";
  const termClause = t !== "" ? " AND TRIM(ct.term) = TRIM(?) " : "";
  const params: (string | number)[] = [];
  if (y != null && Number.isFinite(y)) {
    params.push(Number(y));
  }
  if (t !== "") {
    params.push(t);
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ct.seqNum AS id, ct.year, ct.term, ct.day AS weekday,
            ct.time_from, ct.time_to, ct.slot, ct.instructor_id, ct.instructor,
            ct.\`100Max\` AS cap_100, ct.\`200Max\` AS cap_200,
            ct.\`300Max\` AS cap_300, ct.\`123Max\` AS cap_123,
            at.id AS academic_term_id,
            COALESCE(ce_cnt.cnt, 0) AS active_enrolled_count,
            COALESCE(ce_cnt.b100, 0) AS enrolled_bucket_100,
            COALESCE(ce_cnt.b200, 0) AS enrolled_bucket_200,
            COALESCE(ce_cnt.b300, 0) AS enrolled_bucket_300,
            COALESCE(ce_cnt.ball, 0) AS enrolled_bucket_all
       FROM clinic_timetable ct
       LEFT JOIN academic_terms at
         ON at.year = ct.year AND at.term_name = TRIM(ct.term)
       LEFT JOIN (
         SELECT ce.timetable_id,
                COUNT(*) AS cnt,
                SUM(
                  CASE
                    WHEN LOWER(TRIM(ce.status)) = 'enrolled'
                     AND LOWER(TRIM(COALESCE(NULLIF(TRIM(ce.seat_bucket), ''), 'all'))) = '100'
                    THEN 1 ELSE 0 END
                ) AS b100,
                SUM(
                  CASE
                    WHEN LOWER(TRIM(ce.status)) = 'enrolled'
                     AND LOWER(TRIM(COALESCE(NULLIF(TRIM(ce.seat_bucket), ''), 'all'))) = '200'
                    THEN 1 ELSE 0 END
                ) AS b200,
                SUM(
                  CASE
                    WHEN LOWER(TRIM(ce.status)) = 'enrolled'
                     AND LOWER(TRIM(COALESCE(NULLIF(TRIM(ce.seat_bucket), ''), 'all'))) = '300'
                    THEN 1 ELSE 0 END
                ) AS b300,
                SUM(
                  CASE
                    WHEN LOWER(TRIM(ce.status)) = 'enrolled'
                     AND LOWER(TRIM(COALESCE(NULLIF(TRIM(ce.seat_bucket), ''), 'all'))) = 'all'
                    THEN 1 ELSE 0 END
                ) AS ball
           FROM clinical_enrollments ce
          WHERE LOWER(TRIM(ce.status)) <> 'dropped'
          GROUP BY ce.timetable_id
       ) ce_cnt ON ce_cnt.timetable_id = ct.seqNum
      WHERE 1=1
      ${yearClause}
      ${termClause}
      ORDER BY ct.year DESC, TRIM(ct.term) ASC, ct.day ASC, ct.time_from ASC, ct.seqNum ASC`,
    params,
  );
  return rows.map(mapTimetableAdminRow);
}

export type ClinicTimetableWritePayload = {
  year: number;
  term: string;
  day: string;
  time_from: string;
  time_to: string;
  slot: string;
  instructor_id: string;
  instructor: string;
  cap_100: number;
  cap_200: number;
  cap_300: number;
  cap_123: number;
};

function nonNegativeIntCap(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.max(0, Math.trunc(n));
}

/**
 * Trim string fields and coerce legacy caps to integers ≥ 0 before INSERT/UPDATE.
 */
function normalizeClinicTimetableWritePayload(
  payload: ClinicTimetableWritePayload,
): ClinicTimetableWritePayload {
  const y = Number(payload.year);
  const year = Number.isFinite(y) ? Math.trunc(y) : 0;
  return {
    year,
    term: String(payload.term ?? "").trim(),
    day: String(payload.day ?? "").trim(),
    time_from: String(payload.time_from ?? "").trim(),
    time_to: String(payload.time_to ?? "").trim(),
    slot: String(payload.slot ?? "").trim(),
    instructor_id: String(payload.instructor_id ?? "").trim(),
    instructor: String(payload.instructor ?? "").trim(),
    cap_100: nonNegativeIntCap(payload.cap_100),
    cap_200: nonNegativeIntCap(payload.cap_200),
    cap_300: nonNegativeIntCap(payload.cap_300),
    cap_123: nonNegativeIntCap(payload.cap_123),
  };
}

export async function createClinicTimetableSlot(
  payload: ClinicTimetableWritePayload,
): Promise<number> {
  const row = normalizeClinicTimetableWritePayload(payload);
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO clinic_timetable (
        year, term, day, time_from, time_to, slot,
        instructor_id, instructor,
        \`100Max\`, \`200Max\`, \`300Max\`, \`123Max\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.year,
      row.term,
      row.day,
      row.time_from,
      row.time_to,
      row.slot,
      row.instructor_id,
      row.instructor,
      row.cap_100,
      row.cap_200,
      row.cap_300,
      row.cap_123,
    ],
  );
  return Number(res.insertId);
}

export async function updateClinicTimetableSlot(
  seqNum: number,
  payload: ClinicTimetableWritePayload,
): Promise<boolean> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return false;
  }
  const row = normalizeClinicTimetableWritePayload(payload);
  const [res] = await pool.query<ResultSetHeader>(
    `UPDATE clinic_timetable SET
        year = ?, term = ?, day = ?, time_from = ?, time_to = ?, slot = ?,
        instructor_id = ?, instructor = ?,
        \`100Max\` = ?, \`200Max\` = ?, \`300Max\` = ?, \`123Max\` = ?
      WHERE seqNum = ?`,
    [
      row.year,
      row.term,
      row.day,
      row.time_from,
      row.time_to,
      row.slot,
      row.instructor_id,
      row.instructor,
      row.cap_100,
      row.cap_200,
      row.cap_300,
      row.cap_123,
      seqNum,
    ],
  );
  return res.affectedRows > 0;
}

export async function deleteClinicTimetableSlot(seqNum: number): Promise<boolean> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return false;
  }
  const [res] = await pool.query<ResultSetHeader>(
    `DELETE FROM clinic_timetable WHERE seqNum = ?`,
    [seqNum],
  );
  return res.affectedRows > 0;
}

export type ForceDeleteClinicTimetableCleanupCounts = {
  deletedClinicalRequests: number;
  deletedClinicalAssignments: number;
  deletedClinicalEnrollments: number;
  deletedClinicalBookingPaymentHolds: number;
  detachedPortalBillingAdjustments: number;
};

function emptyForceDeleteCleanupCounts(): ForceDeleteClinicTimetableCleanupCounts {
  return {
    deletedClinicalRequests: 0,
    deletedClinicalAssignments: 0,
    deletedClinicalEnrollments: 0,
    deletedClinicalBookingPaymentHolds: 0,
    detachedPortalBillingAdjustments: 0,
  };
}

async function tableExistsInConn(
  conn: PoolConnection,
  tableName: string,
): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function columnExistsInConn(
  conn: PoolConnection,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

function buildInPlaceholders(items: readonly number[]): string {
  return items.map(() => "?").join(", ");
}

/**
 * Force delete cleanup for a timetable slot.
 * Deletes child/dependent records first in one transaction, then deletes `clinic_timetable`.
 */
export async function forceDeleteClinicTimetableSlot(
  seqNum: number,
): Promise<{ deleted: boolean; cleanup: ForceDeleteClinicTimetableCleanupCounts }> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return {
      deleted: false,
      cleanup: emptyForceDeleteCleanupCounts(),
    };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [slotRows] = await conn.query<RowDataPacket[]>(
      `SELECT seqNum
         FROM clinic_timetable
        WHERE seqNum = ?
        LIMIT 1
        FOR UPDATE`,
      [seqNum],
    );
    if (slotRows.length === 0) {
      await conn.rollback();
      return {
        deleted: false,
        cleanup: emptyForceDeleteCleanupCounts(),
      };
    }

    const [enrollmentRows] = await conn.query<RowDataPacket[]>(
      `SELECT id
         FROM clinical_enrollments
        WHERE timetable_id = ?
        FOR UPDATE`,
      [seqNum],
    );
    const enrollmentIds = enrollmentRows
      .map((r) => Math.trunc(Number((r as { id?: unknown }).id)))
      .filter((id) => Number.isFinite(id) && id > 0);

    let deletedClinicalBookingPaymentHolds = 0;
    if (
      enrollmentIds.length > 0 &&
      (await tableExistsInConn(conn, "clinical_booking_payment_holds"))
    ) {
      const placeholders = buildInPlaceholders(enrollmentIds);
      const [holdRes] = await conn.query<ResultSetHeader>(
        `DELETE FROM clinical_booking_payment_holds
          WHERE clinical_enrollment_id IN (${placeholders})`,
        enrollmentIds,
      );
      deletedClinicalBookingPaymentHolds = holdRes.affectedRows;
    }

    let detachedPortalBillingAdjustments = 0;
    if (
      enrollmentIds.length > 0 &&
      (await tableExistsInConn(conn, "portal_billing_adjustments")) &&
      (await columnExistsInConn(conn, "portal_billing_adjustments", "clinical_enrollment_id"))
    ) {
      const placeholders = buildInPlaceholders(enrollmentIds);
      const [billingRes] = await conn.query<ResultSetHeader>(
        `UPDATE portal_billing_adjustments
            SET clinical_enrollment_id = NULL
          WHERE clinical_enrollment_id IN (${placeholders})`,
        enrollmentIds,
      );
      detachedPortalBillingAdjustments = billingRes.affectedRows;
    }

    let deletedClinicalRequests = 0;
    if (await tableExistsInConn(conn, "clinical_requests")) {
      const [requestRes] = await conn.query<ResultSetHeader>(
        `DELETE FROM clinical_requests
          WHERE timetable_id = ?`,
        [seqNum],
      );
      deletedClinicalRequests = requestRes.affectedRows;
    }

    const [assignmentRes] = await conn.query<ResultSetHeader>(
      `DELETE FROM clinical_assignments
        WHERE timetable_id = ?`,
      [seqNum],
    );
    const [enrollmentRes] = await conn.query<ResultSetHeader>(
      `DELETE FROM clinical_enrollments
        WHERE timetable_id = ?`,
      [seqNum],
    );
    const [slotDeleteRes] = await conn.query<ResultSetHeader>(
      `DELETE FROM clinic_timetable
        WHERE seqNum = ?`,
      [seqNum],
    );

    if (slotDeleteRes.affectedRows === 0) {
      await conn.rollback();
      return {
        deleted: false,
        cleanup: emptyForceDeleteCleanupCounts(),
      };
    }

    await conn.commit();
    return {
      deleted: true,
      cleanup: {
        deletedClinicalRequests,
        deletedClinicalAssignments: assignmentRes.affectedRows,
        deletedClinicalEnrollments: enrollmentRes.affectedRows,
        deletedClinicalBookingPaymentHolds,
        detachedPortalBillingAdjustments,
      },
    };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // best effort rollback
    }
    throw error;
  } finally {
    conn.release();
  }
}

export type ClinicTimetableReferenceCounts = {
  activeEnrollments: number;
  historicalDroppedEnrollments: number;
  activePendingRequests: number;
  historicalDecidedRequests: number;
  activeAssignments: number;
  historicalDroppedAssignments: number;
};

/**
 * Status-aware dependency counts for a timetable slot.
 * - Active dependencies should block delete because they are still operationally referenced.
 */
export async function countClinicTimetableReferences(
  seqNum: number,
): Promise<ClinicTimetableReferenceCounts> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return {
      activeEnrollments: 0,
      historicalDroppedEnrollments: 0,
      activePendingRequests: 0,
      historicalDecidedRequests: 0,
      activeAssignments: 0,
      historicalDroppedAssignments: 0,
    };
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        (SELECT COUNT(*)
           FROM clinical_enrollments
          WHERE timetable_id = ?
            AND LOWER(TRIM(status)) <> 'dropped') AS active_enrollments,
        (SELECT COUNT(*)
           FROM clinical_enrollments
          WHERE timetable_id = ?
            AND LOWER(TRIM(status)) = 'dropped') AS historical_dropped_enrollments,
        (SELECT COUNT(*)
           FROM clinical_assignments
          WHERE timetable_id = ?
            AND LOWER(TRIM(IFNULL(status, ''))) NOT IN ('dropped', 'cancelled')
        ) AS active_assignments,
        (SELECT COUNT(*)
           FROM clinical_assignments
          WHERE timetable_id = ?
            AND LOWER(TRIM(IFNULL(status, ''))) IN ('dropped', 'cancelled')
        ) AS historical_dropped_assignments`,
    [seqNum, seqNum, seqNum, seqNum],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  const [requestTableRows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinical_requests'
      LIMIT 1`,
  );
  const hasClinicalRequestsTable = requestTableRows.length > 0;

  let activePendingRequests = 0;
  let historicalDecidedRequests = 0;
  if (hasClinicalRequestsTable) {
    const [requestRows] = await pool.query<RowDataPacket[]>(
      `SELECT
          SUM(CASE WHEN LOWER(TRIM(status)) = 'pending' THEN 1 ELSE 0 END) AS active_pending_requests,
          SUM(CASE WHEN LOWER(TRIM(status)) <> 'pending' THEN 1 ELSE 0 END) AS historical_decided_requests
         FROM clinical_requests
        WHERE timetable_id = ?`,
      [seqNum],
    );
    const rr = requestRows[0] as Record<string, unknown> | undefined;
    activePendingRequests = Math.max(
      0,
      Math.trunc(Number(rr?.active_pending_requests ?? 0)),
    );
    historicalDecidedRequests = Math.max(
      0,
      Math.trunc(Number(rr?.historical_decided_requests ?? 0)),
    );
  }

  return {
    activeEnrollments: Math.max(0, Math.trunc(Number(r?.active_enrollments ?? 0))),
    historicalDroppedEnrollments: Math.max(
      0,
      Math.trunc(Number(r?.historical_dropped_enrollments ?? 0)),
    ),
    activePendingRequests,
    historicalDecidedRequests,
    activeAssignments: Math.max(0, Math.trunc(Number(r?.active_assignments ?? 0))),
    historicalDroppedAssignments: Math.max(
      0,
      Math.trunc(Number(r?.historical_dropped_assignments ?? 0)),
    ),
  };
}

export type HistoricalClinicTimetableReferenceCleanupResult = {
  deletedDroppedEnrollments: number;
  deletedDecidedRequests: number;
  detachedDroppedAssignments: number;
};

/**
 * Removes or detaches historical references before slot deletion.
 * This keeps active flows intact while preventing dangling timetable links.
 */
export async function cleanupHistoricalClinicTimetableReferences(
  seqNum: number,
): Promise<HistoricalClinicTimetableReferenceCleanupResult> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return {
      deletedDroppedEnrollments: 0,
      deletedDecidedRequests: 0,
      detachedDroppedAssignments: 0,
    };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [enrollmentRes] = await conn.query<ResultSetHeader>(
      `DELETE FROM clinical_enrollments
        WHERE timetable_id = ?
          AND LOWER(TRIM(IFNULL(status, ''))) = 'dropped'`,
      [seqNum],
    );

    let deletedDecidedRequests = 0;
    const [requestTableRows] = await conn.query<RowDataPacket[]>(
      `SELECT 1 AS ok
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'clinical_requests'
        LIMIT 1`,
    );
    const hasClinicalRequestsTable = requestTableRows.length > 0;
    if (hasClinicalRequestsTable) {
      const [requestRes] = await conn.query<ResultSetHeader>(
        `DELETE FROM clinical_requests
          WHERE timetable_id = ?
            AND LOWER(TRIM(IFNULL(status, ''))) <> 'pending'`,
        [seqNum],
      );
      deletedDecidedRequests = requestRes.affectedRows;
    }

    const [assignmentRes] = await conn.query<ResultSetHeader>(
      `UPDATE clinical_assignments
          SET timetable_id = NULL
        WHERE timetable_id = ?
          AND LOWER(TRIM(IFNULL(status, ''))) IN ('dropped', 'cancelled')`,
      [seqNum],
    );

    await conn.commit();
    return {
      deletedDroppedEnrollments: enrollmentRes.affectedRows,
      deletedDecidedRequests,
      detachedDroppedAssignments: assignmentRes.affectedRows,
    };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // best effort rollback
    }
    throw error;
  } finally {
    conn.release();
  }
}

function coerceMysqlTimeHmsForLayout(v: unknown): string {
  if (v instanceof Date) {
    const h = v.getUTCHours();
    const m = v.getUTCMinutes();
    const sec = v.getUTCSeconds();
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  const s = String(v ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) {
    return "";
  }
  return `${m[1]!.padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`;
}

/** `clinic_timetable` + enrolled counts for the portal offered timetable (no dependency on enrollment service). */
export type ClinicalOfferedTimetableDetailRow = {
  timetableId: number;
  term: string;
  year: number;
  weekday: string;
  time_from: string;
  time_to: string;
  slot: string;
  instructor: string | null;
  capacity: number | null;
  enrolledCount: number;
  remainingSeats: number | null;
  capacity100: number;
  capacity200: number;
  capacity300: number;
  capacityAll: number;
  enrolled100: number;
  enrolled200: number;
  enrolled300: number;
  enrolledAll: number;
  remaining100: number;
  remaining200: number;
  remaining300: number;
  remainingAll: number;
};

function normalizeOfferedTermFilter(term: string | null | undefined): string {
  if (term == null) {
    return "";
  }
  return String(term).trim().slice(0, 20);
}

export async function listClinicalOfferedTimetableDetailRows(options?: {
  year?: number | null;
  term?: string | null;
}): Promise<ClinicalOfferedTimetableDetailRow[]> {
  const y = options?.year;
  const t = normalizeOfferedTermFilter(options?.term ?? null);
  const yearClause =
    y != null && Number.isFinite(y) ? " AND ct.year = ? " : "";
  const termClause = t !== "" ? " AND TRIM(ct.term) = ? " : "";
  const params: (string | number)[] = [];
  if (y != null && Number.isFinite(y)) {
    params.push(Number(y));
  }
  if (t !== "") {
    params.push(t);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        ct.seqNum AS timetable_id,
        ct.year,
        TRIM(ct.term) AS term,
        ct.day AS weekday,
        ct.time_from,
        ct.time_to,
        ct.slot,
        TRIM(ct.instructor) AS instructor,
        ct.\`100Max\` AS cap_100,
        ct.\`200Max\` AS cap_200,
        ct.\`300Max\` AS cap_300,
        ct.\`123Max\` AS cap_123,
        COALESCE(ec.cnt, 0) AS enrolled_count,
        COALESCE(ec.e100, 0) AS enrolled_100,
        COALESCE(ec.e200, 0) AS enrolled_200,
        COALESCE(ec.e300, 0) AS enrolled_300,
        COALESCE(ec.eall, 0) AS enrolled_all
     FROM clinic_timetable ct
     LEFT JOIN (
       SELECT timetable_id,
              TRIM(term) AS eterm,
              year AS eyear,
              COUNT(*) AS cnt,
              SUM(
                CASE
                  WHEN LOWER(TRIM(COALESCE(NULLIF(TRIM(seat_bucket), ''), 'all'))) = '100'
                  THEN 1 ELSE 0 END
              ) AS e100,
              SUM(
                CASE
                  WHEN LOWER(TRIM(COALESCE(NULLIF(TRIM(seat_bucket), ''), 'all'))) = '200'
                  THEN 1 ELSE 0 END
              ) AS e200,
              SUM(
                CASE
                  WHEN LOWER(TRIM(COALESCE(NULLIF(TRIM(seat_bucket), ''), 'all'))) = '300'
                  THEN 1 ELSE 0 END
              ) AS e300,
              SUM(
                CASE
                  WHEN LOWER(TRIM(COALESCE(NULLIF(TRIM(seat_bucket), ''), 'all'))) = 'all'
                  THEN 1 ELSE 0 END
              ) AS eall
         FROM clinical_enrollments
        WHERE LOWER(TRIM(status)) = 'enrolled'
        GROUP BY timetable_id, TRIM(term), year
     ) ec ON ec.timetable_id = ct.seqNum
         AND ec.eterm = TRIM(ct.term)
         AND ec.eyear = ct.year
    WHERE 1=1
    ${yearClause}
    ${termClause}
    ORDER BY ct.year DESC, TRIM(ct.term) ASC, ct.day ASC, ct.time_from ASC, ct.seqNum ASC`,
    params,
  );

  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const cap100 = Math.max(0, Math.trunc(Number(row.cap_100)));
    const cap200 = Math.max(0, Math.trunc(Number(row.cap_200)));
    const cap300 = Math.max(0, Math.trunc(Number(row.cap_300)));
    const capAll = Math.max(0, Math.trunc(Number(row.cap_123)));
    const cap = cap100 + cap200 + cap300 + capAll;
    const enrolled = Math.max(0, Math.trunc(Number(row.enrolled_count)));
    const e100 = Math.max(0, Math.trunc(Number(row.enrolled_100)));
    const e200 = Math.max(0, Math.trunc(Number(row.enrolled_200)));
    const e300 = Math.max(0, Math.trunc(Number(row.enrolled_300)));
    const eAll = Math.max(0, Math.trunc(Number(row.enrolled_all)));
    const capped = cap > 0;
    const inst = String(row.instructor ?? "").trim();
    return {
      timetableId: Number(row.timetable_id),
      term: String(row.term ?? "").trim(),
      year: Number(row.year),
      weekday: String(row.weekday ?? "").trim(),
      time_from: coerceMysqlTimeHmsForLayout(row.time_from),
      time_to: coerceMysqlTimeHmsForLayout(row.time_to),
      slot: String(row.slot ?? "").trim(),
      instructor: inst === "" ? null : inst,
      capacity: capped ? cap : null,
      enrolledCount: enrolled,
      remainingSeats: capped ? Math.max(0, cap - enrolled) : null,
      capacity100: cap100,
      capacity200: cap200,
      capacity300: cap300,
      capacityAll: capAll,
      enrolled100: e100,
      enrolled200: e200,
      enrolled300: e300,
      enrolledAll: eAll,
      remaining100: Math.max(0, cap100 - e100),
      remaining200: Math.max(0, cap200 - e200),
      remaining300: Math.max(0, cap300 - e300),
      remainingAll: Math.max(0, capAll - eAll),
    };
  });
}

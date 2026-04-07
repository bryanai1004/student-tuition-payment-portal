import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db.js";
import {
  buildClinicTimetableSlotLabel,
  formatClinicTimeHm,
} from "../services/clinicalScheduleService.js";

function isMysqlDupEntry(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "ER_DUP_ENTRY"
  );
}

function normalizeEnrollmentTerm(term: string): string {
  return term.trim().slice(0, 20);
}

/** Sum of legacy level caps on `clinic_timetable` (100/200/300/123 Max). */
export function totalClinicTimetableCapacityCaps(row: {
  cap_100: number;
  cap_200: number;
  cap_300: number;
  cap_123: number;
}): number {
  const a = Math.max(0, Math.trunc(Number(row.cap_100)));
  const b = Math.max(0, Math.trunc(Number(row.cap_200)));
  const c = Math.max(0, Math.trunc(Number(row.cap_300)));
  const d = Math.max(0, Math.trunc(Number(row.cap_123)));
  return a + b + c + d;
}

export type ClinicalEnrollmentSlotRow = {
  timetableId: number;
  term: string;
  year: number;
  slotLabel: string;
  faculty: string | null;
  site: string | null;
  /** Total seats from legacy caps; `null` when summed caps are zero (treat as uncapped for display). */
  capacity: number | null;
  enrolledCount: number;
  /** Seats left when capped; `null` when uncapped. */
  remainingSeats: number | null;
};

export type ClinicalEnrollmentStudentRow = {
  id: number;
  studentId: string;
  timetableId: number;
  term: string;
  year: number;
  status: string;
  slotLabel: string;
  faculty: string | null;
  site: string | null;
  createdAt: string;
};

function slotLabelFromTimetableFields(r: {
  weekday: string;
  time_from: unknown;
  time_to: unknown;
  slot: string;
  instructor: string;
}): string {
  return buildClinicTimetableSlotLabel({
    weekday: r.weekday,
    timeFrom: formatClinicTimeHm(
      typeof r.time_from === "string" ? r.time_from : String(r.time_from ?? ""),
    ),
    timeTo: formatClinicTimeHm(
      typeof r.time_to === "string" ? r.time_to : String(r.time_to ?? ""),
    ),
    slot: r.slot,
    instructor: r.instructor?.trim() ? r.instructor.trim() : null,
  });
}

/**
 * Open slots from `clinic_timetable` with enrollment counts from `clinical_enrollments` (status enrolled).
 */
export async function listAvailableClinicalEnrollmentSlots(options?: {
  year?: number | null;
  term?: string | null;
}): Promise<ClinicalEnrollmentSlotRow[]> {
  const y = options?.year;
  const t =
    options?.term != null ? normalizeEnrollmentTerm(String(options.term)) : "";
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
        COALESCE(ec.cnt, 0) AS enrolled_count
     FROM clinic_timetable ct
     LEFT JOIN (
       SELECT timetable_id, TRIM(term) AS eterm, year AS eyear,
              COUNT(*) AS cnt
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
    const cap = totalClinicTimetableCapacityCaps({
      cap_100: Number(row.cap_100),
      cap_200: Number(row.cap_200),
      cap_300: Number(row.cap_300),
      cap_123: Number(row.cap_123),
    });
    const enrolled = Math.max(0, Math.trunc(Number(row.enrolled_count)));
    const capped = cap > 0;
    return {
      timetableId: Number(row.timetable_id),
      term: String(row.term ?? "").trim(),
      year: Number(row.year),
      slotLabel: slotLabelFromTimetableFields({
        weekday: String(row.weekday ?? "").trim(),
        time_from: row.time_from,
        time_to: row.time_to,
        slot: String(row.slot ?? "").trim(),
        instructor: String(row.instructor ?? "").trim(),
      }),
      faculty:
        String(row.instructor ?? "").trim() === ""
          ? null
          : String(row.instructor).trim(),
      site: null,
      capacity: capped ? cap : null,
      enrolledCount: enrolled,
      remainingSeats: capped ? Math.max(0, cap - enrolled) : null,
    };
  });
}

export async function listStudentClinicalEnrollments(
  studentId: string,
  options?: { term?: string | null; year?: number | null },
): Promise<ClinicalEnrollmentStudentRow[]> {
  const sid = studentId.trim();
  const t =
    options?.term != null ? normalizeEnrollmentTerm(String(options.term)) : "";
  const y = options?.year;
  const termClause = t !== "" ? " AND TRIM(ce.term) = ? " : "";
  const yearClause =
    y != null && Number.isFinite(y) ? " AND ce.year = ? " : "";
  const params: (string | number)[] = [sid];
  if (t !== "") {
    params.push(t);
  }
  if (y != null && Number.isFinite(y)) {
    params.push(Number(y));
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        ce.id,
        TRIM(ce.student_id) AS student_id,
        ce.timetable_id,
        TRIM(ce.term) AS term,
        ce.year,
        TRIM(ce.status) AS status,
        ce.created_at,
        ct.day AS weekday,
        ct.time_from,
        ct.time_to,
        ct.slot,
        TRIM(ct.instructor) AS instructor
     FROM clinical_enrollments ce
     INNER JOIN clinic_timetable ct ON ct.seqNum = ce.timetable_id
    WHERE TRIM(ce.student_id) = TRIM(?)
    ${termClause}
    ${yearClause}
    ORDER BY ce.year DESC, TRIM(ce.term) ASC, ce.id ASC`,
    params,
  );

  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const ca = row.created_at;
    let createdAt: string;
    if (ca instanceof Date) {
      createdAt = ca.toISOString();
    } else {
      createdAt = String(ca ?? "");
    }
    return {
      id: Number(row.id),
      studentId: String(row.student_id ?? "").trim(),
      timetableId: Number(row.timetable_id),
      term: String(row.term ?? "").trim(),
      year: Number(row.year),
      status: String(row.status ?? "").trim(),
      slotLabel: slotLabelFromTimetableFields({
        weekday: String(row.weekday ?? "").trim(),
        time_from: row.time_from,
        time_to: row.time_to,
        slot: String(row.slot ?? "").trim(),
        instructor: String(row.instructor ?? "").trim(),
      }),
      faculty:
        String(row.instructor ?? "").trim() === ""
          ? null
          : String(row.instructor).trim(),
      site: null,
      createdAt,
    };
  });
}

export type ClinicalEnrollmentLockRow = {
  id: number;
  status: string;
};

/**
 * Locks the student's enrollment row for this slot (if any) for update.
 */
export async function lockStudentClinicalEnrollmentForSlot(
  conn: PoolConnection,
  studentId: string,
  timetableId: number,
  term: string,
  year: number,
): Promise<ClinicalEnrollmentLockRow | null> {
  const sid = studentId.trim();
  const te = normalizeEnrollmentTerm(term);
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, TRIM(status) AS status
       FROM clinical_enrollments
      WHERE TRIM(student_id) = TRIM(?)
        AND timetable_id = ?
        AND TRIM(term) = ?
        AND year = ?
      LIMIT 1
      FOR UPDATE`,
    [sid, timetableId, te, year],
  );
  if (rows.length === 0) {
    return null;
  }
  const r = rows[0] as Record<string, unknown>;
  return {
    id: Number(r.id),
    status: String(r.status ?? "").trim().toLowerCase(),
  };
}

/**
 * Locks aggregate enrollment count for the slot (active `enrolled` only).
 */
export async function lockAndCountActiveClinicalEnrollmentsForSlot(
  conn: PoolConnection,
  timetableId: number,
  term: string,
  year: number,
): Promise<number> {
  const te = normalizeEnrollmentTerm(term);
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
       FROM clinical_enrollments
      WHERE timetable_id = ?
        AND TRIM(term) = ?
        AND year = ?
        AND LOWER(TRIM(status)) = 'enrolled'
      FOR UPDATE`,
    [timetableId, te, year],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  return Math.max(0, Math.trunc(Number(r?.c ?? 0)));
}

export async function insertClinicalEnrollmentRow(
  conn: PoolConnection,
  input: {
    studentId: string;
    timetableId: number;
    term: string;
    year: number;
    status?: string;
  },
): Promise<number> {
  const status =
    input.status != null && String(input.status).trim() !== ""
      ? String(input.status).trim().toLowerCase().slice(0, 20)
      : "enrolled";
  const [res] = await conn.query<ResultSetHeader>(
    `INSERT INTO clinical_enrollments
      (student_id, timetable_id, term, year, status)
     VALUES (TRIM(?), ?, TRIM(?), ?, ?)`,
    [
      input.studentId.trim(),
      input.timetableId,
      normalizeEnrollmentTerm(input.term),
      input.year,
      status,
    ],
  );
  return Number(res.insertId);
}

export async function updateClinicalEnrollmentStatusById(
  conn: PoolConnection,
  enrollmentId: number,
  studentId: string,
  status: string,
): Promise<number> {
  const st = status.trim().toLowerCase().slice(0, 20);
  const [res] = await conn.query<ResultSetHeader>(
    `UPDATE clinical_enrollments
        SET status = ?
      WHERE id = ?
        AND TRIM(student_id) = TRIM(?)`,
    [st, enrollmentId, studentId.trim()],
  );
  return res.affectedRows;
}

/**
 * Marks timetable-linked assignments for this student/slot as dropped (non-destructive).
 */
export async function markClinicalAssignmentsDroppedForStudentSlot(
  conn: PoolConnection,
  studentId: string,
  timetableId: number,
  term: string,
  year: number,
): Promise<number> {
  const te = normalizeEnrollmentTerm(term);
  const [res] = await conn.query<ResultSetHeader>(
    `UPDATE clinical_assignments
        SET status = 'Dropped'
      WHERE TRIM(student_id) = TRIM(?)
        AND timetable_id = ?
        AND TRIM(IFNULL(term, '')) = ?
        AND year = ?
        AND LOWER(TRIM(status)) NOT IN ('dropped', 'cancelled')`,
    [studentId.trim(), timetableId, te, year],
  );
  return res.affectedRows;
}

export async function countActiveClinicalEnrollmentsForSlot(
  timetableId: number,
  term: string,
  year: number,
): Promise<number> {
  const te = normalizeEnrollmentTerm(term);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c
       FROM clinical_enrollments
      WHERE timetable_id = ?
        AND TRIM(term) = ?
        AND year = ?
        AND LOWER(TRIM(status)) = 'enrolled'`,
    [timetableId, te, year],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  return Math.max(0, Math.trunc(Number(r?.c ?? 0)));
}

/**
 * Transaction-safe enroll: lock, capacity check, insert or reactivate row. Caller supplies assignment insert.
 */
export async function createClinicalEnrollment(
  studentId: string,
  timetableId: number,
  term: string,
  year: number,
  slotCapacity: number,
  insertAssignment: (conn: PoolConnection) => Promise<number>,
): Promise<
  | { ok: true; enrollmentId: number; assignmentId: number }
  | { ok: false; error: string }
> {
  const sid = studentId.trim();
  const te = normalizeEnrollmentTerm(term);
  if (sid === "" || !Number.isFinite(timetableId) || timetableId <= 0) {
    return { ok: false, error: "Invalid enrollment request." };
  }
  if (te === "" || !Number.isFinite(year)) {
    return { ok: false, error: "Invalid term or year for this slot." };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const existing = await lockStudentClinicalEnrollmentForSlot(
      conn,
      sid,
      timetableId,
      te,
      year,
    );
    if (existing != null && existing.status === "enrolled") {
      await conn.rollback();
      return {
        ok: false,
        error: "You are already enrolled in this clinic slot.",
      };
    }

    const enrolledCount = await lockAndCountActiveClinicalEnrollmentsForSlot(
      conn,
      timetableId,
      te,
      year,
    );

    const reactivating = existing != null && existing.status === "dropped";
    const capacityEnforced = slotCapacity > 0;
    if (
      capacityEnforced &&
      enrolledCount >= slotCapacity
    ) {
      await conn.rollback();
      return {
        ok: false,
        error: "This clinic slot is full.",
      };
    }

    let enrollmentId: number;
    if (existing == null) {
      try {
        enrollmentId = await insertClinicalEnrollmentRow(conn, {
          studentId: sid,
          timetableId,
          term: te,
          year,
          status: "enrolled",
        });
      } catch (e: unknown) {
        if (isMysqlDupEntry(e)) {
          await conn.rollback();
          return {
            ok: false,
            error: "You are already enrolled in this clinic slot.",
          };
        }
        throw e;
      }
    } else {
      const n = await updateClinicalEnrollmentStatusById(
        conn,
        existing.id,
        sid,
        "enrolled",
      );
      if (n === 0) {
        await conn.rollback();
        return { ok: false, error: "Could not update enrollment." };
      }
      enrollmentId = existing.id;
    }

    const assignmentId = await insertAssignment(conn);

    await conn.commit();
    return { ok: true, enrollmentId, assignmentId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function dropClinicalEnrollment(
  studentId: string,
  enrollmentId: number,
): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const sid = studentId.trim();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, timetable_id, TRIM(term) AS term, year, TRIM(status) AS status
         FROM clinical_enrollments
        WHERE id = ?
          AND TRIM(student_id) = TRIM(?)
        LIMIT 1
        FOR UPDATE`,
      [enrollmentId, sid],
    );
    if (rows.length === 0) {
      await conn.rollback();
      return { ok: false, error: "Enrollment not found." };
    }
    const r = rows[0] as Record<string, unknown>;
    const st = String(r.status ?? "").trim().toLowerCase();
    if (st !== "enrolled") {
      await conn.rollback();
      return { ok: false, error: "This enrollment is not active." };
    }

    const timetableId = Number(r.timetable_id);
    const term = String(r.term ?? "").trim();
    const year = Number(r.year);

    const n = await updateClinicalEnrollmentStatusById(
      conn,
      enrollmentId,
      sid,
      "dropped",
    );
    if (n === 0) {
      await conn.rollback();
      return { ok: false, error: "Could not drop enrollment." };
    }

    await markClinicalAssignmentsDroppedForStudentSlot(
      conn,
      sid,
      timetableId,
      term,
      year,
    );

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

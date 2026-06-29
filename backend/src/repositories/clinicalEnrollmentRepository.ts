import { pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "../lib/db.js";
import { isUniqueViolation } from "../lib/dbErrors.js";
import {
  cancelActiveClinicalBookingPaymentHoldsForEnrollment,
  clinicalBookingPaymentHoldsTableExists,
  voidSystemClinicalChargesForEnrollmentInConn,
} from "./clinicalBookingPaymentHoldRepository.js";
import {
  buildClinicTimetableSlotLabel,
  formatClinicTimeHm,
} from "../services/clinicalScheduleService.js";

function isMysqlDupEntry(e: unknown): boolean {
  return isUniqueViolation(e);
}

function normalizeEnrollmentTerm(term: string): string {
  return term.trim().slice(0, 20);
}

type ClinicalAttemptLevelBucket = "100" | "200" | "300";

type ClinicalCourseTemplate = {
  levelBucket: ClinicalAttemptLevelBucket;
  baseCode: string;
  courseTitle: string;
};

const CLINICAL_COURSE_TEMPLATE_BY_BUCKET: Record<
  ClinicalAttemptLevelBucket,
  ClinicalCourseTemplate
> = {
  "100": {
    levelBucket: "100",
    baseCode: "CL111",
    courseTitle: "Clinic Observation",
  },
  "200": {
    levelBucket: "200",
    baseCode: "CL211",
    courseTitle: "Supervised Assisted Practice",
  },
  "300": {
    levelBucket: "300",
    baseCode: "CL311",
    courseTitle: "Supervised Solo Practice",
  },
};

function preferredClinicalAttemptBucket(args: {
  requestedSeatBucket: ClinicalSeatBucket | null;
  chosenSeatBucket: ClinicalSeatBucket | null;
  caps: { c100: number; c200: number; c300: number };
}): ClinicalAttemptLevelBucket {
  const candidates: Array<ClinicalSeatBucket | null> = [
    args.chosenSeatBucket,
    args.requestedSeatBucket,
  ];
  for (const c of candidates) {
    if (c === "100" || c === "200" || c === "300") {
      return c;
    }
  }
  const available: ClinicalAttemptLevelBucket[] = [];
  if (args.caps.c100 > 0) available.push("100");
  if (args.caps.c200 > 0) available.push("200");
  if (args.caps.c300 > 0) available.push("300");
  if (available.length === 1) return available[0]!;
  return "100";
}

function parseClinicalAttemptSuffix(
  code: unknown,
  baseCode: string,
): number | null {
  const raw = String(code ?? "").trim().toUpperCase();
  const base = baseCode.trim().toUpperCase();
  const m = raw.match(new RegExp(`^${base}-(\\d+)$`));
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function trimOrEmpty(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeSqlTimeHms(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const hh = String(v.getHours()).padStart(2, "0");
    const mm = String(v.getMinutes()).padStart(2, "0");
    const ss = String(v.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return "00:00:00";
  const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, "0");
  const mm = String(Math.max(0, Math.min(59, Number(m[2])))).padStart(2, "0");
  const ss = String(
    Math.max(0, Math.min(59, m[3] != null ? Number(m[3]) : 0)),
  ).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

async function resolveStudentNameForClinic(
  conn: PoolConnection,
  studentId: string,
): Promise<string> {
  const sid = studentId.trim();
  const [studentRows] = await conn.query<RowDataPacket[]>(
    `SELECT TRIM(name) AS name
       FROM students
      WHERE TRIM(id) = TRIM(?)
      LIMIT 1`,
    [sid],
  );
  if (studentRows.length > 0) {
    const n = trimOrEmpty((studentRows[0] as { name?: unknown }).name);
    if (n !== "") return n;
  }
  return sid;
}

async function nextClinicalAttemptCodeForBase(
  conn: PoolConnection,
  args: { studentId: string; term: string; year: number; baseCode: string },
): Promise<string> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT code
       FROM clinic
      WHERE id = ?
        AND term = ?
        AND year = ?
        AND code LIKE CONCAT(?, '-%')
      FOR UPDATE`,
    [
      args.studentId.trim(),
      args.term.trim(),
      args.year,
      args.baseCode.trim().toUpperCase(),
    ],
  );
  let maxSuffix = 0;
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const suffix = parseClinicalAttemptSuffix(row.code, args.baseCode);
    if (suffix != null && suffix > maxSuffix) maxSuffix = suffix;
  }
  const nextSuffix = maxSuffix + 1;
  return `${args.baseCode.trim().toUpperCase()}-${nextSuffix}`;
}

async function insertClinicAttemptRowForEnrollment(
  conn: PoolConnection,
  args: {
    studentId: string;
    term: string;
    year: number;
    code: string;
    courseTitle: string;
    weekday: string;
    timeFrom: string;
    timeTo: string;
    instructor: string;
  },
): Promise<void> {
  const studentName = await resolveStudentNameForClinic(conn, args.studentId);
  await conn.query<ResultSetHeader>(
    `INSERT INTO clinic (
      name, id, code, grade, grade2, course_title, units, days,
      time_from, time_to, instructor, term, year, hours
    ) VALUES (?, ?, ?, '', 0, ?, 2, ?, ?, ?, ?, ?, ?, 40)`,
    [
      studentName,
      args.studentId.trim(),
      args.code.trim().toUpperCase(),
      args.courseTitle.trim(),
      args.weekday.trim(),
      args.timeFrom,
      args.timeTo,
      args.instructor.trim(),
      args.term.trim(),
      args.year,
    ],
  );
}

async function deleteLatestUngradedClinicAttemptForDrop(
  conn: PoolConnection,
  args: {
    studentId: string;
    term: string;
    year: number;
    baseCode: string;
    weekday: string;
    timeFrom: string;
    timeTo: string;
    instructor: string;
  },
): Promise<void> {
  const likePrefix = `${args.baseCode.trim().toUpperCase()}-%`;
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT code, grade
       FROM clinic
      WHERE TRIM(id) = TRIM(?)
        AND TRIM(term) = TRIM(?)
        AND year = ?
        AND UPPER(TRIM(code)) LIKE ?
        AND TRIM(COALESCE(days, '')) = TRIM(?)
        AND time_from = ?
        AND time_to = ?
        AND TRIM(COALESCE(instructor, '')) = TRIM(?)
      FOR UPDATE`,
    [
      args.studentId.trim(),
      args.term.trim(),
      args.year,
      likePrefix,
      args.weekday.trim(),
      args.timeFrom,
      args.timeTo,
      args.instructor.trim(),
    ],
  );
  let bestSuffix = -1;
  let bestCode: string | null = null;
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const grade = trimOrEmpty(row.grade);
    if (grade !== "") continue;
    const code = trimOrEmpty(row.code);
    const suffix = parseClinicalAttemptSuffix(code, args.baseCode);
    if (suffix != null && suffix > bestSuffix) {
      bestSuffix = suffix;
      bestCode = code;
    }
  }
  if (bestCode == null) {
    const [fallbackRows] = await conn.query<RowDataPacket[]>(
      `SELECT code, grade
         FROM clinic
        WHERE TRIM(id) = TRIM(?)
          AND TRIM(term) = TRIM(?)
          AND year = ?
          AND UPPER(TRIM(code)) LIKE ?
        FOR UPDATE`,
      [args.studentId.trim(), args.term.trim(), args.year, likePrefix],
    );
    for (const raw of fallbackRows) {
      const row = raw as Record<string, unknown>;
      const grade = trimOrEmpty(row.grade);
      if (grade !== "") continue;
      const code = trimOrEmpty(row.code);
      const suffix = parseClinicalAttemptSuffix(code, args.baseCode);
      if (suffix != null && suffix > bestSuffix) {
        bestSuffix = suffix;
        bestCode = code;
      }
    }
  }
  if (bestCode == null) return;
  await conn.query<ResultSetHeader>(
    `DELETE FROM clinic
      WHERE TRIM(id) = TRIM(?)
        AND TRIM(term) = TRIM(?)
        AND year = ?
        AND UPPER(TRIM(code)) = UPPER(TRIM(?))
        AND TRIM(COALESCE(grade, '')) = ''
      LIMIT 1`,
    [args.studentId.trim(), args.term.trim(), args.year, bestCode],
  );
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

/** Capacity / enrollment bucket for timetable-driven bookings. */
export type ClinicalSeatBucket = "100" | "200" | "300" | "all";

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

export type ClinicalEnrollmentStudentRow = {
  id: number;
  studentId: string;
  timetableId: number;
  term: string;
  year: number;
  status: string;
  /** Which timetable capacity bucket this row consumes when `enrolled`. */
  seatBucket: ClinicalSeatBucket | null;
  slotLabel: string;
  faculty: string | null;
  site: string | null;
  createdAt: string;
  /**
   * When present, this active enrollment has an unpaid clinical booking charge whose
   * payment deadline is this instant (UTC, set at registration).
   */
  paymentHoldExpiresAt: string | null;
};

/** Slot roster row for admin (`clinical_enrollments.status = 'enrolled'` only). */
export type ClinicalSlotRosterAdminRow = {
  enrollmentId: number;
  studentId: string;
  studentName: string;
  email: string | null;
  status: string;
  seatBucket: ClinicalSeatBucket | null;
  createdAt: string;
};

export async function studentExistsByExternalId(
  studentId: string,
): Promise<boolean> {
  const sid = studentId.trim();
  if (sid === "") return false;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM students
      WHERE TRIM(id) = TRIM(?)
      LIMIT 1`,
    [sid],
  );
  return rows.length > 0;
}

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

  return rows.map((raw) => mapRowToClinicalEnrollmentSlotRow(raw as Record<string, unknown>));
}

function mapRowToClinicalEnrollmentSlotRow(
  row: Record<string, unknown>,
): ClinicalEnrollmentSlotRow {
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
  const r100 = Math.max(0, cap100 - e100);
  const r200 = Math.max(0, cap200 - e200);
  const r300 = Math.max(0, cap300 - e300);
  const rAll = Math.max(0, capAll - eAll);
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
    capacity100: cap100,
    capacity200: cap200,
    capacity300: cap300,
    capacityAll: capAll,
    enrolled100: e100,
    enrolled200: e200,
    enrolled300: e300,
    enrolledAll: eAll,
    remaining100: r100,
    remaining200: r200,
    remaining300: r300,
    remainingAll: rAll,
  };
}

/**
 * Distinct term/year pairs for any `clinical_enrollments` row for this student (any status).
 * Used so the Finance quarter picker includes terms where a clinical slot charge may exist.
 */
export async function listClinicalFinanceQuarterHintsForStudent(
  studentId: string,
): Promise<{ term: string; year: number }[]> {
  const sid = studentId.trim();
  if (sid === "") {
    return [];
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT TRIM(term) AS term, year
       FROM clinical_enrollments
      WHERE TRIM(student_id) = TRIM(?)
      ORDER BY year DESC,
        CASE UPPER(TRIM(term))
          WHEN 'FALL' THEN 4
          WHEN 'SUMMER' THEN 3
          WHEN 'SPRING' THEN 2
          WHEN 'WINTER' THEN 1
          ELSE 0
        END DESC`,
    [sid],
  );
  return rows.map((r) => ({
    term: String(r.term ?? "").trim(),
    year: Number(r.year),
  }));
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

  const hasHolds = await clinicalBookingPaymentHoldsTableExists();
  const holdJoin = hasHolds
    ? `LEFT JOIN clinical_booking_payment_holds ph
         ON ph.clinical_enrollment_id = ce.id
        AND ph.status = 'active'
        AND ph.id = (
              SELECT MAX(ph2.id)
                FROM clinical_booking_payment_holds ph2
               WHERE ph2.clinical_enrollment_id = ce.id
                 AND ph2.status = 'active')`
    : "";
  const holdSelect = hasHolds
    ? "ph.hold_expires_at AS payment_hold_expires_at"
    : "CAST(NULL AS DATETIME) AS payment_hold_expires_at";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        ce.id,
        TRIM(ce.student_id) AS student_id,
        ce.timetable_id,
        TRIM(ce.term) AS term,
        ce.year,
        TRIM(ce.status) AS status,
        TRIM(ce.seat_bucket) AS seat_bucket,
        ce.created_at,
        ct.day AS weekday,
        ct.time_from,
        ct.time_to,
        ct.slot,
        TRIM(ct.instructor) AS instructor,
        ${holdSelect}
     FROM clinical_enrollments ce
     INNER JOIN clinic_timetable ct ON ct.seqNum = ce.timetable_id
     ${holdJoin}
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
    const phe = row.payment_hold_expires_at;
    let paymentHoldExpiresAt: string | null = null;
    if (phe instanceof Date && !Number.isNaN(phe.getTime())) {
      paymentHoldExpiresAt = phe.toISOString();
    } else if (phe != null && String(phe).trim() !== "") {
      const d = new Date(String(phe));
      paymentHoldExpiresAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const st = String(row.status ?? "").trim().toLowerCase();
    if (st !== "enrolled") {
      paymentHoldExpiresAt = null;
    }
    const sbRaw = String(row.seat_bucket ?? "").trim().toLowerCase();
    let seatBucket: ClinicalSeatBucket | null = null;
    if (sbRaw === "100" || sbRaw === "200" || sbRaw === "300" || sbRaw === "all") {
      seatBucket = sbRaw as ClinicalSeatBucket;
    }
    return {
      id: Number(row.id),
      studentId: String(row.student_id ?? "").trim(),
      timetableId: Number(row.timetable_id),
      term: String(row.term ?? "").trim(),
      year: Number(row.year),
      status: String(row.status ?? "").trim(),
      seatBucket,
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
      paymentHoldExpiresAt,
    };
  });
}

/**
 * Students with an `enrolled` row on this timetable slot (admin roster).
 * Joins legacy `students` for display name and email.
 */
export async function listActiveClinicalRosterForTimetable(
  timetableId: number,
): Promise<ClinicalSlotRosterAdminRow[]> {
  if (!Number.isFinite(timetableId) || timetableId <= 0) {
    return [];
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        ce.id AS enrollment_id,
        TRIM(ce.student_id) AS student_id,
        TRIM(ce.status) AS status,
        TRIM(ce.seat_bucket) AS seat_bucket,
        ce.created_at,
        TRIM(s.name) AS student_name,
        TRIM(s.email) AS student_email
     FROM clinical_enrollments ce
     LEFT JOIN students s ON TRIM(s.id) = TRIM(ce.student_id)
    WHERE ce.timetable_id = ?
      AND LOWER(TRIM(ce.status)) = 'enrolled'
    ORDER BY ce.created_at ASC, ce.id ASC`,
    [timetableId],
  );

  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const sid = String(row.student_id ?? "").trim();
    const nameRaw = String(row.student_name ?? "").trim();
    const name = nameRaw !== "" ? nameRaw : sid;
    const emailRaw = String(row.student_email ?? "").trim();
    const email = emailRaw !== "" ? emailRaw : null;
    const ca = row.created_at;
    let createdAt: string;
    if (ca instanceof Date) {
      createdAt = ca.toISOString();
    } else {
      createdAt = String(ca ?? "");
    }
    const sbRaw = String(row.seat_bucket ?? "").trim().toLowerCase();
    let seatBucket: ClinicalSeatBucket | null = null;
    if (sbRaw === "100" || sbRaw === "200" || sbRaw === "300" || sbRaw === "all") {
      seatBucket = sbRaw as ClinicalSeatBucket;
    }
    return {
      enrollmentId: Number(row.enrollment_id),
      studentId: sid,
      studentName: name,
      email,
      status: String(row.status ?? "").trim(),
      seatBucket,
      createdAt,
    };
  });
}

export async function getClinicalEnrollmentSlotBinding(
  enrollmentId: number,
  studentId: string,
): Promise<{ timetableId: number; status: string } | null> {
  if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
    return null;
  }
  const sid = studentId.trim();
  if (sid === "") return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ce.timetable_id, TRIM(ce.status) AS status
       FROM clinical_enrollments ce
      WHERE ce.id = ?
        AND TRIM(ce.student_id) = TRIM(?)
      LIMIT 1`,
    [enrollmentId, sid],
  );
  if (rows.length === 0) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    timetableId: Number(r.timetable_id),
    status: String(r.status ?? "").trim().toLowerCase(),
  };
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
    seatBucket?: ClinicalSeatBucket | null;
  },
): Promise<number> {
  const status =
    input.status != null && String(input.status).trim() !== ""
      ? String(input.status).trim().toLowerCase().slice(0, 20)
      : "enrolled";
  const sb =
    input.seatBucket === undefined
      ? undefined
      : input.seatBucket === null
        ? null
        : input.seatBucket;
  const [res] = await conn.query<ResultSetHeader>(
    sb === undefined
      ? `INSERT INTO clinical_enrollments
          (student_id, timetable_id, term, year, status)
         VALUES (TRIM(?), ?, TRIM(?), ?, ?)`
      : `INSERT INTO clinical_enrollments
          (student_id, timetable_id, term, year, status, seat_bucket)
         VALUES (TRIM(?), ?, TRIM(?), ?, ?, ?)`,
    sb === undefined
      ? [
          input.studentId.trim(),
          input.timetableId,
          normalizeEnrollmentTerm(input.term),
          input.year,
          status,
        ]
      : [
          input.studentId.trim(),
          input.timetableId,
          normalizeEnrollmentTerm(input.term),
          input.year,
          status,
          sb,
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

export async function updateClinicalEnrollmentStatusAndSeatBucketById(
  conn: PoolConnection,
  enrollmentId: number,
  studentId: string,
  status: string,
  seatBucket: ClinicalSeatBucket | null,
): Promise<number> {
  const st = status.trim().toLowerCase().slice(0, 20);
  const [res] = await conn.query<ResultSetHeader>(
    `UPDATE clinical_enrollments
        SET status = ?,
            seat_bucket = ?
      WHERE id = ?
        AND TRIM(student_id) = TRIM(?)`,
    [st, seatBucket, enrollmentId, studentId.trim()],
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
        AND TRIM(COALESCE(term, '')) = ?
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

type BucketUsage = { n100: number; n200: number; n300: number; nAll: number };

function normalizeEnrollmentSeatBucket(v: unknown): ClinicalSeatBucket {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "100") return "100";
  if (s === "200") return "200";
  if (s === "300") return "300";
  return "all";
}

function aggregateEnrolledBucketsFromLockedRows(
  rows: RowDataPacket[],
): BucketUsage {
  const out: BucketUsage = { n100: 0, n200: 0, n300: 0, nAll: 0 };
  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    if (String(row.status ?? "").trim().toLowerCase() !== "enrolled") {
      continue;
    }
    const b = normalizeEnrollmentSeatBucket(row.seat_bucket);
    if (b === "100") out.n100 += 1;
    else if (b === "200") out.n200 += 1;
    else if (b === "300") out.n300 += 1;
    else out.nAll += 1;
  }
  return out;
}

function parseExplicitSeatBucket(
  raw: ClinicalSeatBucket | null | undefined,
): ClinicalSeatBucket | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "100" || s === "200" || s === "300" || s === "all") {
    return s;
  }
  return null;
}

function resolveChosenSeatBucketForEnrollment(args: {
  bucketEnforced: boolean;
  requestedSeatBucket: ClinicalSeatBucket | null;
  caps: { c100: number; c200: number; c300: number; cAll: number };
  used: BucketUsage;
}):
  | { ok: true; seatBucket: ClinicalSeatBucket | null }
  | { ok: false; error: string } {
  const { bucketEnforced, requestedSeatBucket, caps, used } = args;
  if (!bucketEnforced) {
    return { ok: true, seatBucket: null };
  }
  const b = parseExplicitSeatBucket(requestedSeatBucket);
  if (b == null) {
    if (caps.c100 > 0 && used.n100 < caps.c100) {
      return { ok: true, seatBucket: "100" };
    }
    if (caps.c200 > 0 && used.n200 < caps.c200) {
      return { ok: true, seatBucket: "200" };
    }
    if (caps.c300 > 0 && used.n300 < caps.c300) {
      return { ok: true, seatBucket: "300" };
    }
    if (caps.cAll > 0 && used.nAll < caps.cAll) {
      return { ok: true, seatBucket: "all" };
    }
    return { ok: false, error: "This slot is full." };
  }
  if (b === "100") {
    if (caps.c100 <= 0) {
      return {
        ok: false,
        error: "This slot does not offer 100-level seats.",
      };
    }
    if (used.n100 >= caps.c100) {
      return { ok: false, error: "100-level seats are full." };
    }
    return { ok: true, seatBucket: "100" };
  }
  if (b === "200") {
    if (caps.c200 <= 0) {
      return {
        ok: false,
        error: "This slot does not offer 200-level seats.",
      };
    }
    if (used.n200 >= caps.c200) {
      return { ok: false, error: "200-level seats are full." };
    }
    return { ok: true, seatBucket: "200" };
  }
  if (b === "300") {
    if (caps.c300 <= 0) {
      return {
        ok: false,
        error: "This slot does not offer 300-level seats.",
      };
    }
    if (used.n300 >= caps.c300) {
      return { ok: false, error: "300-level seats are full." };
    }
    return { ok: true, seatBucket: "300" };
  }
  if (caps.cAll <= 0) {
    return {
      ok: false,
      error: "This slot does not offer all-levels seats.",
    };
  }
  if (used.nAll >= caps.cAll) {
    return { ok: false, error: "All-levels seats are full." };
  }
  return { ok: true, seatBucket: "all" };
}

/**
 * Transaction-safe enroll: lock, capacity check, insert or reactivate row. Caller supplies assignment insert.
 */
export async function createClinicalEnrollment(
  studentId: string,
  timetableId: number,
  term: string,
  year: number,
  requestedSeatBucket: ClinicalSeatBucket | null,
  insertAssignment: (conn: PoolConnection) => Promise<number>,
  afterEnrollmentInTxn?: (args: {
    conn: PoolConnection;
    enrollmentId: number;
    assignmentId: number;
    seatBucket: ClinicalSeatBucket | null;
    wasReactivation: boolean;
    isNewEnrollmentRow: boolean;
    term: string;
    year: number;
  }) => Promise<void>,
): Promise<
  | {
      ok: true;
      enrollmentId: number;
      assignmentId: number;
      /** `true` only when a new `clinical_enrollments` row was inserted (not a dropped→enrolled reactivation). */
      isNewEnrollmentRow: boolean;
      /** `true` when an existing dropped row was moved back to `enrolled`. */
      wasReactivation: boolean;
      seatBucket: ClinicalSeatBucket | null;
    }
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

    const [ttRows] = await conn.query<RowDataPacket[]>(
      `SELECT seqNum AS id,
              TRIM(term) AS term,
              year,
              TRIM(day) AS weekday,
              time_from,
              time_to,
              TRIM(instructor) AS instructor,
              \`100Max\` AS cap_100,
              \`200Max\` AS cap_200,
              \`300Max\` AS cap_300,
              \`123Max\` AS cap_123
         FROM clinic_timetable
        WHERE seqNum = ?
        LIMIT 1
        FOR UPDATE`,
      [timetableId],
    );
    if (ttRows.length === 0) {
      await conn.rollback();
      return { ok: false, error: "Clinic slot not found." };
    }
    const tt = ttRows[0] as Record<string, unknown>;
    const caps = {
      c100: Math.max(0, Math.trunc(Number(tt.cap_100))),
      c200: Math.max(0, Math.trunc(Number(tt.cap_200))),
      c300: Math.max(0, Math.trunc(Number(tt.cap_300))),
      cAll: Math.max(0, Math.trunc(Number(tt.cap_123))),
    };
    const slotCapacity = caps.c100 + caps.c200 + caps.c300 + caps.cAll;
    const bucketEnforced = slotCapacity > 0;

    const [lockedEnr] = await conn.query<RowDataPacket[]>(
      `SELECT id,
              TRIM(student_id) AS student_id,
              LOWER(TRIM(status)) AS status,
              seat_bucket
         FROM clinical_enrollments
        WHERE timetable_id = ?
          AND TRIM(term) = ?
          AND year = ?
        FOR UPDATE`,
      [timetableId, te, year],
    );

    let existing: ClinicalEnrollmentLockRow | null = null;
    for (const raw of lockedEnr) {
      const row = raw as Record<string, unknown>;
      if (String(row.student_id ?? "").trim() === sid) {
        existing = {
          id: Number(row.id),
          status: String(row.status ?? "").trim().toLowerCase(),
        };
        break;
      }
    }

    if (existing != null && existing.status === "enrolled") {
      await conn.rollback();
      return {
        ok: false,
        error: "You are already enrolled in this clinic slot.",
      };
    }

    const usedBuckets = aggregateEnrolledBucketsFromLockedRows(lockedEnr);
    const wasReactivation = existing != null && existing.status === "dropped";

    const bucketPick = resolveChosenSeatBucketForEnrollment({
      bucketEnforced,
      requestedSeatBucket,
      caps,
      used: usedBuckets,
    });
    if (!bucketPick.ok) {
      await conn.rollback();
      return { ok: false, error: bucketPick.error };
    }
    const chosenBucket = bucketPick.seatBucket;

    let enrollmentId: number;
    let isNewEnrollmentRow: boolean;
    if (existing == null) {
      try {
        enrollmentId = await insertClinicalEnrollmentRow(conn, {
          studentId: sid,
          timetableId,
          term: te,
          year,
          status: "enrolled",
          seatBucket: bucketEnforced ? chosenBucket : null,
        });
        isNewEnrollmentRow = true;
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
      const n = await updateClinicalEnrollmentStatusAndSeatBucketById(
        conn,
        existing.id,
        sid,
        "enrolled",
        bucketEnforced ? chosenBucket : null,
      );
      if (n === 0) {
        await conn.rollback();
        return { ok: false, error: "Could not update enrollment." };
      }
      enrollmentId = existing.id;
      isNewEnrollmentRow = false;
    }

    const assignmentId = await insertAssignment(conn);

    const attemptBucket = preferredClinicalAttemptBucket({
      requestedSeatBucket,
      chosenSeatBucket: chosenBucket,
      caps,
    });
    const template = CLINICAL_COURSE_TEMPLATE_BY_BUCKET[attemptBucket];
    const clinicalCode = await nextClinicalAttemptCodeForBase(conn, {
      studentId: sid,
      term: te,
      year,
      baseCode: template.baseCode,
    });
    await insertClinicAttemptRowForEnrollment(conn, {
      studentId: sid,
      term: te,
      year,
      code: clinicalCode,
      courseTitle: template.courseTitle,
      weekday: trimOrEmpty(tt.weekday),
      timeFrom: normalizeSqlTimeHms(tt.time_from),
      timeTo: normalizeSqlTimeHms(tt.time_to),
      instructor: trimOrEmpty(tt.instructor),
    });

    if (afterEnrollmentInTxn != null) {
      await afterEnrollmentInTxn({
        conn,
        enrollmentId,
        assignmentId,
        seatBucket: bucketEnforced ? chosenBucket : null,
        wasReactivation,
        isNewEnrollmentRow,
        term: te,
        year,
      });
    }

    await conn.commit();
    return {
      ok: true,
      enrollmentId,
      assignmentId,
      isNewEnrollmentRow,
      wasReactivation,
      seatBucket: bucketEnforced ? chosenBucket : null,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Non-destructive drop inside an existing transaction (caller manages commit/rollback).
 */
export async function dropClinicalEnrollmentInConn(
  conn: PoolConnection,
  studentId: string,
  enrollmentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = studentId.trim();
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, timetable_id, TRIM(term) AS term, year, TRIM(status) AS status, seat_bucket
       FROM clinical_enrollments
      WHERE id = ?
        AND TRIM(student_id) = TRIM(?)
      LIMIT 1
      FOR UPDATE`,
    [enrollmentId, sid],
  );
  if (rows.length === 0) {
    return { ok: false, error: "Enrollment not found." };
  }
  const r = rows[0] as Record<string, unknown>;
  const st = String(r.status ?? "").trim().toLowerCase();
  if (st !== "enrolled") {
    return { ok: false, error: "This enrollment is not active." };
  }

  const timetableId = Number(r.timetable_id);
  const term = String(r.term ?? "").trim();
  const year = Number(r.year);
  const seatBucketRaw = String(r.seat_bucket ?? "").trim().toLowerCase();
  const seatBucket: ClinicalSeatBucket | null =
    seatBucketRaw === "100" ||
    seatBucketRaw === "200" ||
    seatBucketRaw === "300" ||
    seatBucketRaw === "all"
      ? (seatBucketRaw as ClinicalSeatBucket)
      : null;

  const n = await updateClinicalEnrollmentStatusById(
    conn,
    enrollmentId,
    sid,
    "dropped",
  );
  if (n === 0) {
    return { ok: false, error: "Could not drop enrollment." };
  }

  await markClinicalAssignmentsDroppedForStudentSlot(
    conn,
    sid,
    timetableId,
    term,
    year,
  );

  const [ttRows] = await conn.query<RowDataPacket[]>(
    `SELECT TRIM(day) AS weekday,
            time_from,
            time_to,
            TRIM(instructor) AS instructor,
            \`100Max\` AS cap_100,
            \`200Max\` AS cap_200,
            \`300Max\` AS cap_300
       FROM clinic_timetable
      WHERE seqNum = ?
      LIMIT 1`,
    [timetableId],
  );
  if (ttRows.length > 0) {
    const tt = ttRows[0] as Record<string, unknown>;
    const attemptBucket = preferredClinicalAttemptBucket({
      requestedSeatBucket: seatBucket,
      chosenSeatBucket: seatBucket,
      caps: {
        c100: Math.max(0, Math.trunc(Number(tt.cap_100))),
        c200: Math.max(0, Math.trunc(Number(tt.cap_200))),
        c300: Math.max(0, Math.trunc(Number(tt.cap_300))),
      },
    });
    const template = CLINICAL_COURSE_TEMPLATE_BY_BUCKET[attemptBucket];
    await deleteLatestUngradedClinicAttemptForDrop(conn, {
      studentId: sid,
      term,
      year,
      baseCode: template.baseCode,
      weekday: trimOrEmpty(tt.weekday),
      timeFrom: normalizeSqlTimeHms(tt.time_from),
      timeTo: normalizeSqlTimeHms(tt.time_to),
      instructor: trimOrEmpty(tt.instructor),
    });
  }

  return { ok: true };
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

    const dropped = await dropClinicalEnrollmentInConn(conn, sid, enrollmentId);
    if (!dropped.ok) {
      await conn.rollback();
      return dropped;
    }

    await voidSystemClinicalChargesForEnrollmentInConn(
      conn,
      enrollmentId,
      "manual_drop",
    );

    if (await clinicalBookingPaymentHoldsTableExists()) {
      await cancelActiveClinicalBookingPaymentHoldsForEnrollment(
        conn,
        enrollmentId,
        "manual_drop",
      );
    }

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

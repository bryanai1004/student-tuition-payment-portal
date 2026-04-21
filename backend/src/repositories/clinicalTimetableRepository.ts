import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
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
};

function mapTimetableAdminRow(r: RowDataPacket): ClinicTimetableAdminRow {
  const base = mapTimetableRow(r);
  const row = r as Record<string, unknown>;
  const aid = row.academic_term_id;
  const cntRaw = Number(row.active_enrolled_count);
  const active_enrolled_count =
    Number.isFinite(cntRaw) && cntRaw > 0 ? Math.trunc(cntRaw) : 0;
  return {
    ...base,
    academic_term_id:
      aid == null || aid === "" ? null : String(aid).trim() || null,
    active_enrolled_count,
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
            COALESCE(ce_cnt.cnt, 0) AS active_enrolled_count
       FROM clinic_timetable ct
       LEFT JOIN academic_terms at
         ON at.year = ct.year AND at.term_name = TRIM(ct.term)
       LEFT JOIN (
         SELECT ce.timetable_id, COUNT(*) AS cnt
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

export type ClinicTimetableReferenceCounts = {
  enrollments: number;
  requests: number;
  assignments: number;
};

/**
 * Rows still pointing at this `clinic_timetable.seqNum` (enrollments, requests, assignments).
 */
export async function countClinicTimetableReferences(
  seqNum: number,
): Promise<ClinicTimetableReferenceCounts> {
  if (!Number.isFinite(seqNum) || seqNum <= 0) {
    return { enrollments: 0, requests: 0, assignments: 0 };
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        (SELECT COUNT(*) FROM clinical_enrollments WHERE timetable_id = ?) AS enrollments,
        (SELECT COUNT(*) FROM clinical_requests WHERE timetable_id = ?) AS requests,
        (SELECT COUNT(*) FROM clinical_assignments WHERE timetable_id = ?) AS assignments`,
    [seqNum, seqNum, seqNum],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) {
    return { enrollments: 0, requests: 0, assignments: 0 };
  }
  return {
    enrollments: Math.max(0, Math.trunc(Number(r.enrollments))),
    requests: Math.max(0, Math.trunc(Number(r.requests))),
    assignments: Math.max(0, Math.trunc(Number(r.assignments))),
  };
}

/** Legacy caps summed (same semantics as enrollment repository). */
function sumClinicTimetableCaps(row: Record<string, unknown>): number {
  const a = Math.max(0, Math.trunc(Number(row.cap_100)));
  const b = Math.max(0, Math.trunc(Number(row.cap_200)));
  const c = Math.max(0, Math.trunc(Number(row.cap_300)));
  const d = Math.max(0, Math.trunc(Number(row.cap_123)));
  return a + b + c + d;
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
    const cap = sumClinicTimetableCaps(row);
    const enrolled = Math.max(0, Math.trunc(Number(row.enrolled_count)));
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
    };
  });
}

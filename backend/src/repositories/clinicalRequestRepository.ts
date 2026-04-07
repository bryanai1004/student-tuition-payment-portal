import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { pool } from "../lib/db.js";

export type ClinicalRequestDbRow = {
  id: number;
  student_id: string;
  timetable_id: number;
  term: string;
  year: number;
  status: string;
  created_at: Date;
  decided_at: Date | null;
  decided_by: string | null;
  tt_day: string | null;
  tt_time_from: string | null;
  tt_time_to: string | null;
  tt_slot: string | null;
  tt_instructor: string | null;
};

function coerceMysqlTime(v: unknown): string | null {
  if (v == null || v === "") {
    return null;
  }
  if (v instanceof Date) {
    const h = v.getUTCHours();
    const m = v.getUTCMinutes();
    const sec = v.getUTCSeconds();
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  const s = String(v ?? "");
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    return `${m[1]!.padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`;
  }
  return s;
}

function mapRequestRow(r: RowDataPacket): ClinicalRequestDbRow {
  const row = r as Record<string, unknown>;
  const ca = row.created_at;
  const createdAt =
    ca instanceof Date ? ca : new Date(String(ca ?? ""));
  const da = row.decided_at;
  const decidedAt =
    da == null || da === ""
      ? null
      : da instanceof Date
        ? da
        : new Date(String(da));
  return {
    id: Number(row.id),
    student_id: String(row.student_id ?? "").trim(),
    timetable_id: Number(row.timetable_id),
    term: String(row.term ?? "").trim(),
    year: Number(row.year),
    status: String(row.status ?? "pending").trim().toLowerCase() || "pending",
    created_at: createdAt,
    decided_at: decidedAt,
    decided_by:
      row.decided_by == null || row.decided_by === ""
        ? null
        : String(row.decided_by).trim() || null,
    tt_day:
      row.tt_day == null || row.tt_day === ""
        ? null
        : String(row.tt_day).trim() || null,
    tt_time_from:
      row.tt_time_from == null || row.tt_time_from === ""
        ? null
        : coerceMysqlTime(row.tt_time_from),
    tt_time_to:
      row.tt_time_to == null || row.tt_time_to === ""
        ? null
        : coerceMysqlTime(row.tt_time_to),
    tt_slot:
      row.tt_slot == null || row.tt_slot === ""
        ? null
        : String(row.tt_slot).trim() || null,
    tt_instructor:
      row.tt_instructor == null || row.tt_instructor === ""
        ? null
        : String(row.tt_instructor).trim() || null,
  };
}

export async function insertClinicalRequestRow(params: {
  studentId: string;
  timetableId: number;
  term: string;
  year: number;
}): Promise<number> {
  const term = String(params.term ?? "").trim().slice(0, 20);
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO clinical_requests
      (student_id, timetable_id, term, year, status)
     VALUES (TRIM(?), ?, ?, ?, 'pending')`,
    [params.studentId, params.timetableId, term, params.year],
  );
  return Number(res.insertId);
}

export async function studentHasPendingClinicalRequestForTimetable(
  studentId: string,
  timetableId: number,
): Promise<boolean> {
  const sid = studentId.trim();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
       FROM clinical_requests
      WHERE TRIM(student_id) = TRIM(?)
        AND timetable_id = ?
        AND LOWER(TRIM(status)) = 'pending'
      LIMIT 1`,
    [sid, timetableId],
  );
  return rows.length > 0;
}

export async function listClinicalRequestsForStudent(
  studentId: string,
): Promise<ClinicalRequestDbRow[]> {
  const sid = studentId.trim();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cr.id, cr.student_id, cr.timetable_id, cr.term, cr.year, cr.status,
            cr.created_at, cr.decided_at, cr.decided_by,
            ct.day AS tt_day, ct.time_from AS tt_time_from, ct.time_to AS tt_time_to,
            ct.slot AS tt_slot, ct.instructor AS tt_instructor
       FROM clinical_requests cr
       LEFT JOIN clinic_timetable ct ON cr.timetable_id = ct.seqNum
      WHERE TRIM(cr.student_id) = TRIM(?)
      ORDER BY cr.created_at DESC, cr.id DESC`,
    [sid],
  );
  return rows.map(mapRequestRow);
}

export async function listPendingClinicalRequestsForAdmin(): Promise<
  ClinicalRequestDbRow[]
> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cr.id, cr.student_id, cr.timetable_id, cr.term, cr.year, cr.status,
            cr.created_at, cr.decided_at, cr.decided_by,
            ct.day AS tt_day, ct.time_from AS tt_time_from, ct.time_to AS tt_time_to,
            ct.slot AS tt_slot, ct.instructor AS tt_instructor
       FROM clinical_requests cr
       LEFT JOIN clinic_timetable ct ON cr.timetable_id = ct.seqNum
      WHERE LOWER(TRIM(cr.status)) = 'pending'
      ORDER BY cr.created_at ASC, cr.id ASC`,
  );
  return rows.map(mapRequestRow);
}

export async function getClinicalRequestById(
  id: number,
): Promise<ClinicalRequestDbRow | null> {
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cr.id, cr.student_id, cr.timetable_id, cr.term, cr.year, cr.status,
            cr.created_at, cr.decided_at, cr.decided_by,
            ct.day AS tt_day, ct.time_from AS tt_time_from, ct.time_to AS tt_time_to,
            ct.slot AS tt_slot, ct.instructor AS tt_instructor
       FROM clinical_requests cr
       LEFT JOIN clinic_timetable ct ON cr.timetable_id = ct.seqNum
      WHERE cr.id = ?
      LIMIT 1`,
    [id],
  );
  if (rows.length === 0) {
    return null;
  }
  return mapRequestRow(rows[0]!);
}

export async function getClinicalRequestByIdForUpdate(
  connection: PoolConnection,
  id: number,
): Promise<ClinicalRequestDbRow | null> {
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT cr.id, cr.student_id, cr.timetable_id, cr.term, cr.year, cr.status,
            cr.created_at, cr.decided_at, cr.decided_by,
            ct.day AS tt_day, ct.time_from AS tt_time_from, ct.time_to AS tt_time_to,
            ct.slot AS tt_slot, ct.instructor AS tt_instructor
       FROM clinical_requests cr
       LEFT JOIN clinic_timetable ct ON cr.timetable_id = ct.seqNum
      WHERE cr.id = ?
      LIMIT 1
      FOR UPDATE`,
    [id],
  );
  if (rows.length === 0) {
    return null;
  }
  return mapRequestRow(rows[0]!);
}

export async function updateClinicalRequestDecision(
  connection: PoolConnection,
  id: number,
  status: "approved" | "rejected",
  decidedBy: string | null,
): Promise<number> {
  const [res] = await connection.query<ResultSetHeader>(
    `UPDATE clinical_requests
        SET status = ?,
            decided_at = CURRENT_TIMESTAMP,
            decided_by = ?
      WHERE id = ?
        AND LOWER(TRIM(status)) = 'pending'`,
    [status, decidedBy, id],
  );
  return Number(res.affectedRows);
}

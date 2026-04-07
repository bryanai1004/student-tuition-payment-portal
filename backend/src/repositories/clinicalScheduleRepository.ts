import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../lib/db.js";

export type ClinicalAssignmentDbRow = {
  id: number;
  student_id: string;
  course_code: string;
  session_date: string;
  session_name: string | null;
  site: string | null;
  faculty: string | null;
  status: string;
  created_at: Date;
};

function mapRow(r: RowDataPacket): ClinicalAssignmentDbRow {
  const row = r as Record<string, unknown>;
  const sd = row.session_date;
  let sessionDateStr: string;
  if (sd instanceof Date) {
    sessionDateStr = sd.toISOString().slice(0, 10);
  } else if (typeof sd === "string") {
    sessionDateStr = sd.slice(0, 10);
  } else {
    sessionDateStr = String(sd ?? "");
  }
  const ca = row.created_at;
  const createdAt =
    ca instanceof Date ? ca : new Date(String(ca ?? ""));
  return {
    id: Number(row.id),
    student_id: String(row.student_id ?? "").trim(),
    course_code: String(row.course_code ?? "").trim(),
    session_date: sessionDateStr,
    session_name:
      row.session_name == null
        ? null
        : String(row.session_name).trim() || null,
    site: row.site == null ? null : String(row.site).trim() || null,
    faculty:
      row.faculty == null ? null : String(row.faculty).trim() || null,
    status: String(row.status ?? "Scheduled").trim() || "Scheduled",
    created_at: createdAt,
  };
}

export async function listStudentClinicalAssignments(
  studentId: string,
): Promise<ClinicalAssignmentDbRow[]> {
  const sid = studentId.trim();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, student_id, course_code, session_date, session_name, site, faculty, status, created_at
     FROM clinical_assignments
     WHERE TRIM(student_id) = TRIM(?)
     ORDER BY session_date ASC, id ASC`,
    [sid],
  );
  return rows.map(mapRow);
}

export type InsertClinicalAssignmentPayload = {
  studentId: string;
  courseCode: string;
  sessionDate: string;
  sessionName: string | null;
  site: string | null;
  faculty: string | null;
  status?: string;
};

export async function insertClinicalAssignment(
  payload: InsertClinicalAssignmentPayload,
): Promise<number> {
  const status =
    payload.status != null && String(payload.status).trim() !== ""
      ? String(payload.status).trim()
      : "Scheduled";
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO clinical_assignments
      (student_id, course_code, session_date, session_name, site, faculty, status)
     VALUES (TRIM(?), TRIM(?), ?, ?, ?, ?, ?)`,
    [
      payload.studentId,
      payload.courseCode,
      payload.sessionDate,
      payload.sessionName,
      payload.site,
      payload.faculty,
      status,
    ],
  );
  return Number(res.insertId);
}

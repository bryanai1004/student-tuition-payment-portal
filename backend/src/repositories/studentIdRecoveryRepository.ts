import { pool, type RowDataPacket } from "../lib/db.js";

export async function insertStudentIdRecoveryRequest(input: {
  studentId: string;
  email: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO student_id_recovery_requests (student_id, email)
     VALUES (?, ?)`,
    [input.studentId.trim(), input.email.trim().toLowerCase()],
  );
}

export async function countRecentStudentIdRecoveryRequests(
  studentId: string,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*)::int AS cnt
     FROM student_id_recovery_requests
     WHERE student_id = ?
       AND created_at > ?`,
    [studentId.trim(), since],
  );
  return Number(rows[0]?.cnt ?? 0);
}

import type { Pool, RowDataPacket } from "mysql2/promise";

export type LegacyStudentRow = {
  id: string;
  name: string;
};

/**
 * Legacy `students` table: `id` matches portal registration id (e.g. C17310).
 */
export async function findLegacyStudentById(
  pool: Pool,
  studentId: string,
): Promise<LegacyStudentRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, name FROM students WHERE id = ? LIMIT 1",
    [studentId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name == null ? "" : String(row.name),
  };
}

/**
 * Stored `password` from legacy `password_stu` (typically MD5 hex; may be plain in edge cases).
 */
export async function findLegacyStudentPasswordStored(
  pool: Pool,
  studentId: string,
): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT TRIM(password) AS pw FROM password_stu WHERE TRIM(id) = ? LIMIT 1",
    [studentId.trim()],
  );
  const row = rows[0];
  if (row?.pw == null) return null;
  const s = String(row.pw).trim();
  return s.length > 0 ? s : null;
}

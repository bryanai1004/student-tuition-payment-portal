import { type Pool, type RowDataPacket } from "../lib/db.js";

/**
 * Resolves `students.id` (portal / finance canonical external id) from either
 * `students.id` or `students.seqNum`.
 */
export async function resolveCanonicalStudentExternalId(
  pool: Pool,
  rawStudentKey: string,
): Promise<string | null> {
  const raw = rawStudentKey.trim();
  if (raw === "") return null;

  const numericSeq = /^\d+$/.test(raw) ? Math.trunc(Number(raw)) : null;
  if (numericSeq != null && Number.isFinite(numericSeq)) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TRIM(s.id) AS canonicalId
       FROM students s
       WHERE TRIM(s.id) = ? OR s.seqNum = ?
       LIMIT 1`,
      [raw, numericSeq],
    );
    const id = rows[0]?.canonicalId;
    if (id != null && String(id).trim() !== "") {
      return String(id).trim();
    }
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT TRIM(s.id) AS canonicalId
     FROM students s
     WHERE TRIM(s.id) = ?
     LIMIT 1`,
    [raw],
  );
  const id = rows[0]?.canonicalId;
  if (id != null && String(id).trim() !== "") {
    return String(id).trim();
  }
  return null;
}

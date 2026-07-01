import { pool, type RowDataPacket } from "../lib/db.js";

export type PasswordResetTokenRow = {
  id: number;
  studentId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

function ts(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) return v;
  return new Date(0).toISOString();
}

function mapRow(row: RowDataPacket): PasswordResetTokenRow {
  return {
    id: Number(row.id),
    studentId: String(row.student_id ?? ""),
    tokenHash: String(row.token_hash ?? ""),
    expiresAt: ts(row.expires_at),
    consumedAt: row.consumed_at == null ? null : ts(row.consumed_at),
    createdAt: ts(row.created_at),
  };
}

export async function insertPasswordResetToken(input: {
  studentId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<PasswordResetTokenRow> {
  const [result] = await pool.query<{ insertId: number }>(
    `INSERT INTO student_password_reset_tokens (student_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [input.studentId.trim(), input.tokenHash, input.expiresAt],
  );
  const insertId = Number(result?.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("Failed to create password reset token.");
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, student_id, token_hash, expires_at, consumed_at, created_at
     FROM student_password_reset_tokens
     WHERE id = ?
     LIMIT 1`,
    [insertId],
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to create password reset token.");
  return mapRow(row);
}

export async function findActivePasswordResetTokenByHash(
  tokenHash: string,
): Promise<PasswordResetTokenRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, student_id, token_hash, expires_at, consumed_at, created_at
     FROM student_password_reset_tokens
     WHERE token_hash = ?
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
}

export async function consumePasswordResetToken(id: number): Promise<void> {
  await pool.query(
    `UPDATE student_password_reset_tokens
     SET consumed_at = NOW()
     WHERE id = ?`,
    [id],
  );
}

export async function consumeOutstandingPasswordResetTokens(
  studentId: string,
  exceptId?: number,
): Promise<void> {
  if (exceptId != null) {
    await pool.query(
      `UPDATE student_password_reset_tokens
       SET consumed_at = NOW()
       WHERE student_id = ?
         AND consumed_at IS NULL
         AND id <> ?`,
      [studentId.trim(), exceptId],
    );
    return;
  }
  await pool.query(
    `UPDATE student_password_reset_tokens
     SET consumed_at = NOW()
     WHERE student_id = ?
       AND consumed_at IS NULL`,
    [studentId.trim()],
  );
}

export async function countRecentPasswordResetRequests(
  studentId: string,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*)::int AS cnt
     FROM student_password_reset_tokens
     WHERE student_id = ?
       AND created_at > ?`,
    [studentId.trim(), since],
  );
  return Number(rows[0]?.cnt ?? 0);
}

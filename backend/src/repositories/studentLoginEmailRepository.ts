import { pool, type RowDataPacket } from "../lib/db.js";

export type StudentLoginEmailRow = {
  studentId: string;
  email: string;
  verifiedAt: string;
  updatedAt: string;
};

export type OtpChallengeRow = {
  id: number;
  studentId: string;
  email: string;
  codeHash: string;
  purpose: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  createdAt: string;
};

function ts(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && v) return v;
  return new Date(0).toISOString();
}

function mapLoginEmailRow(row: RowDataPacket): StudentLoginEmailRow {
  return {
    studentId: String(row.student_id ?? ""),
    email: String(row.email ?? ""),
    verifiedAt: ts(row.verified_at),
    updatedAt: ts(row.updated_at),
  };
}

function mapChallengeRow(row: RowDataPacket): OtpChallengeRow {
  return {
    id: Number(row.id),
    studentId: String(row.student_id ?? ""),
    email: String(row.email ?? ""),
    codeHash: String(row.code_hash ?? ""),
    purpose: String(row.purpose ?? ""),
    expiresAt: ts(row.expires_at),
    attempts: Number(row.attempts ?? 0),
    consumedAt: row.consumed_at == null ? null : ts(row.consumed_at),
    createdAt: ts(row.created_at),
  };
}

export async function findLoginEmailByStudentId(
  studentId: string,
): Promise<StudentLoginEmailRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT student_id, email, verified_at, updated_at
     FROM student_login_emails
     WHERE student_id = ?
     LIMIT 1`,
    [studentId.trim()],
  );
  const row = rows[0];
  return row ? mapLoginEmailRow(row) : null;
}

export async function findLoginEmailOwnerStudentId(
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT student_id
     FROM student_login_emails
     WHERE LOWER(email) = ?
     LIMIT 1`,
    [normalized],
  );
  const row = rows[0];
  return row ? String(row.student_id ?? "").trim() : null;
}

export async function upsertVerifiedLoginEmail(
  studentId: string,
  email: string,
): Promise<StudentLoginEmailRow> {
  const sid = studentId.trim();
  const normalized = email.trim().toLowerCase();
  await pool.query(
    `INSERT INTO student_login_emails (student_id, email, verified_at, updated_at)
     VALUES (?, ?, NOW(), NOW())
     ON CONFLICT (student_id)
     DO UPDATE SET
       email = EXCLUDED.email,
       verified_at = NOW(),
       updated_at = NOW()`,
    [sid, normalized],
  );
  const row = await findLoginEmailByStudentId(sid);
  if (row == null) {
    throw new Error("Failed to persist verified login email.");
  }
  return row;
}

export async function insertOtpChallenge(input: {
  studentId: string;
  email: string;
  codeHash: string;
  purpose: string;
  expiresAt: Date;
}): Promise<OtpChallengeRow> {
  const [result] = await pool.query<{ insertId: number }>(
    `INSERT INTO student_email_otp_challenges (
       student_id, email, code_hash, purpose, expires_at
     ) VALUES (?, ?, ?, ?, ?)`,
    [
      input.studentId.trim(),
      input.email.trim().toLowerCase(),
      input.codeHash,
      input.purpose,
      input.expiresAt,
    ],
  );
  const insertId = Number(result?.insertId ?? 0);
  if (!Number.isFinite(insertId) || insertId <= 0) {
    throw new Error("Failed to create OTP challenge.");
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, student_id, email, code_hash, purpose, expires_at, attempts, consumed_at, created_at
     FROM student_email_otp_challenges
     WHERE id = ?
     LIMIT 1`,
    [insertId],
  );
  const row = rows[0];
  if (!row) throw new Error("Failed to create OTP challenge.");
  return mapChallengeRow(row);
}

/** Drop older unused codes so only the latest send remains valid. */
export async function consumeOutstandingOtpChallenges(input: {
  studentId: string;
  purpose: string;
  exceptId?: number;
}): Promise<void> {
  if (input.exceptId != null) {
    await pool.query(
      `UPDATE student_email_otp_challenges
       SET consumed_at = NOW()
       WHERE student_id = ?
         AND purpose = ?
         AND consumed_at IS NULL
         AND id <> ?`,
      [input.studentId.trim(), input.purpose, input.exceptId],
    );
    return;
  }
  await pool.query(
    `UPDATE student_email_otp_challenges
     SET consumed_at = NOW()
     WHERE student_id = ?
       AND purpose = ?
       AND consumed_at IS NULL`,
    [input.studentId.trim(), input.purpose],
  );
}

export async function updateOtpChallengeHash(
  id: number,
  codeHash: string,
): Promise<void> {
  await pool.query(
    `UPDATE student_email_otp_challenges SET code_hash = ? WHERE id = ?`,
    [codeHash, id],
  );
}

export async function findLatestActiveOtpChallenge(input: {
  studentId: string;
  email: string;
  purpose: string;
}): Promise<OtpChallengeRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, student_id, email, code_hash, purpose, expires_at, attempts, consumed_at, created_at
     FROM student_email_otp_challenges
     WHERE student_id = ?
       AND LOWER(email) = ?
       AND purpose = ?
       AND consumed_at IS NULL
       AND expires_at > NOW()
       AND code_hash <> 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [input.studentId.trim(), input.email.trim().toLowerCase(), input.purpose],
  );
  const row = rows[0];
  return row ? mapChallengeRow(row) : null;
}

export async function incrementOtpChallengeAttempts(id: number): Promise<void> {
  await pool.query(
    `UPDATE student_email_otp_challenges
     SET attempts = attempts + 1
     WHERE id = ?`,
    [id],
  );
}

export async function consumeOtpChallenge(id: number): Promise<void> {
  await pool.query(
    `UPDATE student_email_otp_challenges
     SET consumed_at = NOW()
     WHERE id = ?`,
    [id],
  );
}

export async function countRecentOtpSends(
  studentId: string,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*)::int AS cnt
     FROM student_email_otp_challenges
     WHERE student_id = ?
       AND purpose = 'verify'
       AND created_at > ?`,
    [studentId.trim(), since],
  );
  return Number(rows[0]?.cnt ?? 0);
}

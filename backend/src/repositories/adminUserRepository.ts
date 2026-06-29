import { type Pool, type RowDataPacket } from "../lib/db.js";
import type { AdminJwtRole } from "../lib/adminAuthToken.js";

export type AdminUserRow = {
  id: number;
  email: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
};

function mapAdminUserRow(row: RowDataPacket): AdminUserRow {
  return {
    id: Number(row.id),
    email: String(row.email),
    username: String(row.username ?? ""),
    display_name: String(row.display_name ?? ""),
    password_hash: String(row.password_hash),
    role: String(row.role),
  };
}

/**
 * Lookup by email or username (identifier normalized to lowercase trim).
 */
export async function findAdminUserByIdentifier(
  pool: Pool,
  identifierNormalized: string,
): Promise<AdminUserRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, email, username, display_name, password_hash, role
     FROM admin_users
     WHERE LOWER(TRIM(email)) = ?
        OR LOWER(TRIM(username)) = ?
     LIMIT 1`,
    [identifierNormalized, identifierNormalized],
  );
  const row = rows[0];
  if (row == null) return null;
  return mapAdminUserRow(row);
}

/** @deprecated Use findAdminUserByIdentifier */
export async function findAdminUserByEmail(
  pool: Pool,
  emailNormalized: string,
): Promise<AdminUserRow | null> {
  return findAdminUserByIdentifier(pool, emailNormalized);
}

export type AdminUserPublic = {
  email: string;
  role: AdminJwtRole;
  username: string;
  displayName: string;
};

export function toAdminUserPublic(row: AdminUserRow): AdminUserPublic {
  return {
    email: row.email,
    role: row.role as AdminJwtRole,
    username: row.username,
    displayName: row.display_name,
  };
}

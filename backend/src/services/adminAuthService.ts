import { type Pool } from "../lib/db.js";
import bcrypt from "bcryptjs";
import type { AdminJwtRole } from "../lib/adminAuthToken.js";
import { issueAdminAccessToken } from "../lib/adminAuthToken.js";
import {
  signInStaffWithSupabasePassword,
  supabaseStaffAuthEnabled,
} from "../lib/staffSupabaseAuth.js";
import {
  findAdminUserByIdentifier,
  toAdminUserPublic,
  type AdminUserPublic,
} from "../repositories/adminUserRepository.js";

const ADMIN_ROLE_SET = new Set<string>([
  "super_admin",
  "admin",
  "teacher",
  "clinical_teacher",
  "clinical_admin",
]);

function isAdminJwtRole(value: string): value is AdminJwtRole {
  return ADMIN_ROLE_SET.has(value);
}

export type AdminLoginResult = {
  accessToken: string;
  user: AdminUserPublic;
  verifiedVia: "supabase_auth" | "legacy_bcrypt";
};

export async function authenticateAdminLogin(
  pool: Pool,
  identifierRaw: string,
  passwordRaw: string,
): Promise<AdminLoginResult | null> {
  const identifier = identifierRaw.trim().toLowerCase();
  const password = passwordRaw.trim();
  if (identifier.length === 0 || password.length === 0) return null;

  const row = await findAdminUserByIdentifier(pool, identifier);
  if (row == null || !isAdminJwtRole(row.role)) {
    console.info("[admin/auth] login denied", { identifier, stage: "unknown_user" });
    return null;
  }

  if (supabaseStaffAuthEnabled()) {
    const supabaseOk = await signInStaffWithSupabasePassword(row.email, password);
    if (supabaseOk) {
      const user = toAdminUserPublic(row);
      return {
        accessToken: issueAdminAccessToken(user.email, user.role),
        user,
        verifiedVia: "supabase_auth",
      };
    }
  }

  const bcryptOk = await bcrypt.compare(password, row.password_hash);
  if (!bcryptOk) {
    console.info("[admin/auth] login denied", { identifier, stage: "bad_password" });
    return null;
  }

  const user = toAdminUserPublic(row);
  return {
    accessToken: issueAdminAccessToken(user.email, user.role),
    user,
    verifiedVia: "legacy_bcrypt",
  };
}

import type { AdminJwtRole } from "./adminAuthToken.js";

type LegacyRow = { email: string; password: string; role: AdminJwtRole };

/**
 * Hardcoded admin portal accounts preserved for backward compatibility when no
 * `admin_users` row exists for the email. DB-backed accounts (see `admin_users`)
 * are checked first in `postAdminAuthLogin`.
 *
 * `deanjiang@amu` is intentionally omitted here; that account lives only in `admin_users`.
 */
const LEGACY_ADMIN_ACCOUNTS: readonly LegacyRow[] = [
  { email: "wanpanelami@gmail.com", password: "amuadmin123", role: "admin" },
  { email: "bingchen.li@wanpanel.ai", password: "amuadmin123", role: "admin" },
  { email: "clinic@amu.edu", password: "amuadmin123", role: "admin" },
  { email: "clinicdean@amu.edu", password: "amuadmin123", role: "admin" },
  { email: "teacher@amu.edu", password: "teacher123", role: "teacher" },
  { email: "clinical@amu.edu", password: "clinical123", role: "clinical_teacher" },
  { email: "clinicaladmin@amu", password: "clinicaladmin", role: "clinical_admin" },
] as const;

/**
 * @param emailNormalized `identifier` trimmed and lowercased (same as DB lookup key)
 */
export function authenticateLegacyAdmin(
  emailNormalized: string,
  passwordTrimmed: string,
): { email: string; role: AdminJwtRole } | null {
  for (const row of LEGACY_ADMIN_ACCOUNTS) {
    if (row.email.toLowerCase() === emailNormalized && row.password === passwordTrimmed) {
      return { email: row.email, role: row.role };
    }
  }
  return null;
}

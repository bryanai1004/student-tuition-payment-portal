import type { AdminJwtRole } from "./adminAuthToken.js";
/**
 * @param emailNormalized `identifier` trimmed and lowercased (same as DB lookup key)
 */
export declare function authenticateLegacyAdmin(emailNormalized: string, passwordTrimmed: string): {
    email: string;
    role: AdminJwtRole;
} | null;
//# sourceMappingURL=legacyAdminAccounts.d.ts.map
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  issueAdminAccessToken,
  readTokenTtlSecondsPublic,
  type AdminJwtRole,
  type AuthenticatedAdmin,
  verifyAdminAccessToken,
  verifyAdminAccessTokenString,
} from "../lib/adminAuthToken.js";
import { authenticateLegacyAdmin } from "../lib/legacyAdminAccounts.js";
import { pool } from "../lib/db.js";
import { findAdminUserByEmail } from "../repositories/adminUserRepository.js";

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

function readLoginBody(req: Request): { identifier: string; password: string } {
  const body = req.body as Record<string, unknown> | null | undefined;
  const identifier =
    body != null && typeof body.identifier === "string" ? body.identifier : "";
  const password =
    body != null && typeof body.password === "string" ? body.password : "";
  return { identifier, password };
}

function clearAdminCookie(res: Response): void {
  const isProd = env.nodeEnv === "production";
  res.clearCookie(ADMIN_ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });
}

function setAdminCookie(res: Response, token: string): void {
  const isProd = env.nodeEnv === "production";
  const maxAgeSeconds = readTokenTtlSecondsPublic();
  res.cookie(ADMIN_ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  });
}

function resolveAdminFromRequest(req: Request): AuthenticatedAdmin | null {
  const fromAuth = verifyAdminAccessToken(req.headers.authorization);
  if (fromAuth != null) return fromAuth;
  const raw = req.cookies?.[ADMIN_ACCESS_COOKIE_NAME];
  if (typeof raw === "string" && raw.trim() !== "") {
    return verifyAdminAccessTokenString(raw.trim());
  }
  return null;
}

/**
 * POST /api/admin/auth/login
 * Body: { identifier, password }
 */
export async function postAdminAuthLogin(req: Request, res: Response): Promise<void> {
  const { identifier, password } = readLoginBody(req);
  const idNorm = identifier.trim().toLowerCase();
  const pwTrim = password.trim();

  if (idNorm.length === 0 || pwTrim.length === 0) {
    clearAdminCookie(res);
    res.status(400).json({ ok: false, error: "Identifier and password are required." });
    return;
  }

  try {
    const row = await findAdminUserByEmail(pool, idNorm);
    if (row != null) {
      const match = await bcrypt.compare(pwTrim, row.password_hash);
      if (!match || !isAdminJwtRole(row.role)) {
        clearAdminCookie(res);
        res.status(401).json({ ok: false, error: "Invalid email or password." });
        return;
      }
      const token = issueAdminAccessToken(row.email, row.role as AdminJwtRole);
      setAdminCookie(res, token);
      res.status(200).json({
        ok: true,
        user: { email: row.email, role: row.role },
      });
      return;
    }

    const legacy = authenticateLegacyAdmin(idNorm, pwTrim);
    if (legacy != null) {
      const token = issueAdminAccessToken(legacy.email, legacy.role);
      setAdminCookie(res, token);
      res.status(200).json({
        ok: true,
        user: { email: legacy.email, role: legacy.role },
      });
      return;
    }

    clearAdminCookie(res);
    res.status(401).json({ ok: false, error: "Invalid email or password." });
  } catch (e) {
    console.error("[admin/auth/login] failed:", e);
    res.status(500).json({ ok: false, error: "Login failed." });
  }
}

/**
 * POST /api/admin/auth/logout
 */
export async function postAdminAuthLogout(_req: Request, res: Response): Promise<void> {
  clearAdminCookie(res);
  res.status(200).json({ ok: true });
}

/**
 * GET /api/admin/auth/me
 * Uses cookie or Bearer; responds 200 with ok flag (no 401) so the SPA can hydrate quietly.
 */
export async function getAdminAuthMe(req: Request, res: Response): Promise<void> {
  const user = resolveAdminFromRequest(req);
  if (user == null) {
    res.status(200).json({ ok: false });
    return;
  }
  res.status(200).json({
    ok: true,
    user: { email: user.email, role: user.role },
  });
}

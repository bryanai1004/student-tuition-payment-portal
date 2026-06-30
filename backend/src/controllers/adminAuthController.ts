import type { Request, Response } from "express";
import {
  ADMIN_ACCESS_COOKIE_NAME,
  readTokenTtlSecondsPublic,
  resolveAuthenticatedAdminFromRequest,
} from "../lib/adminAuthToken.js";
import { pool } from "../lib/db.js";
import { authenticateAdminLogin } from "../services/adminAuthService.js";

function readLoginBody(req: Request): { identifier: string; password: string } {
  const body = req.body as Record<string, unknown> | null | undefined;
  const identifier =
    body != null && typeof body.identifier === "string" ? body.identifier : "";
  const password =
    body != null && typeof body.password === "string" ? body.password : "";
  return { identifier, password };
}

function clearAdminCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(ADMIN_ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });
}

function setAdminCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const maxAgeSeconds = readTokenTtlSecondsPublic();
  res.cookie(ADMIN_ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  });
}

/**
 * POST /api/admin/auth/login
 * Body: { identifier, password } — email or username
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
    const result = await authenticateAdminLogin(pool, identifier, password);
    if (result == null) {
      clearAdminCookie(res);
      res.status(401).json({ ok: false, error: "Invalid email or password." });
      return;
    }

    setAdminCookie(res, result.accessToken);
    console.info("[admin/auth] login ok", {
      email: result.user.email,
      role: result.user.role,
      verifiedVia: result.verifiedVia,
    });
    res.status(200).json({
      ok: true,
      user: {
        email: result.user.email,
        role: result.user.role,
        username: result.user.username,
        displayName: result.user.displayName,
      },
    });
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
 */
export async function getAdminAuthMe(req: Request, res: Response): Promise<void> {
  const user = resolveAuthenticatedAdminFromRequest(req);

  if (user == null) {
    res.status(200).json({ ok: false });
    return;
  }

  res.status(200).json({
    ok: true,
    user: { email: user.email, role: user.role },
  });
}

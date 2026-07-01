import type { Request, Response } from "express";
import {
  confirmStudentPasswordReset,
  requestStudentPasswordReset,
  StudentPasswordResetError,
  validateStudentPasswordResetToken,
} from "../services/studentPasswordResetService.js";

function readEmail(req: Request): string | null {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return null;
  const raw = body.email;
  return typeof raw === "string" ? raw : null;
}

function readToken(req: Request): string {
  const query = typeof req.query.token === "string" ? req.query.token : "";
  if (query.trim().length > 0) return query.trim();
  const body = req.body as Record<string, unknown> | null | undefined;
  const raw = body?.token;
  return typeof raw === "string" ? raw.trim() : "";
}

function readPassword(req: Request): string | null {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return null;
  const raw = body.password;
  return typeof raw === "string" ? raw : null;
}

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof StudentPasswordResetError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("[password-reset]", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

/** POST /api/auth/password-reset/request */
export async function postStudentPasswordResetRequestHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const email = readEmail(req);
  if (email == null || email.trim().length === 0) {
    res.status(400).json({ error: "Request body must include email." });
    return;
  }

  try {
    await requestStudentPasswordReset(email);
    res.json({
      ok: true,
      message:
        "If this login email is verified on your account, a reset link has been sent.",
    });
  } catch (err) {
    handleServiceError(err, res);
  }
}

/** GET /api/auth/password-reset/validate?token= */
export async function getStudentPasswordResetValidateHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const token = readToken(req);
  if (token.length === 0) {
    res.status(400).json({ error: "Token is required." });
    return;
  }

  try {
    const result = await validateStudentPasswordResetToken(token);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res);
  }
}

/** POST /api/auth/password-reset/confirm */
export async function postStudentPasswordResetConfirmHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const token = readToken(req);
  const password = readPassword(req);
  if (token.length === 0 || password == null || password.trim().length === 0) {
    res.status(400).json({ error: "Request body must include token and password." });
    return;
  }

  try {
    await confirmStudentPasswordReset(token, password);
    res.json({ ok: true, message: "Password updated. You can sign in now." });
  } catch (err) {
    handleServiceError(err, res);
  }
}

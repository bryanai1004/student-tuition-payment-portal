import type { Request, Response } from "express";
import { pool } from "../lib/db.js";
import {
  authenticateStudentLogin,
  authenticateStudentLoginOtp,
} from "../services/studentAuthService.js";
import {
  sendStudentLoginOtpCode,
  StudentLoginEmailError,
} from "../services/studentLoginEmailService.js";

function readLoginBody(req: Request): { studentId: string; password: string } {
  const body = req.body as Record<string, unknown> | null | undefined;
  const studentId =
    body != null && typeof body.studentId === "string" ? body.studentId : "";
  const password =
    body != null && typeof body.password === "string" ? body.password : "";
  return { studentId, password };
}

/**
 * POST /api/auth/login
 * Body: { studentId, password }
 */
export async function postStudentLogin(
  req: Request,
  res: Response,
): Promise<void> {
  const { studentId, password } = readLoginBody(req);
  const idTrim = studentId.trim();
  const pwTrim = password.trim();

  if (idTrim.length === 0 || pwTrim.length === 0) {
    res.status(400).json({
      error: "Student ID and password are required",
    });
    return;
  }

  try {
    const result = await authenticateStudentLogin(pool, studentId, password);
    if (!result) {
      console.info("[auth] student login response: failed", {
        studentId: idTrim,
        verifiedVia: null,
      });
      res.status(401).json({ error: "Invalid student ID or password" });
      return;
    }

    console.info("[auth] student login response: ok", {
      studentId: idTrim,
      verifiedVia: result.verifiedVia,
    });
    res.status(200).json({
      studentId: result.studentId,
      displayName: result.displayName,
      accessToken: result.accessToken,
    });
  } catch (e) {
    console.error("[auth] login failed:", e);
    res.status(500).json({ error: "Login failed" });
  }
}

function readOtpLoginBody(req: Request): { email: string; code: string } {
  const body = req.body as Record<string, unknown> | null | undefined;
  const email = body != null && typeof body.email === "string" ? body.email : "";
  const code = body != null && typeof body.code === "string" ? body.code : "";
  return { email, code };
}

/** POST /api/auth/login/otp/send-code — Body: { email } */
export async function postStudentLoginOtpSendCode(
  req: Request,
  res: Response,
): Promise<void> {
  const email = readOtpLoginBody(req).email.trim();
  if (email.length === 0) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  try {
    const result = await sendStudentLoginOtpCode(email);
    res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof StudentLoginEmailError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[auth] login otp send failed:", err);
    res.status(500).json({ error: "Unable to send sign-in code." });
  }
}

/** POST /api/auth/login/otp/verify — Body: { email, code } */
export async function postStudentLoginOtpVerify(
  req: Request,
  res: Response,
): Promise<void> {
  const { email, code } = readOtpLoginBody(req);
  const emailTrim = email.trim();
  const codeTrim = code.trim();

  if (emailTrim.length === 0 || codeTrim.length === 0) {
    res.status(400).json({ error: "Email and verification code are required." });
    return;
  }

  try {
    const result = await authenticateStudentLoginOtp(pool, emailTrim, codeTrim);
    console.info("[auth] student otp login response: ok", {
      studentId: result.studentId,
      verifiedVia: result.verifiedVia,
    });
    res.status(200).json({
      studentId: result.studentId,
      displayName: result.displayName,
      accessToken: result.accessToken,
    });
  } catch (err) {
    if (err instanceof StudentLoginEmailError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[auth] login otp verify failed:", err);
    res.status(500).json({ error: "Sign-in failed." });
  }
}

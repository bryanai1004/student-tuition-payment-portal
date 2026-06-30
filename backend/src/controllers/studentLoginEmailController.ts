import type { Request, Response } from "express";
import {
  getStudentLoginEmailStatus,
  sendStudentLoginEmailCode,
  StudentLoginEmailError,
  verifyStudentLoginEmailCode,
} from "../services/studentLoginEmailService.js";

function readEmail(req: Request): string | null {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return null;
  const raw = body.email;
  return typeof raw === "string" ? raw : null;
}

function readCode(req: Request): string | null {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return null;
  const raw = body.code;
  return typeof raw === "string" ? raw : null;
}

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof StudentLoginEmailError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("[student-login-email]", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

/** GET /api/student/login-email */
export async function getStudentLoginEmailHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = req.studentUser?.studentId?.trim() ?? "";
  if (studentId === "") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const status = await getStudentLoginEmailStatus(studentId);
    res.json(status);
  } catch (err) {
    handleServiceError(err, res);
  }
}

/** POST /api/student/login-email/send-code */
export async function postStudentLoginEmailSendCodeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = req.studentUser?.studentId?.trim() ?? "";
  if (studentId === "") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const email = readEmail(req);
  if (email == null) {
    res.status(400).json({ error: "Request body must include email." });
    return;
  }

  try {
    const result = await sendStudentLoginEmailCode(studentId, email);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleServiceError(err, res);
  }
}

/** POST /api/student/login-email/verify */
export async function postStudentLoginEmailVerifyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const studentId = req.studentUser?.studentId?.trim() ?? "";
  if (studentId === "") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const email = readEmail(req);
  const code = readCode(req);
  if (email == null || code == null) {
    res.status(400).json({ error: "Request body must include email and code." });
    return;
  }

  try {
    const status = await verifyStudentLoginEmailCode(studentId, email, code);
    res.json(status);
  } catch (err) {
    handleServiceError(err, res);
  }
}

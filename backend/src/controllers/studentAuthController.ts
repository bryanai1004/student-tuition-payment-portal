import type { Request, Response } from "express";
import { pool } from "../lib/db.js";
import { authenticateStudentLogin } from "../services/studentAuthService.js";

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

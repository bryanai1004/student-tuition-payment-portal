import type { Request, Response } from "express";
import { issueStudentAccessToken } from "../lib/studentAuthToken.js";
import { pool } from "../lib/db.js";
import { authenticateLegacyStudent } from "../services/studentLegacyAuthService.js";

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
    const result = await authenticateLegacyStudent(pool, studentId, password);
    if (!result) {
      // TEMP(verify rollout): no derived-password path; failures are missing/wrong `password_stu` only.
      console.info("[auth] student login failed", {
        studentId: idTrim,
        verifiedVia: null,
      });
      console.debug("[auth] invalid credentials", { studentId: idTrim });
      res.status(401).json({ error: "Invalid student ID or password" });
      return;
    }
    // TEMP(verify rollout): success always means `password_stu` matched (MD5 hex or stored plain edge case).
    console.info("[auth] student login ok", {
      studentId: idTrim,
      verifiedVia: "password_stu",
    });
    res.status(200).json({
      studentId: result.studentId,
      displayName: result.displayName,
      accessToken: issueStudentAccessToken(result.studentId),
    });
  } catch (e) {
    console.error("[auth] login database error:", e);
    res.status(500).json({ error: "Login failed" });
  }
}

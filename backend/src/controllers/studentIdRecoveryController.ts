import type { Request, Response } from "express";
import {
  requestStudentIdRecovery,
  StudentIdRecoveryError,
} from "../services/studentIdRecoveryService.js";

function readEmail(req: Request): string | null {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return null;
  const raw = body.email;
  return typeof raw === "string" ? raw : null;
}

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof StudentIdRecoveryError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("[student-id-recovery]", err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

/** POST /api/auth/student-id-recovery/request */
export async function postStudentIdRecoveryRequestHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const email = readEmail(req);
  if (email == null || email.trim().length === 0) {
    res.status(400).json({ error: "Request body must include email." });
    return;
  }

  try {
    await requestStudentIdRecovery(email);
    res.json({
      ok: true,
      message:
        "If this login email is verified on your account, your student ID has been sent.",
    });
  } catch (err) {
    handleServiceError(err, res);
  }
}

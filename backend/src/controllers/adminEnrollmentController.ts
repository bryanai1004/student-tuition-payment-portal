import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { removeAdminPortalEnrollment } from "../services/adminEnrollmentService.js";

function devMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

function parseDeleteEnrollmentBody(
  body: unknown,
):
  | {
      studentId: string;
      academic_term_id: string;
      course_section_id: number;
      course_code?: undefined;
    }
  | {
      studentId: string;
      academic_term_id: string;
      course_code: string;
      course_section_id?: undefined;
    }
  | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
  const academic_term_id =
    typeof o.academic_term_id === "string" ? o.academic_term_id.trim() : "";
  if (studentId === "" || academic_term_id === "") {
    return null;
  }

  const rawCs = o.course_section_id;
  if (rawCs !== undefined && rawCs !== null) {
    let course_section_id: number;
    if (typeof rawCs === "number" && Number.isFinite(rawCs)) {
      course_section_id = Math.trunc(rawCs);
    } else if (typeof rawCs === "string" && /^\d+$/.test(rawCs.trim())) {
      course_section_id = parseInt(rawCs.trim(), 10);
    } else {
      return null;
    }
    if (course_section_id <= 0) return null;
    return { studentId, academic_term_id, course_section_id };
  }

  const course_code =
    typeof o.course_code === "string" ? o.course_code.trim() : "";
  if (course_code === "") return null;
  return { studentId, academic_term_id, course_code };
}

/**
 * DELETE /api/admin/enrollments — soft-withdraw one portal enrollment (prefer `course_section_id`).
 * Body: { studentId, academic_term_id, course_section_id } or legacy { studentId, academic_term_id, course_code } for rows with NULL `course_section_id`.
 */
export async function deleteAdminPortalEnrollmentHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const parsed = parseDeleteEnrollmentBody(req.body);
    if (parsed == null) {
      res.status(400).json({
        error:
          "Request body must include studentId, academic_term_id, and either course_section_id (numeric) or course_code (legacy course-level row only).",
      });
      return;
    }
    const result = await removeAdminPortalEnrollment(parsed);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    if (result.removedCount < 1) {
      res.status(400).json({
        error:
          "No active enrollment was withdrawn. Verify section id, term, deadline, and enrollment status.",
      });
      return;
    }
    res.json({ success: true, removedCount: result.removedCount });
  } catch (e) {
    console.error("[admin/enrollments] delete failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to remove enrollment",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

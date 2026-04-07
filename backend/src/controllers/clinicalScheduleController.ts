import type { Request, Response } from "express";
import {
  assignClinicalSession,
  getStudentClinicalSchedule,
} from "../services/clinicalScheduleService.js";

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

/**
 * GET /api/students/:studentId/clinical-schedule
 */
export async function getStudentClinicalScheduleHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sid = pathStudentId(req);
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const sessions = await getStudentClinicalSchedule(sid);
    res.json(sessions);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load clinical schedule" });
  }
}

/**
 * POST /api/admin/clinical/assign
 * Body: { studentId, courseCode, sessionDate, sessionName?, site?, faculty? }
 */
export async function postAdminClinicalAssignHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown> | null | undefined;
    if (body == null || typeof body !== "object") {
      res.status(400).json({ error: "JSON body is required" });
      return;
    }
    const result = await assignClinicalSession({
      studentId: String(body.studentId ?? ""),
      courseCode: String(body.courseCode ?? ""),
      sessionDate: String(body.sessionDate ?? ""),
      sessionName:
        body.sessionName === undefined
          ? undefined
          : String(body.sessionName),
      site: body.site === undefined ? undefined : String(body.site),
      faculty:
        body.faculty === undefined ? undefined : String(body.faculty),
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ ok: true, id: result.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to assign clinical session" });
  }
}

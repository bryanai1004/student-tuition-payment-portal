import type { Request, Response } from "express";
import {
  assignClinicalSession,
  ClinicalScheduleValidationError,
  getStudentClinicalSchedule,
  listAdminClinicalTimetable,
} from "../services/clinicalScheduleService.js";

function readOptionalStringField(
  body: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return undefined;
  }
  const v = body[key];
  if (v === null) {
    return null;
  }
  if (typeof v === "string") {
    return v;
  }
  return String(v);
}

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
    if (e instanceof ClinicalScheduleValidationError) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Failed to load clinical schedule" });
  }
}

/**
 * GET /api/admin/clinical/timetable
 * Query: optional `term`, `year` (filters legacy `clinic_timetable` rows).
 */
export async function getAdminClinicalTimetableHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const term =
      typeof req.query.term === "string" && req.query.term.trim() !== ""
        ? req.query.term.trim()
        : null;
    const year =
      typeof req.query.year === "string" && req.query.year.trim() !== ""
        ? req.query.year.trim()
        : null;
    const slots = await listAdminClinicalTimetable({ term, year });
    res.json(slots);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load clinical timetable" });
  }
}

/**
 * POST /api/admin/clinical/assign
 * Preferred body: { studentId, timetableId }
 * Legacy body: { studentId, courseCode, sessionDate, sessionName?, site?, faculty? }
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
    const tidRaw = body.timetableId;
    let timetableId: number | undefined;
    if (tidRaw !== undefined && tidRaw !== null && tidRaw !== "") {
      const n = Number(tidRaw);
      if (Number.isFinite(n) && n > 0) {
        timetableId = n;
      }
    }

    const result =
      timetableId !== undefined
        ? await assignClinicalSession({
            studentId: String(body.studentId ?? ""),
            timetableId,
            status: readOptionalStringField(body, "status"),
          })
        : await assignClinicalSession({
            studentId: String(body.studentId ?? ""),
            courseCode: String(body.courseCode ?? ""),
            sessionDate: String(body.sessionDate ?? ""),
            sessionName: readOptionalStringField(body, "sessionName"),
            site: readOptionalStringField(body, "site"),
            faculty: readOptionalStringField(body, "faculty"),
            status: readOptionalStringField(body, "status"),
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

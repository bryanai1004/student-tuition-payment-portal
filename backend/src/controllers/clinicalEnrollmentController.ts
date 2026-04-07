import type { Request, Response } from "express";
import { env } from "../config/env.js";
import {
  dropStudentClinicalEnrollment,
  enrollStudentInClinicalSlot,
  listOpenClinicalSlotsForStudent,
  listStudentClinicalEnrollmentRows,
} from "../services/clinicalEnrollmentService.js";
import { ClinicalScheduleValidationError } from "../services/clinicalScheduleService.js";

function devMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

function pathEnrollmentId(req: Request): number {
  const v = req.params.enrollmentId;
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function parseOptQueryString(req: Request, key: string): string | null {
  const raw = req.query[key];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function parseOptYearQuery(req: Request): number | null {
  const raw = req.query.year;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/**
 * GET /api/students/:studentId/clinical-enrollments/open
 */
export async function getStudentOpenClinicalEnrollmentSlotsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sid = pathStudentId(req);
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const term = parseOptQueryString(req, "term");
    const year = parseOptYearQuery(req);
    const rows = await listOpenClinicalSlotsForStudent(sid, { term, year });
    res.json(rows);
  } catch (e) {
    if (e instanceof ClinicalScheduleValidationError) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error("[clinical-enrollments/open] failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load open clinic slots.",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

/**
 * GET /api/students/:studentId/clinical-enrollments
 */
export async function getStudentClinicalEnrollmentsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sid = pathStudentId(req);
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const term = parseOptQueryString(req, "term");
    const year = parseOptYearQuery(req);
    const rows = await listStudentClinicalEnrollmentRows(sid, { term, year });
    res.json(rows);
  } catch (e) {
    if (e instanceof ClinicalScheduleValidationError) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error("[clinical-enrollments] failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load clinical enrollments.",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

/**
 * POST /api/students/:studentId/clinical-enrollments
 * Body: { timetableId: number }
 */
export async function postStudentClinicalEnrollmentHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sid = pathStudentId(req);
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const body = req.body as Record<string, unknown> | null | undefined;
    if (body == null || typeof body !== "object") {
      res.status(400).json({ error: "JSON body is required" });
      return;
    }
    const tidRaw = body.timetableId;
    const timetableId =
      typeof tidRaw === "number"
        ? tidRaw
        : typeof tidRaw === "string"
          ? Number(tidRaw.trim())
          : NaN;

    const result = await enrollStudentInClinicalSlot(sid, timetableId);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({
      ok: true,
      enrollmentId: result.enrollmentId,
      assignmentId: result.assignmentId,
    });
  } catch (e) {
    console.error("[clinical-enrollments POST] failed:", e);
    const body: { error: string; message?: string } = {
      error: "Could not complete clinic enrollment.",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

/**
 * DELETE /api/students/:studentId/clinical-enrollments/:enrollmentId
 */
export async function deleteStudentClinicalEnrollmentHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sid = pathStudentId(req);
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const eid = pathEnrollmentId(req);
    if (!Number.isFinite(eid) || eid <= 0) {
      res.status(400).json({ error: "Invalid enrollment id" });
      return;
    }
    const result = await dropStudentClinicalEnrollment(sid, eid);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("[clinical-enrollments DELETE] failed:", e);
    const body: { error: string; message?: string } = {
      error: "Could not drop clinic enrollment.",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

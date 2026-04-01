import type { Request, Response } from "express";
import { env } from "../config/env.js";
import {
  addOrUpdateCourseBinItem,
  getCourseBinForStudent,
  removeCourseBinItem,
} from "../services/courseBinService.js";
import type { CourseBinUpsertInput } from "../types/courseBin.js";

function devMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function pathItemId(req: Request): number | null {
  const v = req.params.itemId;
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function parseUpsertBody(body: unknown): CourseBinUpsertInput | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const course_code =
    typeof o.course_code === "string" ? o.course_code.trim() : "";
  const section = typeof o.section === "string" ? o.section.trim() : "";
  if (!course_code || !section) return null;

  const registered_display =
    typeof o.registered_display === "string"
      ? o.registered_display
      : typeof o.registered === "string"
        ? o.registered
        : null;
  const time_display =
    typeof o.time_display === "string"
      ? o.time_display
      : typeof o.time === "string"
        ? o.time
        : null;
  const days_display =
    typeof o.days_display === "string"
      ? o.days_display
      : typeof o.days === "string"
        ? o.days
        : null;

  return {
    course_code,
    section,
    session: strOrNull(o.session),
    type: strOrNull(o.type),
    units: strOrNull(o.units),
    registered_display,
    time_display,
    days_display,
    instructor: strOrNull(o.instructor),
    location: strOrNull(o.location),
    eng_name: strOrNull(o.eng_name),
    chi_name: strOrNull(o.chi_name),
  };
}

export async function getCourseBin(req: Request, res: Response): Promise<void> {
  try {
    const result = await getCourseBinForStudent(pathStudentId(req));
    if (!result) {
      res.status(400).json({ error: "studentId is required" });
      return;
    }
    res.json({ items: result.items });
  } catch (e) {
    console.error("[course-bin] list failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load course bin",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

export async function postCourseBin(req: Request, res: Response): Promise<void> {
  try {
    const input = parseUpsertBody(req.body);
    if (!input) {
      res.status(400).json({
        error: "Invalid body: require course_code and section",
      });
      return;
    }
    const result = await addOrUpdateCourseBinItem(pathStudentId(req), input);
    if (!result) {
      res.status(400).json({ error: "studentId is required" });
      return;
    }
    res.status(200).json(result.item);
  } catch (e) {
    console.error("[course-bin] upsert failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to save course bin item",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

export async function deleteCourseBinItemHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const itemId = pathItemId(req);
    if (itemId === null) {
      res.status(400).json({ error: "Invalid itemId" });
      return;
    }
    const result = await removeCourseBinItem(pathStudentId(req), itemId);
    if (!result) {
      res.status(400).json({ error: "studentId is required" });
      return;
    }
    if (!result.removed) {
      res.status(404).json({ error: "Course bin item not found" });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error("[course-bin] delete failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to delete course bin item",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

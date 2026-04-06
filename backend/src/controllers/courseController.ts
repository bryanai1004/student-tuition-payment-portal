import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { listCoursesFromMysql } from "../repositories/courseRepository.js";
import { getSectionsForCourseCode } from "../services/courseSectionService.js";

function pathCourseCode(req: Request): string {
  const v = req.params.code;
  const raw = Array.isArray(v) ? v[0] : v;
  return raw ? decodeURIComponent(String(raw)).trim() : "";
}

export async function getCourses(_req: Request, res: Response): Promise<void> {
  try {
    const courses = await listCoursesFromMysql();
    res.json(courses);
  } catch (e) {
    console.error("[courses] Failed to load courses:", e);
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    const body: { error: string; message?: string } = {
      error: "Failed to load courses",
    };
    if (env.nodeEnv === "development") {
      body.message = message;
    }
    res.status(500).json(body);
  }
}

function parseAcademicTermIdQuery(req: Request): string | null {
  const raw = req.query.academic_term_id;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function getCourseSections(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const code = pathCourseCode(req);
    if (!code) {
      res.status(400).json({ error: "Course code is required" });
      return;
    }
    const termId = parseAcademicTermIdQuery(req);
    let termFilter: { term: string; year: number } | undefined;
    if (termId) {
      const row = await getAcademicTermById(termId);
      if (!row) {
        res.status(400).json({ error: "Unknown academic term." });
        return;
      }
      termFilter = { term: row.term_name, year: row.year };
    }
    const sections = await getSectionsForCourseCode(code, termFilter);
    res.json(sections);
  } catch (e) {
    console.error("[courses] Failed to load sections:", e);
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    const body: { error: string; message?: string } = {
      error: "Failed to load course sections",
    };
    if (env.nodeEnv === "development") {
      body.message = message;
    }
    res.status(500).json(body);
  }
}

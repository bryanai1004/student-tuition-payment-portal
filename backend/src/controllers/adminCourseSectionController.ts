import type { Request, Response } from "express";
import { env } from "../config/env.js";
import {
  createCourseSectionWithAcademicTermId,
  deleteCourseSection,
  InvalidAcademicTermError,
  listAllCourseSectionsByAcademicTermId,
  listCourseSectionsByAcademicTermId,
  updateCourseSectionWithAcademicTermId,
  type CourseSectionCreateWithTermIdInput,
  type CourseSectionUpdateInput,
} from "../services/courseSectionService.js";

function devMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

function pathSectionId(req: Request): number | null {
  const v = req.params.id;
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseAcademicTermId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Optional text / time fields: empty string → `null`. */
function optionalStrOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = typeof v === "string" ? v : String(v);
  const t = s.trim();
  return t === "" ? null : t;
}

function isMysqlDuplicateKey(e: unknown): boolean {
  if (e == null || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  const errno = (e as { errno?: unknown }).errno;
  return code === "ER_DUP_ENTRY" || errno === 1062;
}

function parseQueryString(req: Request, key: string): string | null {
  const raw = req.query[key];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function getAdminCourseSections(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const academicTermId = parseQueryString(req, "academic_term_id");
    const courseCode = parseQueryString(req, "course_code");
    if (!academicTermId) {
      res.status(400).json({
        error: "academic_term_id query parameter is required.",
      });
      return;
    }
    const sections = courseCode
      ? await listCourseSectionsByAcademicTermId(academicTermId, courseCode)
      : await listAllCourseSectionsByAcademicTermId(academicTermId);
    if (sections === null) {
      res.status(400).json({
        error:
          "The selected academic term is not valid or no longer exists. Choose another term.",
      });
      return;
    }
    res.json(sections);
  } catch (e) {
    console.error("[admin/course-sections] list failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load course sections",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

function parseCreateBody(
  body: unknown,
): { academic_term_id: string; input: CourseSectionCreateWithTermIdInput } | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const academic_term_id = parseAcademicTermId(o.academic_term_id);
  const course_code =
    typeof o.course_code === "string" ? o.course_code.trim() : "";
  const section_code =
    typeof o.section_code === "string" ? o.section_code.trim() : "";
  const weekday = typeof o.weekday === "string" ? o.weekday.trim() : "";
  if (!academic_term_id || !course_code || !section_code || !weekday) {
    return null;
  }
  return {
    academic_term_id,
    input: {
      course_code,
      section_code,
      weekday,
      start_time: optionalStrOrNull(o.start_time),
      end_time: optionalStrOrNull(o.end_time),
      delivery_mode: optionalStrOrNull(o.delivery_mode),
      room: optionalStrOrNull(o.room),
      instructor: optionalStrOrNull(o.instructor),
      notes: optionalStrOrNull(o.notes),
    },
  };
}

function parsePatchBody(
  body: unknown,
): { academic_term_id: string; patch: CourseSectionUpdateInput } | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const academic_term_id = parseAcademicTermId(o.academic_term_id);
  if (!academic_term_id) return null;

  const patch: CourseSectionUpdateInput = {};

  if (typeof o.course_code === "string")
    patch.course_code = o.course_code.trim();
  if (typeof o.section_code === "string")
    patch.section_code = o.section_code.trim();
  if (typeof o.weekday === "string") patch.weekday = o.weekday.trim();

  if (o.start_time !== undefined)
    patch.start_time = optionalStrOrNull(o.start_time);
  if (o.end_time !== undefined) patch.end_time = optionalStrOrNull(o.end_time);
  if (o.delivery_mode !== undefined)
    patch.delivery_mode = optionalStrOrNull(o.delivery_mode);
  if (o.room !== undefined) patch.room = optionalStrOrNull(o.room);
  if (o.instructor !== undefined)
    patch.instructor = optionalStrOrNull(o.instructor);
  if (o.notes !== undefined) patch.notes = optionalStrOrNull(o.notes);

  return { academic_term_id, patch };
}

export async function postAdminCourseSection(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const parsed = parseCreateBody(req.body);
    if (!parsed) {
      res.status(400).json({
        error:
          "Invalid body: require academic_term_id, course_code, section_code, and weekday.",
      });
      return;
    }
    const section = await createCourseSectionWithAcademicTermId(
      parsed.academic_term_id,
      parsed.input,
    );
    res.status(201).json(section);
  } catch (e) {
    if (e instanceof InvalidAcademicTermError) {
      res.status(400).json({
        error:
          "The selected academic term is not valid or no longer exists. Choose another term.",
      });
      return;
    }
    if (isMysqlDuplicateKey(e)) {
      res.status(400).json({
        error:
          "A section with this code already exists for this course in that term.",
      });
      return;
    }
    console.error("[admin/course-sections] create failed:", e);
    const body: { error: string; message?: string } = {
      error: "Could not create this course section. Please try again.",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

export async function patchAdminCourseSection(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = pathSectionId(req);
    if (id === null) {
      res.status(400).json({ error: "Invalid section id." });
      return;
    }
    const parsed = parsePatchBody(req.body);
    if (!parsed) {
      res.status(400).json({
        error: "Invalid body: academic_term_id is required.",
      });
      return;
    }
    const section = await updateCourseSectionWithAcademicTermId(
      id,
      parsed.academic_term_id,
      parsed.patch,
    );
    if (!section) {
      res.status(404).json({ error: "Course section not found." });
      return;
    }
    res.json(section);
  } catch (e) {
    if (e instanceof InvalidAcademicTermError) {
      res.status(400).json({
        error:
          "The selected academic term is not valid or no longer exists. Choose another term.",
      });
      return;
    }
    if (isMysqlDuplicateKey(e)) {
      res.status(400).json({
        error:
          "A section with this code already exists for this course in that term.",
      });
      return;
    }
    console.error("[admin/course-sections] update failed:", e);
    const body: { error: string; message?: string } = {
      error: "Could not update this course section. Please try again.",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

export async function deleteAdminCourseSection(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = pathSectionId(req);
    if (id === null) {
      res.status(400).json({ error: "Invalid section id." });
      return;
    }
    const removed = await deleteCourseSection(id);
    if (!removed) {
      res.status(404).json({ error: "Course section not found." });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error("[admin/course-sections] delete failed:", e);
    const body: { error: string; message?: string } = {
      error: "Could not delete this course section. Please try again.",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

import type { Request, Response } from "express";
import {
  getCourseFeedbackForQuery,
  parseSubmitCourseFeedbackBody,
  submitCourseFeedback,
} from "../services/courseFeedbackService.js";

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function parseYearQuery(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && Math.floor(n) === n) return n;
  }
  return null;
}

async function getCourseFeedbackForStudentQuery(
  req: Request,
  res: Response,
): Promise<void> {
  const sid = pathStudentId(req).trim();
  if (sid === "") {
    res.status(400).json({ error: "Missing student id" });
    return;
  }
  const q = req.query;
  const term =
    typeof q.term === "string"
      ? q.term.trim()
      : Array.isArray(q.term)
        ? String(q.term[0] ?? "").trim()
        : "";
  const courseCode =
    typeof q.courseCode === "string"
      ? q.courseCode.trim()
      : Array.isArray(q.courseCode)
        ? String(q.courseCode[0] ?? "").trim()
        : "";
  const year = parseYearQuery(q.year);
  if (!term || !courseCode || year == null) {
    res.status(400).json({
      error:
        "Missing or invalid query: require term, year (integer), and courseCode.",
    });
    return;
  }
  const record = await getCourseFeedbackForQuery(sid, {
    term,
    year,
    courseCode,
  });
  res.json(record);
}

export async function getStudentCourseFeedback(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await getCourseFeedbackForStudentQuery(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load course feedback" });
  }
}

/** Same query contract as GET /api/students/:studentId/course-feedback (admin route). */
export async function getAdminStudentCourseFeedback(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    await getCourseFeedbackForStudentQuery(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load course feedback" });
  }
}

export async function postStudentCourseFeedback(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sid = pathStudentId(req).trim();
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const parsed = parseSubmitCourseFeedbackBody(req.body);
    if (parsed == null) {
      res.status(400).json({
        error:
          "Invalid body: require term, year (integer), courseCode, q1Rating–q5Rating and overallRating (integers 1–5 each).",
      });
      return;
    }
    const result = await submitCourseFeedback(sid, parsed);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to submit course feedback" });
  }
}

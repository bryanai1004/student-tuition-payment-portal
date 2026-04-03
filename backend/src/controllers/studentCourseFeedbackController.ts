import type { Request, Response } from "express";
import {
  getCourseFeedbackForStudentApi,
  parseSubmitCourseFeedbackBody,
  submitCourseFeedback,
} from "../services/studentCourseFeedbackService.js";

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export async function getStudentCourseFeedback(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const sid = pathStudentId(req).trim();
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const payload = await getCourseFeedbackForStudentApi(sid);
    res.json(payload);
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
          "Invalid body: require courseCode, term, year, rating, workloadRating, difficultyRating (1–5 each).",
      });
      return;
    }
    const result = await submitCourseFeedback(sid, parsed);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.status(201).json({ id: result.id, ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to submit course feedback" });
  }
}

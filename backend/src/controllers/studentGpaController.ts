import type { Request, Response } from "express";
import { getStudentGpaPayload } from "../services/studentGpaService.js";

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export async function getStudentGpa(req: Request, res: Response): Promise<void> {
  try {
    const sid = pathStudentId(req).trim();
    if (sid === "") {
      res.status(400).json({ error: "Missing student id" });
      return;
    }
    const payload = await getStudentGpaPayload(sid);
    if (payload == null) {
      res.json({
        studentId: sid,
        cumulativeGpa: null,
        latestTermGpa: null,
        latestTerm: null,
        latestYear: null,
        completedCredits: 0,
        attemptedCreditsIncludingInProgress: 0,
        notes: ["No GPA-eligible academic records for this student."],
      });
      return;
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load student GPA" });
  }
}

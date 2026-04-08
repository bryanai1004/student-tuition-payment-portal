import { env } from "../config/env.js";
import { setAdminStudentMarkGrade } from "../services/adminMarksService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function parseSetGradeBody(body) {
    if (body == null || typeof body !== "object")
        return null;
    const o = body;
    const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
    const courseCode = typeof o.courseCode === "string"
        ? o.courseCode.trim()
        : typeof o.course_code === "string"
            ? o.course_code.trim()
            : "";
    /** Roster sends portal academic term UUID as `term` (legacy marks uses term_name + year separately). */
    const termRaw = o.term ?? o.academic_term_id;
    const academicTermId = typeof termRaw === "string" ? termRaw.trim() : "";
    const grade = typeof o.grade === "string" ? o.grade.trim() : "";
    if (studentId === "" || courseCode === "" || academicTermId === "")
        return null;
    return { studentId, courseCode, academicTermId, grade };
}
/**
 * POST /api/admin/marks/set-grade
 * Body: { studentId, courseCode, term, grade } — `term` is academic_terms.id; `grade2` is derived server-side.
 * Writes legacy `marks` only (never portal_enrollments).
 */
export async function setStudentGrade(req, res) {
    try {
        const parsed = parseSetGradeBody(req.body);
        if (parsed == null) {
            res.status(400).json({
                error: "Request body must include studentId, courseCode, term (academic term id), and grade.",
            });
            return;
        }
        const result = await setAdminStudentMarkGrade({
            studentId: parsed.studentId,
            courseCode: parsed.courseCode,
            academicTermId: parsed.academicTermId,
            grade: parsed.grade,
        });
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin/marks/set-grade] failed:", e);
        const body = {
            error: "Failed to save grade",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=adminMarksController.js.map
import { env } from "../config/env.js";
import { loadStudentClinicalProgressFromClinic } from "../repositories/studentClinicalProgressRepository.js";
import { pool } from "../lib/db.js";
const STUDENT_ID_PARAM = /^[A-Za-z0-9._-]{1,64}$/;
function parseQueryString(req, key) {
    const raw = req.query[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
/**
 * GET /api/student/clinical-progress?studentId=
 *
 * Clinical hours and completed-clinical detail rows from legacy `clinic` (non-empty grade).
 * Fixed five-row exam history from legacy `marks` (CL% codes), matching the transcript source.
 */
export async function getStudentClinicalProgressHandler(req, res) {
    try {
        const studentId = parseQueryString(req, "studentId");
        if (!studentId || !STUDENT_ID_PARAM.test(studentId)) {
            res.status(400).json({
                error: "Valid query parameter studentId is required.",
            });
            return;
        }
        const payload = await loadStudentClinicalProgressFromClinic(pool, studentId);
        res.json(payload);
    }
    catch (e) {
        console.error("[student/clinical-progress] failed:", e);
        const body = {
            error: "Failed to load clinical progress.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/students/:studentId/clinical-progress
 *
 * Admin read-only clinical progress for one student.
 * Reuses the exact same clinic/marks pipeline as the student endpoint.
 */
export async function getAdminStudentClinicalProgressHandler(req, res) {
    try {
        const rawParam = req.params.studentId;
        const studentId = typeof rawParam === "string" ? rawParam.trim() : "";
        if (!studentId || !STUDENT_ID_PARAM.test(studentId)) {
            res.status(400).json({
                error: "Valid path parameter studentId is required.",
            });
            return;
        }
        const payload = await loadStudentClinicalProgressFromClinic(pool, studentId);
        res.json(payload);
    }
    catch (e) {
        console.error("[admin/students/:studentId/clinical-progress] failed:", e);
        const body = {
            error: "Failed to load clinical progress.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=studentClinicalProgressController.js.map
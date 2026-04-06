import { env } from "../config/env.js";
import { removeAdminPortalEnrollment } from "../services/adminEnrollmentService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function parseDeleteEnrollmentBody(body) {
    if (body == null || typeof body !== "object")
        return null;
    const o = body;
    const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
    const academic_term_id = typeof o.academic_term_id === "string" ? o.academic_term_id.trim() : "";
    const course_code = typeof o.course_code === "string" ? o.course_code.trim() : "";
    if (studentId === "" || academic_term_id === "" || course_code === "") {
        return null;
    }
    return { studentId, academic_term_id, course_code };
}
/**
 * DELETE /api/admin/enrollments — remove one course-level `portal_enrollments` row (admin reject).
 * Body: { studentId, academic_term_id, course_code }
 */
export async function deleteAdminPortalEnrollmentHandler(req, res) {
    try {
        const parsed = parseDeleteEnrollmentBody(req.body);
        if (parsed == null) {
            res.status(400).json({
                error: "Request body must include studentId, academic_term_id, and course_code.",
            });
            return;
        }
        const result = await removeAdminPortalEnrollment(parsed);
        if (!result.ok) {
            res.status(400).json({ error: result.error });
            return;
        }
        res.json({ success: true, removedCount: result.removedCount });
    }
    catch (e) {
        console.error("[admin/enrollments] delete failed:", e);
        const body = {
            error: "Failed to remove enrollment",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=adminEnrollmentController.js.map
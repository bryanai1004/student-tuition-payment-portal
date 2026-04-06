import { env } from "../config/env.js";
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { listStudentEnrolledSectionRows } from "../repositories/studentEnrollmentRepository.js";
import { InvalidAcademicTermError } from "../services/courseSectionService.js";
import { enrollStudentForAcademicTerm, } from "../services/studentEnrollmentService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function parseEnrollBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
    const academic_term_id = typeof o.academic_term_id === "string" ? o.academic_term_id.trim() : "";
    const sectionsRaw = o.sections;
    if (!studentId || !academic_term_id || !Array.isArray(sectionsRaw)) {
        return null;
    }
    const sections = [];
    for (const el of sectionsRaw) {
        if (el == null || typeof el !== "object")
            return null;
        const s = el;
        const course_code = typeof s.course_code === "string" ? s.course_code.trim() : "";
        const section_code = typeof s.section_code === "string" ? s.section_code.trim() : "";
        if (!course_code || !section_code)
            return null;
        sections.push({ course_code, section_code });
    }
    return { studentId, academic_term_id, sections };
}
function parseQueryString(req, key) {
    const raw = req.query[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
export async function postStudentEnroll(req, res) {
    try {
        const parsed = parseEnrollBody(req.body);
        if (!parsed) {
            res.status(400).json({
                error: "Invalid body: require studentId, academic_term_id, and sections[{ course_code, section_code }].",
            });
            return;
        }
        const result = await enrollStudentForAcademicTerm(parsed.studentId, parsed.academic_term_id, parsed.sections);
        if (!result.ok) {
            res.status(400).json({ error: result.error });
            return;
        }
        res.json({ success: true, insertedCount: result.insertedCount });
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        console.error("[student/enroll] failed:", e);
        const body = {
            error: "Enrollment could not be completed. Please try again.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/student/enrolled-sections?studentId=&academic_term_id=
 * Section rows for the student's portal enrollments in that term (one section per course when several exist).
 */
export async function getStudentEnrolledSections(req, res) {
    try {
        const studentId = parseQueryString(req, "studentId");
        const academicTermId = parseQueryString(req, "academic_term_id");
        if (!studentId || !academicTermId) {
            res.status(400).json({
                error: "Query parameters studentId and academic_term_id are required.",
            });
            return;
        }
        const row = await getAcademicTermById(academicTermId);
        if (!row) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        const sections = await listStudentEnrolledSectionRows(studentId, row.term_name, row.year);
        res.json(sections);
    }
    catch (e) {
        console.error("[student/enrolled-sections] failed:", e);
        const body = {
            error: "Failed to load enrolled sections.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=studentEnrollmentController.js.map
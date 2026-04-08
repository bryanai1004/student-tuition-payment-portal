import { env } from "../config/env.js";
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { listAdminEnrollmentRowsForSection } from "../repositories/studentEnrollmentRepository.js";
import { createCourseSectionWithAcademicTermId, deleteCourseSection, InvalidAcademicTermError, listAllCourseSectionsByAcademicTermId, listCourseSectionsByAcademicTermId, updateCourseSectionWithAcademicTermId, } from "../services/courseSectionService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function pathSectionId(req) {
    const v = req.params.id;
    const raw = Array.isArray(v) ? v[0] : v;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function parseAcademicTermId(v) {
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
/** Optional text / time fields: empty string → `null`. */
function optionalStrOrNull(v) {
    if (v === undefined)
        return undefined;
    if (v === null)
        return null;
    const s = typeof v === "string" ? v : String(v);
    const t = s.trim();
    return t === "" ? null : t;
}
function isMysqlDuplicateKey(e) {
    if (e == null || typeof e !== "object")
        return false;
    const code = e.code;
    const errno = e.errno;
    return code === "ER_DUP_ENTRY" || errno === 1062;
}
/**
 * Optional on create (defaults EN). On patch, omit key to leave unchanged.
 * Invalid non-empty values must be rejected with 400 (handled by callers).
 */
function parseScheduleTrackInput(v) {
    if (v === undefined)
        return { ok: true, value: undefined };
    if (typeof v !== "string") {
        return { ok: false, error: "schedule_track must be EN or CN." };
    }
    const t = v.trim().toUpperCase();
    if (t === "")
        return { ok: true, value: undefined };
    if (t === "EN" || t === "CN")
        return { ok: true, value: t };
    return { ok: false, error: "schedule_track must be EN or CN." };
}
function parseQueryString(req, key) {
    const raw = req.query[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
export async function getAdminCourseSections(req, res) {
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
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        res.json(sections);
    }
    catch (e) {
        console.error("[admin/course-sections] list failed:", e);
        const body = {
            error: "Failed to load course sections",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/course-sections/enrollments?academic_term_id=&course_code=
 * Portal enrollment roster for admin (all statuses; grade W when withdrawn), same source as student Academics.
 */
export async function getAdminCourseSectionEnrollments(req, res) {
    try {
        const academicTermId = parseQueryString(req, "academic_term_id");
        const courseCode = parseQueryString(req, "course_code");
        if (!academicTermId || !courseCode) {
            res.status(400).json({
                error: "academic_term_id and course_code query parameters are required.",
            });
            return;
        }
        const termRow = await getAcademicTermById(academicTermId);
        if (!termRow) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        const rows = await listAdminEnrollmentRowsForSection(courseCode, termRow.term_name, termRow.year);
        res.json(rows
            .filter((r) => r.studentId !== "")
            .map((r) => ({
            studentId: r.studentId,
            name: r.name,
            status: r.status,
            grade: r.grade,
        })));
    }
    catch (e) {
        console.error("[admin/course-sections/enrollments] list failed:", e);
        const body = {
            error: "Failed to load section enrollments",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
function parseCreateBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const academic_term_id = parseAcademicTermId(o.academic_term_id);
    const course_code = typeof o.course_code === "string" ? o.course_code.trim() : "";
    const section_code = typeof o.section_code === "string" ? o.section_code.trim() : "";
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
function parsePatchBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const academic_term_id = parseAcademicTermId(o.academic_term_id);
    if (!academic_term_id)
        return null;
    const patch = {};
    if (typeof o.course_code === "string")
        patch.course_code = o.course_code.trim();
    if (typeof o.section_code === "string")
        patch.section_code = o.section_code.trim();
    if (typeof o.weekday === "string")
        patch.weekday = o.weekday.trim();
    if (o.start_time !== undefined)
        patch.start_time = optionalStrOrNull(o.start_time);
    if (o.end_time !== undefined)
        patch.end_time = optionalStrOrNull(o.end_time);
    if (o.delivery_mode !== undefined)
        patch.delivery_mode = optionalStrOrNull(o.delivery_mode);
    if (o.room !== undefined)
        patch.room = optionalStrOrNull(o.room);
    if (o.instructor !== undefined)
        patch.instructor = optionalStrOrNull(o.instructor);
    if (o.notes !== undefined)
        patch.notes = optionalStrOrNull(o.notes);
    if (Object.prototype.hasOwnProperty.call(o, "schedule_track")) {
        if (o.schedule_track !== null) {
            const tr = parseScheduleTrackInput(o.schedule_track);
            if (!tr.ok)
                return null;
            if (tr.value !== undefined)
                patch.schedule_track = tr.value;
        }
    }
    return { academic_term_id, patch };
}
export async function postAdminCourseSection(req, res) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed) {
            res.status(400).json({
                error: "Invalid body: require academic_term_id, course_code, section_code, and weekday.",
            });
            return;
        }
        const tr = parseScheduleTrackInput(req.body.schedule_track);
        if (!tr.ok) {
            res.status(400).json({ error: tr.error });
            return;
        }
        const inputWithTrack = {
            ...parsed.input,
            ...(tr.value !== undefined ? { schedule_track: tr.value } : {}),
        };
        const section = await createCourseSectionWithAcademicTermId(parsed.academic_term_id, inputWithTrack);
        res.status(201).json(section);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (isMysqlDuplicateKey(e)) {
            res.status(400).json({
                error: "A section with this code already exists for this course, term, and schedule track.",
            });
            return;
        }
        console.error("[admin/course-sections] create failed:", e);
        const body = {
            error: "Could not create this course section. Please try again.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function patchAdminCourseSection(req, res) {
    try {
        const id = pathSectionId(req);
        if (id === null) {
            res.status(400).json({ error: "Invalid section id." });
            return;
        }
        const parsed = parsePatchBody(req.body);
        if (!parsed) {
            res.status(400).json({
                error: "Invalid body: academic_term_id is required, and schedule_track must be EN or CN when provided.",
            });
            return;
        }
        const section = await updateCourseSectionWithAcademicTermId(id, parsed.academic_term_id, parsed.patch);
        if (!section) {
            res.status(404).json({ error: "Course section not found." });
            return;
        }
        res.json(section);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (isMysqlDuplicateKey(e)) {
            res.status(400).json({
                error: "A section with this code already exists for this course, term, and schedule track.",
            });
            return;
        }
        console.error("[admin/course-sections] update failed:", e);
        const body = {
            error: "Could not update this course section. Please try again.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function deleteAdminCourseSection(req, res) {
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
    }
    catch (e) {
        console.error("[admin/course-sections] delete failed:", e);
        const body = {
            error: "Could not delete this course section. Please try again.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=adminCourseSectionController.js.map
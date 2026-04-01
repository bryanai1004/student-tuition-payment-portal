import { env } from "../config/env.js";
import { createCourseSection, deleteCourseSection, updateCourseSection, } from "../services/courseSectionService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function pathSectionId(req) {
    const v = req.params.id;
    const raw = Array.isArray(v) ? v[0] : v;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function parseCreateBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const course_code = typeof o.course_code === "string" ? o.course_code.trim() : "";
    const term = typeof o.term === "string" ? o.term.trim() : "";
    const section_code = typeof o.section_code === "string" ? o.section_code.trim() : "";
    const weekday = typeof o.weekday === "string" ? o.weekday.trim() : "";
    const year = typeof o.year === "number" ? o.year : Number(o.year);
    if (!course_code || !term || !section_code || !weekday)
        return null;
    if (!Number.isFinite(year))
        return null;
    const strOrNull = (v) => {
        if (v === undefined)
            return undefined;
        if (v === null)
            return null;
        if (typeof v === "string")
            return v;
        return String(v);
    };
    return {
        course_code,
        term,
        year: Math.trunc(year),
        section_code,
        weekday,
        start_time: strOrNull(o.start_time),
        end_time: strOrNull(o.end_time),
        delivery_mode: strOrNull(o.delivery_mode),
        room: strOrNull(o.room),
        instructor: strOrNull(o.instructor),
        notes: strOrNull(o.notes),
    };
}
function parsePatchBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const patch = {};
    if (typeof o.course_code === "string")
        patch.course_code = o.course_code.trim();
    if (typeof o.term === "string")
        patch.term = o.term.trim();
    if (typeof o.section_code === "string")
        patch.section_code = o.section_code.trim();
    if (typeof o.weekday === "string")
        patch.weekday = o.weekday.trim();
    if (o.year !== undefined) {
        const year = typeof o.year === "number" ? o.year : Number(o.year);
        if (!Number.isFinite(year))
            return null;
        patch.year = Math.trunc(year);
    }
    const strOrNull = (v) => {
        if (v === undefined)
            return undefined;
        if (v === null)
            return null;
        if (typeof v === "string")
            return v;
        return String(v);
    };
    if (o.start_time !== undefined)
        patch.start_time = strOrNull(o.start_time);
    if (o.end_time !== undefined)
        patch.end_time = strOrNull(o.end_time);
    if (o.delivery_mode !== undefined)
        patch.delivery_mode = strOrNull(o.delivery_mode);
    if (o.room !== undefined)
        patch.room = strOrNull(o.room);
    if (o.instructor !== undefined)
        patch.instructor = strOrNull(o.instructor);
    if (o.notes !== undefined)
        patch.notes = strOrNull(o.notes);
    return patch;
}
const UPDATABLE_KEYS = new Set([
    "course_code",
    "term",
    "year",
    "section_code",
    "weekday",
    "start_time",
    "end_time",
    "delivery_mode",
    "room",
    "instructor",
    "notes",
]);
function patchHasUpdatableField(patch) {
    return Object.keys(patch).some((k) => UPDATABLE_KEYS.has(k));
}
export async function postAdminCourseSection(req, res) {
    try {
        const input = parseCreateBody(req.body);
        if (!input) {
            res.status(400).json({
                error: "Invalid body: require course_code, term, year, section_code, weekday",
            });
            return;
        }
        const section = await createCourseSection(input);
        res.status(201).json(section);
    }
    catch (e) {
        console.error("[admin/course-sections] create failed:", e);
        const body = {
            error: "Failed to create course section",
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
            res.status(400).json({ error: "Invalid section id" });
            return;
        }
        const patch = parsePatchBody(req.body);
        if (!patch) {
            res.status(400).json({ error: "Invalid request body" });
            return;
        }
        if (!patchHasUpdatableField(patch)) {
            res.status(400).json({
                error: "No updatable fields provided",
            });
            return;
        }
        const section = await updateCourseSection(id, patch);
        if (!section) {
            res.status(404).json({ error: "Course section not found" });
            return;
        }
        res.json(section);
    }
    catch (e) {
        console.error("[admin/course-sections] update failed:", e);
        const body = {
            error: "Failed to update course section",
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
            res.status(400).json({ error: "Invalid section id" });
            return;
        }
        const removed = await deleteCourseSection(id);
        if (!removed) {
            res.status(404).json({ error: "Course section not found" });
            return;
        }
        res.status(204).send();
    }
    catch (e) {
        console.error("[admin/course-sections] delete failed:", e);
        const body = {
            error: "Failed to delete course section",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=adminCourseSectionController.js.map
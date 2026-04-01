import { env } from "../config/env.js";
import { listCoursesFromMysql } from "../repositories/courseRepository.js";
import { getSectionsForCourseCode } from "../services/courseSectionService.js";
function pathCourseCode(req) {
    const v = req.params.code;
    const raw = Array.isArray(v) ? v[0] : v;
    return raw ? decodeURIComponent(String(raw)).trim() : "";
}
export async function getCourses(_req, res) {
    try {
        const courses = await listCoursesFromMysql();
        res.json(courses);
    }
    catch (e) {
        console.error("[courses] Failed to load courses:", e);
        const message = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
        const body = {
            error: "Failed to load courses",
        };
        if (env.nodeEnv === "development") {
            body.message = message;
        }
        res.status(500).json(body);
    }
}
export async function getCourseSections(req, res) {
    try {
        const code = pathCourseCode(req);
        if (!code) {
            res.status(400).json({ error: "Course code is required" });
            return;
        }
        const sections = await getSectionsForCourseCode(code);
        res.json(sections);
    }
    catch (e) {
        console.error("[courses] Failed to load sections:", e);
        const message = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
        const body = {
            error: "Failed to load course sections",
        };
        if (env.nodeEnv === "development") {
            body.message = message;
        }
        res.status(500).json(body);
    }
}
//# sourceMappingURL=courseController.js.map
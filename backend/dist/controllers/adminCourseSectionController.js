import { env } from "../config/env.js";
import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { listAdminEnrollmentRowsForSection } from "../repositories/studentEnrollmentRepository.js";
import { buildFeedbackCsvForSection } from "../services/adminExportFeedbackCsvService.js";
import { buildRegisteredStudentsCsvForSection } from "../services/adminExportRegisteredStudentsCsvService.js";
import { createCourseSectionWithAcademicTermId, deleteCourseSection, getSectionRoster, InvalidAcademicTermError, listAllCourseSectionsByAcademicTermId, listCourseSectionsByAcademicTermId, updateCourseSectionWithAcademicTermId, } from "../services/courseSectionService.js";
import { resolveCourseMeta } from "../services/resolveCourseMetaService.js";
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
function parsePrerequisiteCourseIdInput(v, options) {
    if (v === undefined) {
        return { ok: true, value: options?.missingAsNull ? null : undefined };
    }
    if (v === null)
        return { ok: true, value: null };
    if (typeof v !== "string") {
        return {
            ok: false,
            error: "prerequisite_course_id must be a string or null.",
        };
    }
    const t = v.trim();
    return { ok: true, value: t === "" ? null : t };
}
function parseQueryString(req, key) {
    const raw = req.query[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
/** Optional `course_sections.id` for section-scoped enrollment lists. */
function parseOptionalCourseSectionIdQuery(req) {
    const raw = parseQueryString(req, "section_id") ??
        parseQueryString(req, "course_section_id");
    if (raw == null)
        return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}
/**
 * GET /api/admin/course-sections/course-meta?course_code=
 * Chinese-first title from `courses` + optional instructor hint from timetables/marks (stable pick when multiple).
 */
export async function getAdminCourseSectionCourseMeta(req, res) {
    try {
        const courseCode = parseQueryString(req, "course_code");
        if (!courseCode) {
            res.status(400).json({
                error: "course_code query parameter is required.",
            });
            return;
        }
        const meta = await resolveCourseMeta(courseCode);
        if (meta === null) {
            res.status(400).json({
                error: "course_code must be a non-empty string.",
            });
            return;
        }
        res.json(meta);
    }
    catch (e) {
        console.error("[admin/course-sections/course-meta] failed:", e);
        const body = {
            error: "Failed to resolve course metadata.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
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
 * GET /api/admin/course-sections/enrollments?academic_term_id=&course_code=&section_id=
 * Optional `section_id` (`course_sections.id`) limits the roster to that section (+ legacy course-level rows on the canonical MIN(section id) for that course when applicable).
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
        const courseSectionId = parseOptionalCourseSectionIdQuery(req);
        const rows = await listAdminEnrollmentRowsForSection(courseCode, termRow.term_name, termRow.year, courseSectionId != null ? { courseSectionId } : undefined);
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
/**
 * GET /api/admin/sections/:sectionId/roster
 * Current section membership from `portal_enrollments` keyed by `course_section_id`.
 */
export async function getAdminCourseSectionRosterHandler(req, res) {
    const rawSectionId = req.params.sectionId;
    const sectionId = Number(rawSectionId);
    if (!Number.isFinite(sectionId) || !Number.isInteger(sectionId) || sectionId <= 0) {
        res.status(400).json({ error: "Invalid section id." });
        return;
    }
    try {
        const roster = await getSectionRoster(sectionId);
        res.json(roster);
    }
    catch (e) {
        console.error("[admin/sections/:sectionId/roster] list failed:", e);
        res.status(500).json({ error: "Failed to load section roster." });
    }
}
/**
 * GET /api/admin/course-sections/:id/export-registered-students.csv
 * UTF-8 CSV with BOM for Excel; roster is course+term+year (see adminExportRegisteredStudentsCsvService).
 */
export async function getAdminExportRegisteredStudentsCsv(req, res) {
    try {
        const id = pathSectionId(req);
        if (id === null) {
            res.status(400).json({ error: "Invalid section id." });
            return;
        }
        const built = await buildRegisteredStudentsCsvForSection(id);
        if (!built.ok) {
            res.status(404).json({ error: "Course section not found." });
            return;
        }
        if (env.nodeEnv === "development" && built.devDiagnostic != null) {
            console.log("[admin/course-sections/export-registered-students] diagnostic", {
                route: "GET /api/admin/course-sections/:id/export-registered-students.csv",
                sectionId: id,
                finalHeaderLabels: built.devDiagnostic.headerLabels,
                csvFirstLine: built.devDiagnostic.csvFirstLine,
                firstFlattenedRow: built.devDiagnostic.firstFlattenedRow,
            });
        }
        const asciiName = built.filename.replace(/"/g, "");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"`);
        /** Confirms this response was generated by the roster-only CSV path (curl -I to verify deployment). */
        res.setHeader("X-Portal-Roster-Csv-Schema", "registered-students-only-v1");
        res.send(Buffer.from(`\uFEFF${built.csvBody}`, "utf8"));
    }
    catch (e) {
        console.error("[admin/course-sections/export-registered-students] failed:", e);
        const body = {
            error: "Failed to export registered students CSV.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/course-sections/:id/export-feedback.csv
 * UTF-8 CSV with BOM for Excel; rows are anonymized and scoped to section course+term+year.
 */
export async function getAdminExportFeedbackCsv(req, res) {
    try {
        const id = pathSectionId(req);
        if (id === null) {
            res.status(400).json({ error: "Invalid section id." });
            return;
        }
        const built = await buildFeedbackCsvForSection(id);
        if (!built.ok) {
            res.status(404).json({ error: "Course section not found." });
            return;
        }
        const asciiName = built.filename.replace(/"/g, "");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"`);
        res.setHeader("X-Portal-Feedback-Csv-Schema", "anonymous-feedback-v1");
        res.send(Buffer.from(`\uFEFF${built.csvBody}`, "utf8"));
    }
    catch (e) {
        console.error("[admin/course-sections/export-feedback] failed:", e);
        const body = {
            error: "Failed to export feedback CSV.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
function parseCreateBody(body) {
    if (!body || typeof body !== "object") {
        return {
            ok: false,
            error: "Invalid body: require academic_term_id, course_code, section_code, and weekday.",
        };
    }
    const o = body;
    const academic_term_id = parseAcademicTermId(o.academic_term_id);
    const course_code = typeof o.course_code === "string" ? o.course_code.trim() : "";
    const section_code = typeof o.section_code === "string" ? o.section_code.trim() : "";
    const weekday = typeof o.weekday === "string" ? o.weekday.trim() : "";
    if (!academic_term_id || !course_code || !section_code || !weekday) {
        return {
            ok: false,
            error: "Invalid body: require academic_term_id, course_code, section_code, and weekday.",
        };
    }
    const prerequisite = parsePrerequisiteCourseIdInput(o.prerequisite_course_id, {
        missingAsNull: true,
    });
    if (!prerequisite.ok)
        return prerequisite;
    return {
        ok: true,
        academic_term_id,
        input: {
            course_code,
            prerequisite_course_id: prerequisite.value ?? null,
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
    if (!body || typeof body !== "object") {
        return {
            ok: false,
            error: "Invalid body: academic_term_id is required, and schedule_track must be EN or CN when provided.",
        };
    }
    const o = body;
    const academic_term_id = parseAcademicTermId(o.academic_term_id);
    if (!academic_term_id) {
        return {
            ok: false,
            error: "Invalid body: academic_term_id is required, and schedule_track must be EN or CN when provided.",
        };
    }
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
    if (Object.prototype.hasOwnProperty.call(o, "prerequisite_course_id")) {
        const prerequisite = parsePrerequisiteCourseIdInput(o.prerequisite_course_id);
        if (!prerequisite.ok)
            return prerequisite;
        patch.prerequisite_course_id = prerequisite.value ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(o, "schedule_track")) {
        if (o.schedule_track !== null) {
            const tr = parseScheduleTrackInput(o.schedule_track);
            if (!tr.ok)
                return { ok: false, error: tr.error };
            if (tr.value !== undefined)
                patch.schedule_track = tr.value;
        }
    }
    return { ok: true, academic_term_id, patch };
}
export async function postAdminCourseSection(req, res) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed || !parsed.ok) {
            res.status(400).json({
                error: parsed && "error" in parsed
                    ? parsed.error
                    : "Invalid body: require academic_term_id, course_code, section_code, and weekday.",
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
        if (!parsed || !parsed.ok) {
            res.status(400).json({
                error: parsed && "error" in parsed
                    ? parsed.error
                    : "Invalid body: academic_term_id is required, and schedule_track must be EN or CN when provided.",
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
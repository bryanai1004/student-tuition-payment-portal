import { buildAdminStudentsCsv, createAdminStudentLoa, createAdminStudent, deleteSelectedAdminStudents, getAdminStudentDetail, listAdminStudentsPage, previewNextAdminStudentId, updateAdminStudent, } from "../services/adminStudentService.js";
function isRecord(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
}
function trimStr(v) {
    if (v == null)
        return "";
    return String(v).trim();
}
function parseNullableStringField(v) {
    const s = trimStr(v);
    return s === "" ? null : s;
}
function parseStudentProgramField(raw, options) {
    if (typeof raw !== "string") {
        return {
            ok: false,
            error: options?.required === false
                ? "program must be DAHM or MAHM."
                : "program is required.",
        };
    }
    switch (raw.trim().toUpperCase()) {
        case "DAHM":
            return { ok: true, value: "DAHM" };
        case "MAHM":
            return { ok: true, value: "MAHM" };
        default:
            return { ok: false, error: "program must be DAHM or MAHM." };
    }
}
function parseUpdateBody(raw) {
    if (!isRecord(raw) || typeof raw.name !== "string") {
        return { ok: false, error: "Invalid request body." };
    }
    const program = parseStudentProgramField(raw.program);
    if (!program.ok)
        return program;
    return {
        ok: true,
        value: {
            name: raw.name,
            program: program.value,
            email: parseNullableStringField(raw.email),
            gender: parseNullableStringField(raw.gender),
            backgroundSchool: parseNullableStringField(raw.backgroundSchool),
            highestDegree: parseNullableStringField(raw.highestDegree),
            requirementsId: parseNullableStringField(raw.requirementsId),
            address: parseNullableStringField(raw.address),
            city: parseNullableStringField(raw.city),
            state: parseNullableStringField(raw.state),
            zip: parseNullableStringField(raw.zip),
            signedDate: parseNullableStringField(raw.signedDate),
            enrollStartDate: parseNullableStringField(raw.enrollStartDate),
        },
    };
}
function parseEntryDateFromBody(raw) {
    if (typeof raw !== "string")
        return null;
    const t = raw.trim();
    return t === "" ? null : t;
}
function parseRequirementsIdFromBody(raw) {
    if (raw === undefined)
        return undefined;
    if (raw === null)
        return null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.trunc(raw);
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        if (t === "")
            return null;
        const n = Number.parseInt(t, 10);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}
function parseCreateBody(raw) {
    if (!isRecord(raw))
        return { ok: false, error: "Invalid request body." };
    if (raw.division !== "Chinese" && raw.division !== "English") {
        return { ok: false, error: "Invalid request body." };
    }
    if (typeof raw.name !== "string" || typeof raw.initialPassword !== "string") {
        return { ok: false, error: "Invalid request body." };
    }
    const entryDate = parseEntryDateFromBody(raw.entryDate);
    if (entryDate == null)
        return { ok: false, error: "Invalid request body." };
    const program = parseStudentProgramField(raw.program);
    if (!program.ok)
        return program;
    const requirementsId = parseRequirementsIdFromBody(raw.requirementsId);
    if (requirementsId === undefined && raw.requirementsId != null) {
        return { ok: false, error: "Invalid request body." };
    }
    return {
        ok: true,
        value: {
            division: raw.division,
            entryDate,
            name: raw.name,
            program: program.value,
            email: parseNullableStringField(raw.email),
            gender: parseNullableStringField(raw.gender),
            requirementsId: requirementsId === undefined ? null : requirementsId,
            highestDegree: parseNullableStringField(raw.highestDegree),
            backgroundSchool: parseNullableStringField(raw.backgroundSchool),
            signedDate: parseNullableStringField(raw.signedDate),
            enrollStartDate: parseNullableStringField(raw.enrollStartDate),
            address: parseNullableStringField(raw.address),
            address2: parseNullableStringField(raw.address2),
            city: parseNullableStringField(raw.city),
            state: parseNullableStringField(raw.state),
            zip: parseNullableStringField(raw.zip),
            initialPassword: raw.initialPassword,
        },
    };
}
function parseCreateLoaBody(raw) {
    if (!isRecord(raw))
        return { ok: false, error: "Invalid request body." };
    return {
        ok: true,
        value: {
            loaQuarter: trimStr(raw.loaQuarter),
            loaYear: trimStr(raw.loaYear),
            plannedReturnQuarter: trimStr(raw.plannedReturnQuarter),
            plannedReturnYear: trimStr(raw.plannedReturnYear),
            reason: parseNullableStringField(raw.reason),
        },
    };
}
const STUDENT_ID_PARAM = /^[A-Za-z0-9._-]{1,64}$/;
const ADMIN_STUDENT_LIST_DEFAULT_PAGE = 1;
const ADMIN_STUDENT_LIST_DEFAULT_PAGE_SIZE = 25;
const ADMIN_STUDENT_LIST_MAX_PAGE_SIZE = 100;
function normalizeStudentIdParam(raw) {
    const s = raw?.trim() ?? "";
    if (s === "" || !STUDENT_ID_PARAM.test(s))
        return null;
    return s;
}
function parsePositiveIntParam(raw, fallback, max) {
    if (typeof raw !== "string")
        return fallback;
    const t = raw.trim();
    if (t === "")
        return fallback;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n) || n < 1)
        return fallback;
    const truncated = Math.trunc(n);
    if (max != null && truncated > max)
        return max;
    return truncated;
}
function parseAdminStudentProgramParam(raw) {
    if (typeof raw !== "string")
        return "all";
    switch (raw.trim().toLowerCase()) {
        case "dahm":
            return "dahm";
        case "mahm":
            return "mahm";
        case "all":
        default:
            return "all";
    }
}
function parseAdminStudentTrackParam(raw) {
    if (typeof raw !== "string")
        return "all";
    switch (raw.trim().toUpperCase()) {
        case "C":
            return "C";
        case "E":
            return "E";
        default:
            return "all";
    }
}
function parseAdminStudentEntryYearParam(raw) {
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim();
    return /^20\d{2}$/.test(trimmed) ? trimmed : null;
}
function parseAdminStudentIntakeCodeParam(raw) {
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim().toUpperCase();
    return trimmed === "" ? null : trimmed.slice(0, 1);
}
function parseAdminStudentLoaParam(raw) {
    if (typeof raw !== "string")
        return "all";
    switch (raw.trim().toLowerCase()) {
        case "yes":
            return "yes";
        case "no":
            return "no";
        default:
            return "all";
    }
}
function parseAdminStudentLoaQuarterParam(raw) {
    if (typeof raw !== "string")
        return null;
    switch (raw.trim().toLowerCase()) {
        case "winter":
            return "Winter";
        case "spring":
            return "Spring";
        case "summer":
            return "Summer";
        case "fall":
            return "Fall";
        default:
            return null;
    }
}
function parseAdminStudentLoaYearParam(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
        const year = Math.trunc(raw);
        return year >= 1900 && year <= 2100 ? year : null;
    }
    if (typeof raw !== "string")
        return null;
    const trimmed = raw.trim();
    if (!/^\d{4}$/.test(trimmed))
        return null;
    const year = Number.parseInt(trimmed, 10);
    return year >= 1900 && year <= 2100 ? year : null;
}
function parseAdminStudentListViewParam(raw) {
    if (typeof raw !== "string")
        return "roster";
    return raw.trim().toLowerCase() === "new-enrollment"
        ? "new-enrollment"
        : "roster";
}
function parseAdminStudentIds(raw) {
    if (raw == null)
        return { ok: true, value: [] };
    if (!Array.isArray(raw)) {
        return { ok: false, error: "studentIds must be an array when provided." };
    }
    const seen = new Set();
    const normalized = [];
    for (const item of raw) {
        if (typeof item !== "string") {
            return { ok: false, error: "Each student id must be a string." };
        }
        const studentId = item.trim();
        if (studentId === "")
            continue;
        if (!STUDENT_ID_PARAM.test(studentId)) {
            return { ok: false, error: `Invalid student id: ${studentId}` };
        }
        if (!seen.has(studentId)) {
            seen.add(studentId);
            normalized.push(studentId);
        }
    }
    return { ok: true, value: normalized };
}
function parseAdminStudentsExportBody(raw) {
    if (!isRecord(raw))
        return { ok: false, error: "Invalid request body." };
    const studentIds = parseAdminStudentIds(raw.studentIds);
    if (!studentIds.ok)
        return studentIds;
    const view = parseAdminStudentListViewParam(raw.view);
    if (studentIds.value.length > 0) {
        return {
            ok: true,
            value: {
                mode: "selected",
                studentIds: studentIds.value,
                view,
            },
        };
    }
    const search = typeof raw.search === "string" ? raw.search.trim().slice(0, 200) : "";
    const program = parseAdminStudentProgramParam(raw.program);
    const track = parseAdminStudentTrackParam(raw.track);
    const entryYear = parseAdminStudentEntryYearParam(raw.entryYear);
    const intakeCode = parseAdminStudentIntakeCodeParam(raw.intakeCode);
    const loa = parseAdminStudentLoaParam(raw.loa);
    const loaQuarter = parseAdminStudentLoaQuarterParam(raw.loaQuarter);
    const loaYear = parseAdminStudentLoaYearParam(raw.loaYear);
    return {
        ok: true,
        value: {
            mode: "filtered",
            search,
            program,
            track,
            entryYear,
            intakeCode,
            loa,
            loaQuarter,
            loaYear,
            view,
        },
    };
}
export async function getAdminStudents(req, res) {
    try {
        const rawClinical = req.query.clinicalSummary;
        const includeClinicalSummary = rawClinical === "1" || rawClinical === "true" || rawClinical === "yes";
        const page = parsePositiveIntParam(req.query.page, ADMIN_STUDENT_LIST_DEFAULT_PAGE);
        const pageSize = parsePositiveIntParam(req.query.pageSize, ADMIN_STUDENT_LIST_DEFAULT_PAGE_SIZE, ADMIN_STUDENT_LIST_MAX_PAGE_SIZE);
        const searchRaw = req.query.search;
        const search = typeof searchRaw === "string"
            ? searchRaw.trim().slice(0, 200)
            : "";
        const program = parseAdminStudentProgramParam(req.query.program);
        const track = parseAdminStudentTrackParam(req.query.track);
        const entryYear = parseAdminStudentEntryYearParam(req.query.entryYear);
        const intakeCode = parseAdminStudentIntakeCodeParam(req.query.intakeCode);
        const loa = parseAdminStudentLoaParam(req.query.loa);
        const loaQuarter = parseAdminStudentLoaQuarterParam(req.query.loaQuarter);
        const loaYear = parseAdminStudentLoaYearParam(req.query.loaYear);
        const result = await listAdminStudentsPage({
            page,
            pageSize,
            search,
            program,
            track,
            entryYear,
            intakeCode,
            loa,
            loaQuarter,
            loaYear,
            includeClinicalSummary,
        });
        res.json({
            items: result.items,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            enrollmentFilterOptions: result.enrollmentFilterOptions,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load students" });
    }
}
export async function postExportAdminStudentsCsv(req, res) {
    const body = parseAdminStudentsExportBody(req.body);
    if (!body.ok) {
        res.status(400).json({ error: body.error });
        return;
    }
    try {
        const built = await buildAdminStudentsCsv(body.value);
        const asciiName = built.filename.replace(/"/g, "");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${asciiName}"`);
        res.send(Buffer.from(`\uFEFF${built.csvBody}`, "utf8"));
    }
    catch (e) {
        console.error("[admin/students/export.csv] failed:", e);
        res.status(500).json({ error: "Failed to export students CSV." });
    }
}
function paramStudentId(params) {
    const raw = params.studentId;
    return typeof raw === "string" ? raw : undefined;
}
export async function getAdminStudent(req, res) {
    const studentId = normalizeStudentIdParam(paramStudentId(req.params));
    if (!studentId) {
        res.status(400).json({ error: "Invalid student id." });
        return;
    }
    try {
        const detail = await getAdminStudentDetail(studentId);
        if (!detail) {
            res.status(404).json({ error: "Student not found." });
            return;
        }
        res.json(detail);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load student" });
    }
}
export async function getNextAdminStudentId(req, res) {
    const division = req.query.division;
    const entryDate = req.query.entryDate;
    try {
        const result = await previewNextAdminStudentId(division, entryDate);
        if (!result.ok) {
            res.status(result.status).json({ error: result.message });
            return;
        }
        res.json({ studentId: result.studentId });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to compute next student id" });
    }
}
export async function postAdminStudent(req, res) {
    const body = parseCreateBody(req.body);
    if (!body.ok) {
        res.status(400).json({ error: body.error });
        return;
    }
    try {
        const result = await createAdminStudent(body.value);
        if (!result.ok) {
            res.status(result.status).json({ error: result.message });
            return;
        }
        res.status(201).json({ ok: true, studentId: result.studentId });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create student" });
    }
}
export async function postAdminStudentLoa(req, res) {
    const studentId = normalizeStudentIdParam(paramStudentId(req.params));
    if (!studentId) {
        res.status(400).json({ error: "Invalid student id." });
        return;
    }
    const body = parseCreateLoaBody(req.body);
    if (!body.ok) {
        res.status(400).json({ error: body.error });
        return;
    }
    try {
        const result = await createAdminStudentLoa(studentId, body.value);
        if (!result.ok) {
            res.status(result.status).json({ error: result.message });
            return;
        }
        res.status(201).json(result.detail);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create LOA record" });
    }
}
export async function postDeleteSelectedAdminStudents(req, res) {
    const raw = req.body;
    const studentIds = raw?.studentIds;
    try {
        const result = await deleteSelectedAdminStudents(studentIds);
        if (!result.ok) {
            res.status(result.status).json({ error: result.message });
            return;
        }
        res.json({
            ok: true,
            deletedStudentIds: result.deletedStudentIds,
            blocked: result.blocked,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to delete students" });
    }
}
export async function putAdminStudent(req, res) {
    const studentId = normalizeStudentIdParam(paramStudentId(req.params));
    if (!studentId) {
        res.status(400).json({ error: "Invalid student id." });
        return;
    }
    const body = parseUpdateBody(req.body);
    if (!body.ok) {
        res.status(400).json({ error: body.error });
        return;
    }
    try {
        const result = await updateAdminStudent(studentId, body.value);
        if (!result.ok) {
            res.status(result.status).json({ error: result.message });
            return;
        }
        res.json(result.detail);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to update student" });
    }
}
//# sourceMappingURL=adminStudentController.js.map
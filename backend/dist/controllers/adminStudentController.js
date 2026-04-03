import { createAdminStudent, deleteSelectedAdminStudents, getAdminStudentDetail, listAdminStudents, previewNextAdminStudentId, updateAdminStudent, } from "../services/adminStudentService.js";
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
function parseUpdateBody(raw) {
    if (!isRecord(raw))
        return null;
    if (typeof raw.name !== "string")
        return null;
    return {
        name: raw.name,
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
        return null;
    if (raw.division !== "Chinese" && raw.division !== "English")
        return null;
    if (typeof raw.name !== "string")
        return null;
    if (typeof raw.initialPassword !== "string")
        return null;
    const entryDate = parseEntryDateFromBody(raw.entryDate);
    if (entryDate == null)
        return null;
    const requirementsId = parseRequirementsIdFromBody(raw.requirementsId);
    if (requirementsId === undefined && raw.requirementsId != null) {
        return null;
    }
    return {
        division: raw.division,
        entryDate,
        name: raw.name,
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
    };
}
const STUDENT_ID_PARAM = /^[A-Za-z0-9._-]{1,64}$/;
function normalizeStudentIdParam(raw) {
    const s = raw?.trim() ?? "";
    if (s === "" || !STUDENT_ID_PARAM.test(s))
        return null;
    return s;
}
export async function getAdminStudents(_req, res) {
    try {
        const students = await listAdminStudents();
        res.json({ students });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load students" });
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
    if (!body) {
        res.status(400).json({ error: "Invalid request body." });
        return;
    }
    try {
        const result = await createAdminStudent(body);
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
    if (!body) {
        res.status(400).json({ error: "Invalid request body." });
        return;
    }
    try {
        const result = await updateAdminStudent(studentId, body);
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
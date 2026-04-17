import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";
import { buildActivityRows } from "../services/activityView.js";
import { getCatalogDemoAccountPayload } from "../services/demoAccountService.js";
import { getStudentAccountPayload, } from "../services/studentAccountService.js";
import { getLegacyStudentProfile, legacyDbDateToIso, updateLegacyStudentSensitiveProfile, } from "../services/studentProfileService.js";
/**
 * Both `term` and `year` must be present for an explicit term; otherwise resolve the default term/year:
 * demo student → latest `portal_enrollments`; real students → latest legacy `registration` row.
 */
function accountTermYearFromQuery(req) {
    const termRaw = req.query.term;
    const yearRaw = req.query.year;
    const term = typeof termRaw === "string" && termRaw.trim() !== ""
        ? termRaw.trim()
        : null;
    const yearNum = typeof yearRaw === "string" && yearRaw.trim() !== ""
        ? Number(yearRaw)
        : Number.NaN;
    const year = Number.isFinite(yearNum) ? yearNum : null;
    if (term != null && year != null) {
        return { mode: "explicit", term, year };
    }
    return { mode: "auto" };
}
/** Demo and legacy links that omit query params still default to a concrete term. */
function termFromQuery(req) {
    const t = req.query.term;
    return typeof t === "string" && t.trim() !== "" ? t.trim() : "Fall";
}
function yearFromQuery(req) {
    const y = req.query.year;
    const n = typeof y === "string" ? Number(y) : Number.NaN;
    return Number.isFinite(n) ? n : 2026;
}
function pathStudentId(req) {
    const v = req.params.studentId;
    if (Array.isArray(v))
        return v[0] ?? "";
    return v ?? "";
}
function isRecord(v) {
    return v != null && typeof v === "object" && !Array.isArray(v);
}
const STUDENT_PROFILE_UPDATE_FIELDS = [
    "dob",
    "ssn",
    "visa",
    "address",
    "phone1",
    "phone2",
    "phone3",
    "email",
    "citizenship",
    "race",
    "marital",
];
function parseStudentProfileUpdateBody(raw) {
    if (!isRecord(raw))
        return { ok: false, error: "Invalid request body." };
    const allowed = new Set(STUDENT_PROFILE_UPDATE_FIELDS);
    const patch = {};
    for (const key of Object.keys(raw)) {
        if (!allowed.has(key)) {
            return { ok: false, error: `Unknown field: ${key}` };
        }
    }
    for (const field of STUDENT_PROFILE_UPDATE_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(raw, field))
            continue;
        const value = raw[field];
        if (value !== null && typeof value !== "string") {
            return { ok: false, error: `${field} must be a string or null.` };
        }
        if (field === "dob" && value != null && value.trim() !== "") {
            if (!legacyDbDateToIso(value)) {
                return {
                    ok: false,
                    error: "dob must be a valid calendar date (YYYY-MM-DD).",
                };
            }
        }
        patch[field] = value == null ? null : value.trim();
    }
    if (Object.keys(patch).length === 0) {
        return { ok: false, error: "At least one updatable field is required." };
    }
    return { ok: true, value: patch };
}
export async function getStudentProfile(req, res) {
    try {
        const sid = pathStudentId(req).trim();
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const payload = await getLegacyStudentProfile(sid);
        if (!payload) {
            res.status(404).json({ error: "Student profile not found" });
            return;
        }
        res.json(payload);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load student profile" });
    }
}
export async function putStudentProfile(req, res) {
    const authStudent = verifyStudentAccessToken(req.headers.authorization);
    if (!authStudent) {
        res.status(401).json({ error: "Authentication required" });
        return;
    }
    const body = parseStudentProfileUpdateBody(req.body);
    if (!body.ok) {
        res.status(400).json({ error: body.error });
        return;
    }
    try {
        const updated = await updateLegacyStudentSensitiveProfile(authStudent.studentId, body.value);
        if (!updated) {
            res.status(404).json({ error: "Student profile not found" });
            return;
        }
        const payload = await getLegacyStudentProfile(authStudent.studentId);
        if (!payload) {
            res.status(404).json({ error: "Student profile not found" });
            return;
        }
        res.json(payload);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to update student profile" });
    }
}
export async function getStudentAccount(req, res) {
    try {
        const termYear = accountTermYearFromQuery(req);
        const sid = pathStudentId(req);
        console.debug("[account-debug] getStudentAccount", JSON.stringify({ studentId: sid, termYear }));
        const payload = await getStudentAccountPayload(sid, termYear);
        if (!payload) {
            console.warn("[account] student_term_not_found", JSON.stringify({ studentId: sid, termYear }));
            res.status(404).json({ error: "Student term account not found" });
            return;
        }
        res.json(payload);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load account" });
    }
}
export async function getStudentActivity(req, res) {
    try {
        const termYear = accountTermYearFromQuery(req);
        const payload = await getStudentAccountPayload(pathStudentId(req), termYear);
        if (!payload) {
            res.status(404).json({ error: "Student term account not found" });
            return;
        }
        res.json({ rows: buildActivityRows(payload) });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load activity" });
    }
}
export function getDemoAccount(req, res) {
    try {
        const term = termFromQuery(req);
        const year = yearFromQuery(req);
        const payload = getCatalogDemoAccountPayload(term, year);
        res.json(payload);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load account" });
    }
}
export function getDemoActivity(req, res) {
    try {
        const term = termFromQuery(req);
        const year = yearFromQuery(req);
        const payload = getCatalogDemoAccountPayload(term, year);
        res.json({ rows: buildActivityRows(payload) });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load activity" });
    }
}
//# sourceMappingURL=studentAccountController.js.map
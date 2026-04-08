import { env } from "../config/env.js";
import { academicTermPaymentPolicyColumnsAvailable, createAcademicTerm, getCurrentRegistrationOpenTerm, listAllAcademicTerms, listRecentVisibleTerms, isAcademicTermName, isAcademicTermStatus, updateAcademicTerm, } from "../services/academicTermService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function pathTermId(req) {
    const v = req.params.id;
    const raw = Array.isArray(v) ? v[0] : v;
    if (typeof raw !== "string" || !raw.trim())
        return null;
    return raw.trim();
}
function parseYear(v) {
    if (v === undefined || v === null)
        return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return null;
    return Math.trunc(n);
}
function parseSequenceNo(v) {
    if (v === undefined || v === null)
        return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return null;
    return Math.trunc(n);
}
function parseOptionalDate(v) {
    if (v === undefined)
        return undefined;
    if (v === null)
        return null;
    if (typeof v !== "string")
        return "invalid";
    const s = v.trim();
    if (s === "")
        return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        return "invalid";
    return s;
}
function parseOptionalBool(v) {
    if (v === undefined)
        return undefined;
    if (typeof v === "boolean")
        return v;
    if (v === 0 || v === 1)
        return v === 1;
    if (typeof v === "bigint")
        return v !== 0n;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true" || s === "1")
            return true;
        if (s === "false" || s === "0")
            return false;
    }
    return "invalid";
}
function parseCreateBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const year = parseYear(o.year);
    const sequence_no = parseSequenceNo(o.sequence_no);
    if (year === null || sequence_no === null)
        return null;
    const term_name = o.term_name;
    if (!isAcademicTermName(term_name))
        return null;
    const status = o.status;
    if (!isAcademicTermStatus(status))
        return null;
    const term_label = typeof o.term_label === "string" ? o.term_label.trim() : undefined;
    const start = parseOptionalDate(o.start_date);
    const end = parseOptionalDate(o.end_date);
    const ro = parseOptionalDate(o.registration_open);
    const rc = parseOptionalDate(o.registration_close);
    const wd = parseOptionalDate(o.withdraw_deadline);
    const pdd = parseOptionalDate(o.payment_due_date);
    if (start === "invalid" ||
        end === "invalid" ||
        ro === "invalid" ||
        rc === "invalid" ||
        wd === "invalid" ||
        pdd === "invalid") {
        return null;
    }
    const vis = parseOptionalBool(o.is_visible);
    if (vis === "invalid")
        return null;
    const lockReg = parseOptionalBool(o.lock_registration_if_overdue);
    if (lockReg === "invalid")
        return null;
    return {
        year,
        term_name: term_name,
        sequence_no,
        ...(term_label !== undefined && term_label !== ""
            ? { term_label }
            : {}),
        start_date: start,
        end_date: end,
        registration_open: ro,
        registration_close: rc,
        withdraw_deadline: wd,
        payment_due_date: pdd,
        ...(lockReg !== undefined ? { lock_registration_if_overdue: lockReg } : {}),
        status: status,
        ...(vis !== undefined ? { is_visible: vis } : {}),
    };
}
function parsePatchBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const patch = {};
    if (o.year !== undefined) {
        const year = parseYear(o.year);
        if (year === null)
            return null;
        patch.year = year;
    }
    if (o.sequence_no !== undefined) {
        const sequence_no = parseSequenceNo(o.sequence_no);
        if (sequence_no === null)
            return null;
        patch.sequence_no = sequence_no;
    }
    if (o.term_name !== undefined) {
        if (!isAcademicTermName(o.term_name))
            return null;
        patch.term_name = o.term_name;
    }
    if (o.status !== undefined) {
        if (!isAcademicTermStatus(o.status))
            return null;
        patch.status = o.status;
    }
    if (o.term_label !== undefined) {
        if (typeof o.term_label !== "string")
            return null;
        patch.term_label = o.term_label.trim();
    }
    for (const key of [
        "start_date",
        "end_date",
        "registration_open",
        "registration_close",
        "withdraw_deadline",
        "payment_due_date",
    ]) {
        if (o[key] !== undefined) {
            const d = parseOptionalDate(o[key]);
            if (d === "invalid")
                return null;
            patch[key] = d;
        }
    }
    if (o.lock_registration_if_overdue !== undefined) {
        const lock = parseOptionalBool(o.lock_registration_if_overdue);
        if (lock === "invalid")
            return null;
        patch.lock_registration_if_overdue = lock;
    }
    if (o.is_visible !== undefined) {
        const vis = parseOptionalBool(o.is_visible);
        if (vis === "invalid")
            return null;
        patch.is_visible = vis;
    }
    return patch;
}
function patchHasField(patch) {
    return Object.keys(patch).length > 0;
}
async function setAcademicTermPaymentColumnsHeader(res) {
    const available = await academicTermPaymentPolicyColumnsAvailable();
    res.setHeader("X-Academic-Terms-Payment-Columns", available ? "1" : "0");
}
export async function getAcademicTerms(_req, res) {
    try {
        const terms = await listAllAcademicTerms();
        await setAcademicTermPaymentColumnsHeader(res);
        res.json(terms);
    }
    catch (e) {
        console.error("[academic-terms] list failed:", e);
        res.status(500).json({
            error: "Unable to load academic terms.",
        });
    }
}
export async function getAcademicTermsRecent(req, res) {
    try {
        const raw = req.query.limit;
        const rawStr = Array.isArray(raw) ? raw[0] : raw;
        let limit = 3;
        if (typeof rawStr === "string" && rawStr.trim() !== "") {
            const n = Number(rawStr);
            if (!Number.isInteger(n) || n < 1 || n > 50) {
                res.status(400).json({ error: "Invalid limit" });
                return;
            }
            limit = n;
        }
        const terms = await listRecentVisibleTerms(limit);
        await setAcademicTermPaymentColumnsHeader(res);
        res.json(terms);
    }
    catch (e) {
        console.error("[academic-terms/recent] failed:", e);
        res.status(500).json({
            error: "Unable to load academic terms.",
        });
    }
}
export async function getAcademicTermsCurrent(_req, res) {
    try {
        const term = await getCurrentRegistrationOpenTerm();
        await setAcademicTermPaymentColumnsHeader(res);
        res.json(term);
    }
    catch (e) {
        console.error("[academic-terms/current] failed:", e);
        res.status(500).json({
            error: "Unable to load academic terms.",
        });
    }
}
export async function postAdminAcademicTerm(req, res) {
    try {
        const input = parseCreateBody(req.body);
        if (!input) {
            res.status(400).json({
                error: "Invalid body: require year, term_name, sequence_no, status; optional date fields (YYYY-MM-DD), term_label, is_visible, payment_due_date, lock_registration_if_overdue",
            });
            return;
        }
        const term = await createAcademicTerm(input);
        await setAcademicTermPaymentColumnsHeader(res);
        res.status(201).json(term);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("Invalid ") ||
            msg.includes("already exists") ||
            msg.includes("Duplicate")) {
            res.status(400).json({ error: msg });
            return;
        }
        console.error("[admin/academic-terms] create failed:", e);
        const body = {
            error: "Failed to create academic term",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function patchAdminAcademicTerm(req, res) {
    try {
        const id = pathTermId(req);
        if (!id) {
            res.status(400).json({ error: "Invalid term id" });
            return;
        }
        const patch = parsePatchBody(req.body);
        if (!patch) {
            res.status(400).json({ error: "Invalid request body" });
            return;
        }
        if (!patchHasField(patch)) {
            res.status(400).json({ error: "No updatable fields provided" });
            return;
        }
        const term = await updateAcademicTerm(id, patch);
        if (!term) {
            res.status(404).json({ error: "Academic term not found" });
            return;
        }
        await setAcademicTermPaymentColumnsHeader(res);
        res.json(term);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("Invalid ") ||
            msg.includes("already exists") ||
            msg.includes("Duplicate") ||
            msg.includes("Target id")) {
            res.status(400).json({ error: msg });
            return;
        }
        console.error("[admin/academic-terms] update failed:", e);
        const body = {
            error: "Failed to update academic term",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=academicTermController.js.map
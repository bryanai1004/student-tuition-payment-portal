import { env } from "../config/env.js";
import { AdminClinicalSlotError, createAdminClinicalSlot, deleteAdminClinicalSlot, listAdminClinicalSlots, updateAdminClinicalSlot, } from "../services/adminClinicalSlotService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function parseQueryAcademicTermId(req) {
    const raw = req.query.academicTermId ?? req.query.academic_term_id;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
function pathSlotId(req) {
    const v = req.params.id;
    const raw = Array.isArray(v) ? v[0] : v;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function parseForceDeleteQuery(req) {
    const raw = req.query.force;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return false;
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}
function parseForceDeleteActor(req) {
    const roleRaw = req.headers["x-admin-role"];
    const idRaw = req.headers["x-admin-email"];
    const role = typeof roleRaw === "string" && roleRaw.trim() !== ""
        ? roleRaw.trim()
        : null;
    const adminIdentifier = typeof idRaw === "string" && idRaw.trim() !== "" ? idRaw.trim() : null;
    return { adminRole: role, adminIdentifier };
}
function parseCreateBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const academicTermId = typeof o.academicTermId === "string" ? o.academicTermId.trim() : "";
    const weekday = typeof o.weekday === "string" ? o.weekday.trim() : "";
    const timeFrom = typeof o.timeFrom === "string" ? o.timeFrom : "";
    const timeTo = typeof o.timeTo === "string" ? o.timeTo : "";
    const slot = typeof o.slot === "string" ? o.slot.trim() : "";
    const instructor = typeof o.instructor === "string" ? o.instructor : "TBA";
    if (!academicTermId || !weekday || !slot) {
        return null;
    }
    return {
        academicTermId,
        weekday,
        timeFrom,
        timeTo,
        slot,
        instructorId: o.instructorId === undefined || o.instructorId === null
            ? ""
            : typeof o.instructorId === "string"
                ? o.instructorId
                : String(o.instructorId),
        instructor,
        cap100: o.cap100,
        cap200: o.cap200,
        cap300: o.cap300,
        cap123: o.cap123,
    };
}
function parsePatchBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(o, "academicTermId")) {
        if (typeof o.academicTermId !== "string" || !o.academicTermId.trim()) {
            return null;
        }
        patch.academicTermId = o.academicTermId.trim();
    }
    if (Object.prototype.hasOwnProperty.call(o, "weekday")) {
        if (typeof o.weekday !== "string")
            return null;
        patch.weekday = o.weekday;
    }
    if (Object.prototype.hasOwnProperty.call(o, "timeFrom")) {
        if (typeof o.timeFrom !== "string")
            return null;
        patch.timeFrom = o.timeFrom;
    }
    if (Object.prototype.hasOwnProperty.call(o, "timeTo")) {
        if (typeof o.timeTo !== "string")
            return null;
        patch.timeTo = o.timeTo;
    }
    if (Object.prototype.hasOwnProperty.call(o, "slot")) {
        if (typeof o.slot !== "string")
            return null;
        patch.slot = o.slot;
    }
    if (Object.prototype.hasOwnProperty.call(o, "instructorId")) {
        if (o.instructorId === null) {
            patch.instructorId = null;
        }
        else if (typeof o.instructorId === "string") {
            patch.instructorId = o.instructorId;
        }
        else {
            return null;
        }
    }
    if (Object.prototype.hasOwnProperty.call(o, "instructor")) {
        if (typeof o.instructor !== "string")
            return null;
        patch.instructor = o.instructor;
    }
    for (const key of ["cap100", "cap200", "cap300", "cap123"]) {
        if (Object.prototype.hasOwnProperty.call(o, key)) {
            patch[key] = o[key];
        }
    }
    return patch;
}
/**
 * GET /api/admin/clinical/slots
 * Optional query: `academicTermId` or `academic_term_id` (portal academic_terms.id).
 */
export async function getAdminClinicalSlotsHandler(req, res) {
    try {
        const academicTermId = parseQueryAcademicTermId(req);
        const slots = await listAdminClinicalSlots({
            academicTermId,
        });
        res.json(slots);
    }
    catch (e) {
        if (e instanceof AdminClinicalSlotError) {
            res.status(e.status).json({ error: e.message });
            return;
        }
        console.error("[admin/clinical/slots] list failed:", e);
        const body = {
            error: "Failed to load clinical slots",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * POST /api/admin/clinical/slots
 */
export async function postAdminClinicalSlotHandler(req, res) {
    try {
        const input = parseCreateBody(req.body);
        if (!input) {
            res.status(400).json({
                error: "Invalid body: require academicTermId, weekday, timeFrom, timeTo, slot; optional instructor (blank or TBA), instructorId, cap100–cap123.",
            });
            return;
        }
        const slot = await createAdminClinicalSlot(input);
        res.status(201).json(slot);
    }
    catch (e) {
        if (e instanceof AdminClinicalSlotError) {
            res.status(e.status).json({ error: e.message });
            return;
        }
        console.error("[admin/clinical/slots] create failed:", e);
        const body = {
            error: "Failed to create clinical slot",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * PATCH /api/admin/clinical/slots/:id
 */
export async function patchAdminClinicalSlotHandler(req, res) {
    try {
        const id = pathSlotId(req);
        if (!id) {
            res.status(400).json({ error: "Invalid slot id" });
            return;
        }
        const patch = parsePatchBody(req.body);
        if (!patch) {
            res.status(400).json({ error: "Invalid request body" });
            return;
        }
        const updated = await updateAdminClinicalSlot(id, patch);
        if (!updated) {
            res.status(404).json({ error: "Clinical slot not found" });
            return;
        }
        res.json(updated);
    }
    catch (e) {
        if (e instanceof AdminClinicalSlotError) {
            res.status(e.status).json({ error: e.message });
            return;
        }
        console.error("[admin/clinical/slots] update failed:", e);
        const body = {
            error: "Failed to update clinical slot",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * DELETE /api/admin/clinical/slots/:id
 */
export async function deleteAdminClinicalSlotHandler(req, res) {
    try {
        const id = pathSlotId(req);
        if (!id) {
            res.status(400).json({ error: "Invalid slot id" });
            return;
        }
        const forceDelete = parseForceDeleteQuery(req);
        const actor = parseForceDeleteActor(req);
        const result = await deleteAdminClinicalSlot(id, {
            forceDelete,
            actor,
        });
        if (!result.ok) {
            const msg = result.error;
            const notFound = msg === "Clinical slot not found.";
            res.status(notFound ? 404 : 400).json({ error: msg });
            return;
        }
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin/clinical/slots] delete failed:", e);
        const body = {
            error: "Failed to delete clinical slot",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=adminClinicalSlotController.js.map
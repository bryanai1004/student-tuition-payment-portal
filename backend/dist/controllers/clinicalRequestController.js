import { ClinicalScheduleValidationError, } from "../services/clinicalScheduleService.js";
import { approveClinicalRequestById, createStudentClinicalRequest, listAdminPendingClinicalRequestsApi, listStudentClinicalRequestsApi, rejectClinicalRequestById, } from "../services/clinicalRequestService.js";
function pathStudentId(req) {
    const v = req.params.studentId;
    if (Array.isArray(v))
        return (v[0] ?? "").trim();
    return (v ?? "").trim();
}
function readOptionalDecidedBy(body) {
    if (body == null || typeof body !== "object") {
        return null;
    }
    if (!Object.prototype.hasOwnProperty.call(body, "decidedBy")) {
        return null;
    }
    const v = body.decidedBy;
    if (v === null || v === undefined) {
        return null;
    }
    const s = String(v).trim();
    return s === "" ? null : s.slice(0, 255);
}
function pathRequestId(req) {
    const v = req.params.id;
    const raw = Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
    const n = Number(String(raw).trim());
    return Number.isFinite(n) ? n : NaN;
}
/**
 * POST /api/students/:studentId/clinical-requests
 * Body: { timetableId }
 */
export async function postStudentClinicalRequestHandler(req, res) {
    try {
        const sid = pathStudentId(req);
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const body = req.body;
        if (body == null || typeof body !== "object") {
            res.status(400).json({ error: "JSON body is required" });
            return;
        }
        const tidRaw = body.timetableId;
        const n = Number(tidRaw);
        if (!Number.isFinite(n) || n <= 0) {
            res.status(400).json({ error: "timetableId is required" });
            return;
        }
        const result = await createStudentClinicalRequest(sid, n);
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.status(201).json({ ok: true, id: result.id });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create clinical request" });
    }
}
/**
 * GET /api/students/:studentId/clinical-requests
 */
export async function getStudentClinicalRequestsHandler(req, res) {
    try {
        const sid = pathStudentId(req);
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const items = await listStudentClinicalRequestsApi(sid);
        res.json(items);
    }
    catch (e) {
        if (e instanceof ClinicalScheduleValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error(e);
        res.status(500).json({ error: "Failed to load clinical requests" });
    }
}
/**
 * GET /api/admin/clinical/requests
 */
export async function getAdminClinicalRequestsHandler(_req, res) {
    try {
        const items = await listAdminPendingClinicalRequestsApi();
        res.json(items);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to load clinical requests" });
    }
}
/**
 * POST /api/admin/clinical/requests/:id/approve
 */
export async function postApproveClinicalRequestHandler(req, res) {
    try {
        const id = pathRequestId(req);
        if (!Number.isFinite(id) || id <= 0) {
            res.status(400).json({ error: "Invalid request id" });
            return;
        }
        const body = req.body;
        const decidedBy = body != null && typeof body === "object"
            ? readOptionalDecidedBy(body)
            : null;
        const result = await approveClinicalRequestById(id, decidedBy);
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({
            ok: true,
            id: result.assignmentId,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to approve clinical request" });
    }
}
/**
 * POST /api/admin/clinical/requests/:id/reject
 */
export async function postRejectClinicalRequestHandler(req, res) {
    try {
        const id = pathRequestId(req);
        if (!Number.isFinite(id) || id <= 0) {
            res.status(400).json({ error: "Invalid request id" });
            return;
        }
        const body = req.body;
        const decidedBy = body != null && typeof body === "object"
            ? readOptionalDecidedBy(body)
            : null;
        const result = await rejectClinicalRequestById(id, decidedBy);
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to reject clinical request" });
    }
}
//# sourceMappingURL=clinicalRequestController.js.map
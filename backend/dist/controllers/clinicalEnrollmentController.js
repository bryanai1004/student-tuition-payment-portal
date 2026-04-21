import { env } from "../config/env.js";
import { adminDropClinicalEnrollmentForSlot, dropStudentClinicalEnrollment, enrollStudentInClinicalSlot, listAdminClinicalSlotRoster, listOpenClinicalSlotsForStudent, listStudentClinicalEnrollmentRows, } from "../services/clinicalEnrollmentService.js";
import { getStudentPortalClinicalBookingHold, reconcilePaidClinicalBookingPaymentHoldsForStudent, runClinicalBookingPaymentHoldCleanup, } from "../services/clinicalBookingPaymentHoldService.js";
import { ClinicalScheduleValidationError } from "../services/clinicalScheduleService.js";
import { getClinicTimetableById } from "../repositories/clinicalTimetableRepository.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function pathStudentId(req) {
    const v = req.params.studentId;
    if (Array.isArray(v))
        return (v[0] ?? "").trim();
    return (v ?? "").trim();
}
function pathEnrollmentId(req) {
    const v = req.params.enrollmentId;
    const raw = Array.isArray(v) ? v[0] : v;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
}
function pathTimetableId(req) {
    const v = req.params.timetableId;
    const raw = Array.isArray(v) ? v[0] : v;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
}
function parseOptQueryString(req, key) {
    const raw = req.query[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
function parseOptYearQuery(req) {
    const raw = req.query.year;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v.trim());
        return Number.isFinite(n) ? n : null;
    }
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    return null;
}
/**
 * GET /api/admin/clinical/slots/:timetableId/roster
 */
export async function getAdminClinicalSlotRosterHandler(req, res) {
    try {
        const tid = pathTimetableId(req);
        if (!Number.isInteger(tid) || tid <= 0) {
            res.status(400).json({ error: "Invalid timetable id" });
            return;
        }
        const slot = await getClinicTimetableById(tid);
        const rows = await listAdminClinicalSlotRoster(tid);
        console.info("[clinical-trace] admin clinical roster query", {
            studentId: null,
            termYear: slot != null ? `${slot.term.trim()} ${slot.year}` : "unknown",
            sourceTable: "clinical_enrollments LEFT JOIN students",
            sourceQuery: "clinicalEnrollmentRepository.listActiveClinicalRosterForTimetable",
            returnedRowCount: rows.length,
            timetableId: tid,
        });
        res.json(rows);
    }
    catch (e) {
        console.error("[admin clinical slot roster] failed:", e);
        const body = {
            error: "Failed to load clinical slot roster.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * DELETE /api/admin/clinical/slots/:timetableId/enrollments/:enrollmentId?studentId=
 */
export async function deleteAdminClinicalSlotEnrollmentHandler(req, res) {
    try {
        const tid = pathTimetableId(req);
        if (!Number.isInteger(tid) || tid <= 0) {
            res.status(400).json({ error: "Invalid timetable id" });
            return;
        }
        const eid = pathEnrollmentId(req);
        if (!Number.isFinite(eid) || eid <= 0) {
            res.status(400).json({ error: "Invalid enrollment id" });
            return;
        }
        const sid = parseOptQueryString(req, "studentId");
        if (sid == null || sid === "") {
            res.status(400).json({ error: "studentId query parameter is required" });
            return;
        }
        const result = await adminDropClinicalEnrollmentForSlot(tid, sid, eid);
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin clinical slot enrollment DELETE] failed:", e);
        const body = {
            error: "Could not remove student from this slot.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/students/:studentId/clinical-enrollments/open
 */
export async function getStudentOpenClinicalEnrollmentSlotsHandler(req, res) {
    try {
        const sid = pathStudentId(req);
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const term = parseOptQueryString(req, "term");
        const year = parseOptYearQuery(req);
        const rows = await listOpenClinicalSlotsForStudent(sid, { term, year });
        res.json(rows);
    }
    catch (e) {
        if (e instanceof ClinicalScheduleValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[clinical-enrollments/open] failed:", e);
        const body = {
            error: "Failed to load open clinic slots.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/students/:studentId/clinical-enrollments
 */
export async function getStudentClinicalEnrollmentsHandler(req, res) {
    try {
        const sid = pathStudentId(req);
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const term = parseOptQueryString(req, "term");
        const year = parseOptYearQuery(req);
        await reconcilePaidClinicalBookingPaymentHoldsForStudent(sid);
        const rows = await listStudentClinicalEnrollmentRows(sid, { term, year });
        const activeClinicalBookingHold = await getStudentPortalClinicalBookingHold(sid);
        const termYears = rows.map((r) => `${r.term} ${r.year}`);
        const uniqueTermYears = [...new Set(termYears)];
        console.info("[clinical-trace] student clinical enrollments query", {
            studentId: sid,
            termYear: term != null || year != null
                ? `${term ?? "*"} ${year ?? "*"}`
                : uniqueTermYears.length > 0
                    ? uniqueTermYears
                    : ["unknown"],
            sourceTable: "clinical_enrollments INNER JOIN clinic_timetable",
            sourceQuery: "clinicalEnrollmentRepository.listStudentClinicalEnrollments",
            returnedRowCount: rows.length,
        });
        console.info("[clinical-trace] student current booking hold query", {
            studentId: sid,
            termYear: activeClinicalBookingHold != null ? "derived-from-enrollment" : "none",
            sourceTable: "clinical_booking_payment_holds INNER JOIN clinical_enrollments",
            sourceQuery: "clinicalBookingPaymentHoldRepository.getUrgentActiveClinicalBookingHoldForStudentPortal",
            returnedRowCount: activeClinicalBookingHold != null ? 1 : 0,
            timetableId: activeClinicalBookingHold?.timetableId ?? null,
        });
        res.json({ enrollments: rows, activeClinicalBookingHold });
    }
    catch (e) {
        if (e instanceof ClinicalScheduleValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[clinical-enrollments] failed:", e);
        const body = {
            error: "Failed to load clinical enrollments.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * POST /api/students/:studentId/clinical-enrollments
 * Body: { timetableId: number, seatBucket?: '100'|'200'|'300'|'all' } — seatBucket required when the slot has per-bucket caps.
 */
export async function postStudentClinicalEnrollmentHandler(req, res) {
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
        const timetableId = typeof tidRaw === "number"
            ? tidRaw
            : typeof tidRaw === "string"
                ? Number(tidRaw.trim())
                : NaN;
        const seatBucketRaw = body.seatBucket !== undefined && body.seatBucket !== null
            ? body.seatBucket
            : body.seat_bucket;
        const result = await enrollStudentInClinicalSlot(sid, timetableId, seatBucketRaw);
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.status(201).json({
            ok: true,
            enrollmentId: result.enrollmentId,
            assignmentId: result.assignmentId,
            billingChargePosted: result.billingChargePosted,
        });
    }
    catch (e) {
        console.error("[clinical-enrollments POST] failed:", e);
        const body = {
            error: "Could not complete clinic enrollment.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * DELETE /api/students/:studentId/clinical-enrollments/:enrollmentId
 */
export async function deleteStudentClinicalEnrollmentHandler(req, res) {
    try {
        const sid = pathStudentId(req);
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const eid = pathEnrollmentId(req);
        if (!Number.isFinite(eid) || eid <= 0) {
            res.status(400).json({ error: "Invalid enrollment id" });
            return;
        }
        const result = await dropStudentClinicalEnrollment(sid, eid);
        if (!result.ok) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[clinical-enrollments DELETE] failed:", e);
        const body = {
            error: "Could not drop clinic enrollment.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * POST /api/admin/clinical/run-payment-hold-cleanup
 * Marks paid clinical booking holds and auto-drops overdue unpaid bookings (idempotent).
 */
export async function postAdminClinicalPaymentHoldCleanupHandler(_req, res) {
    try {
        const stats = await runClinicalBookingPaymentHoldCleanup();
        res.json(stats);
    }
    catch (e) {
        console.error("[admin/clinical/run-payment-hold-cleanup] failed:", e);
        const body = {
            error: "Failed to run clinical payment hold cleanup.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=clinicalEnrollmentController.js.map
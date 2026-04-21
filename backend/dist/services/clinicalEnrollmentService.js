import { pool } from "../lib/db.js";
import { insertPortalBillingAdjustment } from "../repositories/adminFinanceRepository.js";
import { clinicalBookingPaymentHoldsTableExists, insertClinicalBookingPaymentHold, cancelActiveClinicalBookingPaymentHoldsForEnrollmentPool, voidSystemClinicalChargesForEnrollmentPool, } from "../repositories/clinicalBookingPaymentHoldRepository.js";
import { getClinicTimetableById, } from "../repositories/clinicalTimetableRepository.js";
import { createClinicalEnrollment, dropClinicalEnrollment, getClinicalEnrollmentSlotBinding, listActiveClinicalRosterForTimetable, listAvailableClinicalEnrollmentSlots, listStudentClinicalEnrollments, } from "../repositories/clinicalEnrollmentRepository.js";
import { insertClinicalAssignment } from "../repositories/clinicalScheduleRepository.js";
import { buildClinicTimetableSlotLabel, buildTimetableClinicalAssignmentPayload, ClinicalScheduleValidationError, formatClinicTimeHm, } from "./clinicalScheduleService.js";
import { getStudentQuarterBalance } from "./studentLedgerService.js";
/**
 * Phase 2: flat fee for a new clinical timetable slot booking until per-slot pricing exists.
 * Single source for this placeholder amount (replace when `clinic_timetable` carries price).
 */
const CLINICAL_SLOT_BOOKING_CHARGE_USD = 150;
function roundClinicalBookingMoney(n) {
    return Math.round(n * 100) / 100;
}
function clinicalSlotBookingLedgerDescription(tt) {
    const slotLabel = buildClinicTimetableSlotLabel({
        weekday: tt.weekday,
        timeFrom: formatClinicTimeHm(tt.time_from),
        timeTo: formatClinicTimeHm(tt.time_to),
        slot: tt.slot,
        instructor: tt.instructor?.trim() ? tt.instructor.trim() : null,
    });
    const term = tt.term.trim();
    const y = tt.year;
    const raw = `Clinical booking — ${term} ${y} · ${slotLabel}`;
    return raw.length <= 255 ? raw : raw.slice(0, 252) + "...";
}
function normalizeQueryTerm(term) {
    if (term == null)
        return null;
    const t = String(term).trim();
    return t === "" ? null : t.slice(0, 20);
}
function normalizeQueryYear(year) {
    if (year == null || year === "")
        return null;
    const n = typeof year === "number" ? year : Number(String(year).trim());
    return Number.isFinite(n) ? n : null;
}
export async function listOpenClinicalSlotsForStudent(studentId, query) {
    const sid = String(studentId ?? "").trim();
    if (sid === "") {
        throw new ClinicalScheduleValidationError("Student id is required");
    }
    const term = normalizeQueryTerm(query?.term ?? null);
    const year = normalizeQueryYear(query?.year ?? null);
    const [slots, mine] = await Promise.all([
        listAvailableClinicalEnrollmentSlots({
            year,
            term,
        }),
        listStudentClinicalEnrollments(sid, {
            term,
            year,
        }),
    ]);
    const activeTimetableIds = new Set(mine
        .filter((r) => r.status.trim().toLowerCase() === "enrolled")
        .map((r) => r.timetableId));
    return slots.map((s) => ({
        ...s,
        alreadyEnrolled: activeTimetableIds.has(s.timetableId),
    }));
}
export async function listStudentClinicalEnrollmentRows(studentId, query) {
    const sid = String(studentId ?? "").trim();
    if (sid === "") {
        throw new ClinicalScheduleValidationError("Student id is required");
    }
    const term = normalizeQueryTerm(query?.term ?? null);
    const year = normalizeQueryYear(query?.year ?? null);
    return listStudentClinicalEnrollments(sid, { term, year });
}
function totalTimetableCaps(tt) {
    return (Math.max(0, Math.trunc(tt.cap_100)) +
        Math.max(0, Math.trunc(tt.cap_200)) +
        Math.max(0, Math.trunc(tt.cap_300)) +
        Math.max(0, Math.trunc(tt.cap_123)));
}
function normalizeSeatBucketFromBody(raw) {
    if (raw === undefined || raw === null || raw === "") {
        return null;
    }
    const s = String(raw).trim().toLowerCase();
    if (s === "100" || s === "200" || s === "300" || s === "all") {
        return s;
    }
    return "invalid";
}
export async function enrollStudentInClinicalSlot(studentId, timetableId, seatBucketFromRequest) {
    const sid = String(studentId ?? "").trim();
    if (sid === "") {
        return { ok: false, error: "Student id is required", status: 400 };
    }
    if (!Number.isFinite(timetableId) || timetableId <= 0) {
        return { ok: false, error: "timetableId is required", status: 400 };
    }
    const tt = await getClinicTimetableById(timetableId);
    if (tt == null) {
        return { ok: false, error: "Clinic slot not found.", status: 400 };
    }
    const term = tt.term.trim().slice(0, 20);
    const year = tt.year;
    if (term === "" || !Number.isFinite(year)) {
        return {
            ok: false,
            error: "This timetable row is missing a valid term or year.",
            status: 400,
        };
    }
    const bucketEnforced = totalTimetableCaps(tt) > 0;
    const normalized = normalizeSeatBucketFromBody(seatBucketFromRequest);
    if (normalized === "invalid") {
        return {
            ok: false,
            error: "seatBucket must be 100, 200, 300, or all.",
            status: 400,
        };
    }
    if (bucketEnforced && normalized == null) {
        return {
            ok: false,
            error: "seatBucket is required for this slot (100, 200, 300, or all).",
            status: 400,
        };
    }
    const result = await createClinicalEnrollment(sid, timetableId, term, year, bucketEnforced ? normalized : null, async (conn) => {
        const payload = buildTimetableClinicalAssignmentPayload(sid, tt, null);
        return insertClinicalAssignment(payload, conn);
    });
    if (!result.ok) {
        return { ok: false, error: result.error, status: 400 };
    }
    const shouldPostClinicalCharge = result.isNewEnrollmentRow || result.wasReactivation;
    if (!shouldPostClinicalCharge) {
        console.log("[HOLD_DEBUG] enrollStudentInClinicalSlot: hold path skipped (shouldPostClinicalCharge=false)", {
            studentId: sid,
            clinicalEnrollmentId: result.enrollmentId,
            isNewEnrollmentRow: result.isNewEnrollmentRow,
            wasReactivation: result.wasReactivation,
        });
    }
    let billingChargePosted = false;
    if (shouldPostClinicalCharge) {
        if (result.wasReactivation) {
            await voidSystemClinicalChargesForEnrollmentPool(result.enrollmentId);
            await cancelActiveClinicalBookingPaymentHoldsForEnrollmentPool(result.enrollmentId, "superseded");
        }
        const balanceBeforeCharge = await getStudentQuarterBalance(sid, term, year);
        const desc = clinicalSlotBookingLedgerDescription(tt);
        const amount = roundClinicalBookingMoney(CLINICAL_SLOT_BOOKING_CHARGE_USD);
        try {
            const adjustmentId = await insertPortalBillingAdjustment(pool, {
                studentExternalId: sid,
                term,
                year,
                description: desc,
                amount,
                category: "clinical",
                adjustmentSource: "system_clinical",
                clinicalEnrollmentId: result.enrollmentId,
            });
            billingChargePosted = true;
            const holdsTableOk = await clinicalBookingPaymentHoldsTableExists();
            console.log("[HOLD_DEBUG] enrollStudentInClinicalSlot: service-layer table-exists guard", { holdsTableOk });
            if (!holdsTableOk) {
                console.log("[HOLD_DEBUG] insertClinicalBookingPaymentHold not called: table missing per information_schema");
            }
            if (holdsTableOk) {
                console.log("[HOLD_DEBUG] immediately before insertClinicalBookingPaymentHold", {
                    studentId: sid,
                    clinicalEnrollmentId: result.enrollmentId,
                    billingAdjustmentId: adjustmentId,
                    term,
                    year,
                });
                try {
                    await insertClinicalBookingPaymentHold({
                        clinicalEnrollmentId: result.enrollmentId,
                        studentId: sid,
                        billingAdjustmentId: adjustmentId,
                        term,
                        year,
                        chargeAmount: amount,
                        balanceBeforeCharge,
                    });
                }
                catch (holdErr) {
                    console.error("[clinical enrollment] payment hold row insert failed after billing adjustment:", holdErr);
                }
            }
        }
        catch (e) {
            console.error("[clinical enrollment] portal billing adjustment failed after enroll:", e);
            const dropped = await dropClinicalEnrollment(sid, result.enrollmentId);
            if (!dropped.ok) {
                console.error("[clinical enrollment] billing failure and enrollment rollback failed", { studentId: sid, enrollmentId: result.enrollmentId });
                throw e instanceof Error ? e : new Error(String(e));
            }
            return {
                ok: false,
                error: "Your spot could not be billed, so the booking was cancelled. Please try again or contact the office.",
                status: 503,
            };
        }
    }
    return {
        ok: true,
        enrollmentId: result.enrollmentId,
        assignmentId: result.assignmentId,
        billingChargePosted,
    };
}
export async function listAdminClinicalSlotRoster(timetableId) {
    if (!Number.isFinite(timetableId) || timetableId <= 0) {
        return [];
    }
    return listActiveClinicalRosterForTimetable(timetableId);
}
/**
 * Admin removes a student from a slot: same non-destructive drop as student self-serve.
 * Verifies the enrollment belongs to the given timetable row.
 */
export async function adminDropClinicalEnrollmentForSlot(timetableId, studentId, enrollmentId) {
    const tid = Number(timetableId);
    if (!Number.isFinite(tid) || tid <= 0) {
        return { ok: false, error: "Invalid timetable id", status: 400 };
    }
    const sid = String(studentId ?? "").trim();
    if (sid === "") {
        return { ok: false, error: "Student id is required", status: 400 };
    }
    if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
        return { ok: false, error: "Invalid enrollment id", status: 400 };
    }
    const binding = await getClinicalEnrollmentSlotBinding(enrollmentId, sid);
    if (binding == null || binding.timetableId !== tid) {
        return {
            ok: false,
            error: "Enrollment not found for this slot.",
            status: 404,
        };
    }
    if (binding.status !== "enrolled") {
        return {
            ok: false,
            error: "This enrollment is not active.",
            status: 400,
        };
    }
    return dropStudentClinicalEnrollment(sid, enrollmentId);
}
export async function dropStudentClinicalEnrollment(studentId, enrollmentId) {
    const sid = String(studentId ?? "").trim();
    if (sid === "") {
        return { ok: false, error: "Student id is required", status: 400 };
    }
    if (!Number.isFinite(enrollmentId) || enrollmentId <= 0) {
        return { ok: false, error: "enrollmentId is required", status: 400 };
    }
    const result = await dropClinicalEnrollment(sid, enrollmentId);
    if (!result.ok) {
        return {
            ok: false,
            error: result.error,
            status: 400,
        };
    }
    return { ok: true };
}
//# sourceMappingURL=clinicalEnrollmentService.js.map
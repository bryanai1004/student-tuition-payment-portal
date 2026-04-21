import { pool } from "../lib/db.js";
import { insertPortalBillingAdjustment } from "../repositories/adminFinanceRepository.js";
import { buildClinicalProgress, clinicalProgressToBookingLevelKey, } from "./clinicalProgressService.js";
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
    const [slots, mine, progress] = await Promise.all([
        listAvailableClinicalEnrollmentSlots({
            year,
            term,
        }),
        listStudentClinicalEnrollments(sid, {
            term,
            year,
        }),
        buildClinicalProgress(pool, sid),
    ]);
    const activeTimetableIds = new Set(mine
        .filter((r) => r.status.trim().toLowerCase() === "enrolled")
        .map((r) => r.timetableId));
    const studentBookingLevel = clinicalProgressToBookingLevelKey(progress);
    return slots.map((s) => {
        const levelRem = studentBookingLevel === "100"
            ? s.remaining100
            : studentBookingLevel === "200"
                ? s.remaining200
                : s.remaining300;
        const allRem = s.remainingAll;
        const wouldBookIntoBucket = (() => {
            if (s.capacity == null || s.capacity <= 0) {
                return null;
            }
            const capL = studentBookingLevel === "100"
                ? s.capacity100
                : studentBookingLevel === "200"
                    ? s.capacity200
                    : s.capacity300;
            const usedL = studentBookingLevel === "100"
                ? s.enrolled100
                : studentBookingLevel === "200"
                    ? s.enrolled200
                    : s.enrolled300;
            if (capL > 0 && usedL < capL) {
                return studentBookingLevel;
            }
            if (s.capacityAll > 0 && s.enrolledAll < s.capacityAll) {
                return "all";
            }
            return null;
        })();
        const yourEffectiveRemaining = s.capacity == null || s.capacity <= 0
            ? null
            : Math.max(levelRem, 0) > 0
                ? Math.max(levelRem, 0)
                : Math.max(allRem, 0);
        return {
            ...s,
            alreadyEnrolled: activeTimetableIds.has(s.timetableId),
            studentBookingLevel,
            yourLevelBucketRemaining: levelRem,
            allLevelsBucketRemaining: allRem,
            yourEffectiveRemaining,
            wouldBookIntoBucket,
        };
    });
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
export async function enrollStudentInClinicalSlot(studentId, timetableId) {
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
    const progress = await buildClinicalProgress(pool, sid);
    const studentBookingLevel = clinicalProgressToBookingLevelKey(progress);
    const result = await createClinicalEnrollment(sid, timetableId, term, year, studentBookingLevel, async (conn) => {
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
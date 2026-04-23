import { pool } from "../lib/db.js";
import { getPostedToDashboardTerm } from "./academicTermService.js";
import { getAccountingLedgerPayload } from "./studentLedgerService.js";
import { chargeAuthorizeOpaqueData } from "./authorizeNetGatewayService.js";
import { recordAuthorizeNetPayment } from "../repositories/studentAuthorizePaymentRepository.js";
import { hasSystemLateFeeForQuarter, insertSystemLateFee, LATE_FEE_DESCRIPTION, } from "../repositories/adminFinanceRepository.js";
import { reconcileExpiredClinicalBookingHoldsForStudent } from "./clinicalBookingPaymentHoldService.js";
import { getLatestClinicalBookingPaymentHoldStatusForStudentQuarter } from "../repositories/clinicalBookingPaymentHoldRepository.js";
function roundMoney(n) {
    return Math.round(n * 100) / 100;
}
function parseChargeType(raw) {
    const v = String(raw ?? "tuition").trim().toLowerCase();
    if (v === "tuition" ||
        v === "clinic_fee" ||
        v === "exam_fee" ||
        v === "late_fee") {
        return v;
    }
    return null;
}
function parsePaymentPlan(raw) {
    const v = String(raw ?? "full").trim().toLowerCase();
    if (v === "full" || v === "installment") {
        return v;
    }
    return null;
}
function parseInstallmentCount(raw) {
    const n = typeof raw === "number" ? raw
        : typeof raw === "string" ? Number(raw)
            : Number.NaN;
    if (!Number.isFinite(n))
        return null;
    const whole = Math.trunc(n);
    if (whole === 1 || whole === 2 || whole === 3)
        return whole;
    return null;
}
function isInstallmentEligible(chargeType) {
    return chargeType === "tuition";
}
function isoToday() {
    return new Date().toISOString().slice(0, 10);
}
function normalizeTermName(raw) {
    const t = raw.trim().toUpperCase();
    if (t.startsWith("SPR"))
        return "SPRING";
    if (t.startsWith("SUM"))
        return "SUMMER";
    if (t.startsWith("FAL"))
        return "FALL";
    if (t.startsWith("WIN"))
        return "WINTER";
    return t;
}
function parseTermCode(raw) {
    const input = raw.trim();
    const coded = /^(\d{4})\s*[-_/]\s*([a-zA-Z]+)$/.exec(input);
    if (coded) {
        const year = Number(coded[1]);
        const code = coded[2].trim().toUpperCase();
        const term = code.startsWith("SPR") ? "Spring"
            : code.startsWith("SUM") ? "Summer"
                : code.startsWith("FAL") ? "Fall"
                    : code.startsWith("WIN") ? "Winter"
                        : "";
        if (term && Number.isFinite(year)) {
            return { term, year: Math.trunc(year), termCode: `${Math.trunc(year)}-${code.slice(0, 3)}` };
        }
    }
    const plain = /^([a-zA-Z]+)\s+(\d{4})$/.exec(input);
    if (plain) {
        const year = Number(plain[2]);
        const token = plain[1].trim().toUpperCase();
        const term = token.startsWith("SPR") ? "Spring"
            : token.startsWith("SUM") ? "Summer"
                : token.startsWith("FAL") ? "Fall"
                    : token.startsWith("WIN") ? "Winter"
                        : "";
        const suffix = token.startsWith("SPR") ? "SPR"
            : token.startsWith("SUM") ? "SUM"
                : token.startsWith("FAL") ? "FAL"
                    : token.startsWith("WIN") ? "WIN"
                        : "";
        if (term && suffix && Number.isFinite(year)) {
            return { term, year: Math.trunc(year), termCode: `${Math.trunc(year)}-${suffix}` };
        }
    }
    return null;
}
function roundToMoney(v) {
    return Math.round(v * 100) / 100;
}
function isExamFeeMemo(memo) {
    return /exam\s*fee|exam/i.test(memo);
}
function isClinicChargeRow(args) {
    const type = args.type.trim().toLowerCase();
    const code = args.code.trim().toLowerCase();
    const memo = args.memo.trim().toLowerCase();
    const sourceType = String(args.sourceType ?? "")
        .trim()
        .toLowerCase();
    if (type === "clinical")
        return true;
    if (sourceType === "system" &&
        type === "adjustment" &&
        /\bclinical\b/.test(memo)) {
        return true;
    }
    if (/(clinic|clinical)/.test(code))
        return true;
    return /(clinic\s*(fee|insurance|insurances)|clinical\s*(fee|booking|appointment|slot|enrollment|request))/i.test(memo);
}
function isLateFeeRow(args) {
    if (String(args.sourceType ?? "").trim().toLowerCase() === "auto_late_fee") {
        return true;
    }
    return new RegExp(`^${LATE_FEE_DESCRIPTION}$`, "i").test(args.memo.trim());
}
function inferPaymentChargeTypeFromMemo(memo) {
    const m = memo.trim().toLowerCase();
    const explicit = /authorize\.net\s+(tuition|clinic_fee|exam_fee|late_fee)\b/.exec(m);
    if (explicit) {
        return explicit[1];
    }
    if (/\btuition\b/.test(m))
        return "tuition";
    if (/clinic/.test(m))
        return "clinic_fee";
    if (/exam/.test(m))
        return "exam_fee";
    if (/late\s*payment\s*fee|late\s*fee/.test(m))
        return "late_fee";
    return null;
}
function buildTermBucket(type, term, amount, paid, dueDate) {
    const safeAmount = roundToMoney(Math.max(0, amount));
    const safePaid = roundToMoney(Math.max(0, Math.min(safeAmount, paid)));
    const amountDue = roundToMoney(Math.max(0, safeAmount - safePaid));
    return {
        type,
        term,
        amount: safeAmount,
        amountPaid: safePaid,
        amountDue,
        status: amountDue > 0 ? "pending" : "paid",
        dueDate,
        isInstallmentEligible: isInstallmentEligible(type),
    };
}
function summarizeTermChargesFromLedger(rows) {
    const chargeTotals = {
        tuition: 0,
        clinic_fee: 0,
        exam_fee: 0,
        late_fee: 0,
    };
    const paymentTotals = {
        tuition: 0,
        clinic_fee: 0,
        exam_fee: 0,
        late_fee: 0,
    };
    let totalCredits = 0;
    for (const row of rows) {
        const debit = roundToMoney(Math.max(0, Number(row.debit) || 0));
        const credit = roundToMoney(Math.max(0, Number(row.credit) || 0));
        const memo = String(row.memo ?? "").trim();
        const type = String(row.type ?? "").trim();
        const code = String(row.code ?? "").trim();
        if (debit > 0) {
            if (isLateFeeRow({ type, memo, sourceType: row.sourceType })) {
                chargeTotals.late_fee = roundToMoney(chargeTotals.late_fee + debit);
            }
            else if (isExamFeeMemo(memo)) {
                chargeTotals.exam_fee = roundToMoney(chargeTotals.exam_fee + debit);
            }
            else if (isClinicChargeRow({
                type,
                code,
                memo,
                sourceType: row.sourceType,
            })) {
                chargeTotals.clinic_fee = roundToMoney(chargeTotals.clinic_fee + debit);
            }
            else if (type.toLowerCase() === "tuition") {
                chargeTotals.tuition = roundToMoney(chargeTotals.tuition + debit);
            }
        }
        if (credit > 0) {
            totalCredits = roundToMoney(totalCredits + credit);
            const inferred = inferPaymentChargeTypeFromMemo(memo);
            if (inferred != null) {
                paymentTotals[inferred] = roundToMoney(paymentTotals[inferred] + credit);
            }
        }
    }
    const typedPayments = roundToMoney(paymentTotals.tuition +
        paymentTotals.clinic_fee +
        paymentTotals.exam_fee +
        paymentTotals.late_fee);
    return {
        chargeTotals,
        paymentTotals,
        unassignedPayments: roundToMoney(Math.max(0, totalCredits - typedPayments)),
    };
}
function distributeUnassignedPayments(chargeTotals, paymentTotals, unassignedPayments) {
    const paid = {
        tuition: 0,
        clinic_fee: 0,
        exam_fee: 0,
        late_fee: 0,
    };
    let carry = roundToMoney(Math.max(0, unassignedPayments));
    const order = [
        "tuition",
        "clinic_fee",
        "exam_fee",
        "late_fee",
    ];
    for (const key of order) {
        const target = roundToMoney(Math.max(0, chargeTotals[key]));
        if (target <= 0)
            continue;
        const direct = roundToMoney(Math.max(0, paymentTotals[key]));
        const remainingAfterDirect = roundToMoney(Math.max(0, target - direct));
        const allocation = roundToMoney(Math.min(remainingAfterDirect, carry));
        carry = roundToMoney(Math.max(0, carry - allocation));
        paid[key] = roundToMoney(Math.min(target, direct + allocation));
    }
    return paid;
}
function resolvePaymentDeadlineForSummary(args) {
    if (args.postedTerm == null)
        return null;
    if (Math.trunc(args.postedTerm.year) !== Math.trunc(args.year))
        return null;
    const target = normalizeTermName(args.term);
    const posted = normalizeTermName(args.postedTerm.term_name);
    if (target !== posted)
        return null;
    return args.postedTerm.payment_due_date;
}
function deadlineHasPassed(deadline) {
    const due = typeof deadline === "string" ? deadline.trim() : "";
    if (due === "")
        return false;
    return isoToday() > due;
}
async function resolveClinicFeeStatus(args) {
    const totalAssessed = roundToMoney(Math.max(0, args.amount));
    const remainingDue = roundToMoney(Math.max(0, args.amountDue));
    if (totalAssessed <= 0) {
        // No clinic fee charge exists for this term; do not treat as paid by default.
        return "pending";
    }
    if (remainingDue <= 0) {
        return "paid";
    }
    if (!deadlineHasPassed(args.paymentDeadline)) {
        return "pending";
    }
    await reconcileExpiredClinicalBookingHoldsForStudent(args.studentId);
    const latestHoldStatus = await getLatestClinicalBookingPaymentHoldStatusForStudentQuarter(args.studentId, args.term, args.year);
    if (latestHoldStatus === "expired_auto_dropped" ||
        latestHoldStatus === "cancelled_enrollment_inactive") {
        return "registration_cancelled";
    }
    return "expired";
}
export async function evaluateLateFeeForCurrentTerm(studentId, term, year, paymentDeadline) {
    const due = typeof paymentDeadline === "string" ? paymentDeadline.trim() : "";
    if (due === "" || isoToday() <= due)
        return false;
    const ledger = await getAccountingLedgerPayload(studentId, term, year);
    if (!ledger)
        return false;
    const summarized = summarizeTermChargesFromLedger(ledger.rows);
    const paid = distributeUnassignedPayments(summarized.chargeTotals, summarized.paymentTotals, summarized.unassignedPayments);
    const requiredDue = roundToMoney(Math.max(0, summarized.chargeTotals.tuition - paid.tuition));
    if (requiredDue <= 0)
        return false;
    const exists = await hasSystemLateFeeForQuarter(pool, studentId, term, year);
    if (exists)
        return false;
    await insertSystemLateFee(pool, {
        studentExternalId: studentId,
        term,
        year,
        amount: 30,
    });
    return true;
}
async function buildCurrentTermBillingSummary(args) {
    const ledger = await getAccountingLedgerPayload(args.studentId, args.term, args.year);
    const rows = ledger?.rows ?? [];
    const summarized = summarizeTermChargesFromLedger(rows);
    const paid = distributeUnassignedPayments(summarized.chargeTotals, summarized.paymentTotals, summarized.unassignedPayments);
    const tuitionCharge = buildTermBucket("tuition", args.term, summarized.chargeTotals.tuition, paid.tuition, args.paymentDeadline);
    const clinicFeeCharge = buildTermBucket("clinic_fee", args.term, summarized.chargeTotals.clinic_fee, paid.clinic_fee, args.paymentDeadline);
    const examFeeCharge = buildTermBucket("exam_fee", args.term, summarized.chargeTotals.exam_fee, paid.exam_fee, args.paymentDeadline);
    const lateFeeCharge = buildTermBucket("late_fee", args.term, summarized.chargeTotals.late_fee, paid.late_fee, isoToday());
    const clinicFeeStatus = await resolveClinicFeeStatus({
        studentId: args.studentId,
        term: args.term,
        year: args.year,
        amount: clinicFeeCharge.amount,
        amountDue: clinicFeeCharge.amountDue,
        paymentDeadline: args.paymentDeadline,
    });
    const requiredBalanceDue = roundToMoney(tuitionCharge.amountDue + clinicFeeCharge.amountDue + examFeeCharge.amountDue);
    const totalBalanceDue = roundToMoney(requiredBalanceDue + lateFeeCharge.amountDue);
    return {
        term: args.term,
        year: args.year,
        paymentDeadline: args.paymentDeadline,
        tuitionCharge,
        clinicFeeCharge,
        clinicFeeStatus,
        examFeeCharge,
        lateFeeCharge,
        requiredBalanceDue,
        totalBalanceDue,
    };
}
export async function getCurrentTermBillingSummary(input) {
    const parsed = parseTermCode(input.termInput);
    if (!parsed) {
        throw new Error("term must be in `YYYY-TERM` format (example: 2027-SPR).");
    }
    const postedTerm = await getPostedToDashboardTerm();
    const paymentDeadline = resolvePaymentDeadlineForSummary({
        term: parsed.term,
        year: parsed.year,
        postedTerm,
    });
    const createdLateFee = await evaluateLateFeeForCurrentTerm(input.studentId, parsed.term, parsed.year, paymentDeadline);
    const summary = await buildCurrentTermBillingSummary({
        studentId: input.studentId,
        term: parsed.term,
        year: parsed.year,
        paymentDeadline,
    });
    if (!createdLateFee)
        return summary;
    return buildCurrentTermBillingSummary({
        studentId: input.studentId,
        term: parsed.term,
        year: parsed.year,
        paymentDeadline,
    });
}
export async function getTuitionOnlyBillingSummary(input) {
    const summary = await getCurrentTermBillingSummary(input);
    return {
        term: summary.term,
        year: summary.year,
        paymentDeadline: summary.paymentDeadline,
        tuitionCharge: summary.tuitionCharge,
        lateFeeCharge: summary.lateFeeCharge,
        examFeeCharge: summary.examFeeCharge,
        tuitionTotalDue: roundToMoney(summary.tuitionCharge.amountDue + summary.lateFeeCharge.amountDue),
    };
}
export async function getClinicFeeBillingSummary(input) {
    const summary = await getCurrentTermBillingSummary(input);
    return {
        term: summary.term,
        year: summary.year,
        paymentDeadline: summary.paymentDeadline,
        clinicFeeCharge: summary.clinicFeeCharge,
        clinicFeeStatus: summary.clinicFeeStatus,
    };
}
function invoiceNumberFor(studentId) {
    const sid = studentId.trim().replace(/[^a-zA-Z0-9]/g, "").slice(-10) || "STD";
    const stamp = Date.now().toString(36).toUpperCase();
    return `MYAMU-${sid}-${stamp}`.slice(0, 20);
}
function referenceIdFor(studentId) {
    const sid = studentId.trim().replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "STD";
    const stamp = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
    return `REF-${sid}-${stamp}`.slice(0, 20);
}
export function parseAuthorizeChargeBody(raw) {
    if (raw == null || typeof raw !== "object") {
        return { ok: false, error: "Request body must be a JSON object." };
    }
    const o = raw;
    const term = typeof o.term === "string" ? o.term.trim() : "";
    const amountRaw = o.amount;
    const amount = typeof amountRaw === "number" ? amountRaw
        : typeof amountRaw === "string" ? Number(amountRaw)
            : Number.NaN;
    const chargeType = parseChargeType(o.chargeType);
    const paymentPlan = parsePaymentPlan(o.paymentPlan);
    const parsedInstallmentCount = parseInstallmentCount(o.installmentCount);
    const installmentCount = parsedInstallmentCount ?? 3;
    const opaque = o.opaqueData;
    if (term === "") {
        return { ok: false, error: "term is required." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "amount must be a number greater than 0." };
    }
    if (chargeType == null) {
        return {
            ok: false,
            error: "chargeType must be tuition, clinic_fee, exam_fee, or late_fee.",
        };
    }
    if (paymentPlan == null) {
        return { ok: false, error: "paymentPlan must be full or installment." };
    }
    if (paymentPlan === "installment" && !isInstallmentEligible(chargeType)) {
        return {
            ok: false,
            error: "Installment plans are only available for tuition charges.",
        };
    }
    if (paymentPlan === "installment" &&
        o.installmentCount != null &&
        parsedInstallmentCount == null) {
        return { ok: false, error: "installmentCount must be 1, 2, or 3." };
    }
    if (opaque == null || typeof opaque !== "object") {
        return { ok: false, error: "opaqueData is required." };
    }
    const descriptor = String(opaque.dataDescriptor ?? "").trim();
    const value = String(opaque.dataValue ?? "").trim();
    if (!descriptor || !value) {
        return {
            ok: false,
            error: "opaqueData must include dataDescriptor and dataValue.",
        };
    }
    return {
        ok: true,
        value: {
            term,
            amount: roundMoney(amount),
            chargeType,
            paymentPlan,
            installmentCount: paymentPlan === "installment" ? installmentCount : 1,
            opaqueData: {
                dataDescriptor: descriptor,
                dataValue: value,
            },
        },
    };
}
export async function processAuthorizeNetStudentPayment(input) {
    const parsedTerm = parseTermCode(input.termInput);
    if (!parsedTerm) {
        throw new Error("term must be in `YYYY-TERM` format (example: 2027-SPR).");
    }
    const amount = roundMoney(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Payment amount must be greater than 0.");
    }
    if (input.paymentPlan === "installment" && !isInstallmentEligible(input.chargeType)) {
        throw new Error("Installment plans are only available for tuition charges.");
    }
    const summary = await getCurrentTermBillingSummary({
        studentId: input.studentId,
        termInput: input.termInput,
    });
    const selectedDue = input.chargeType === "tuition"
        ? summary.tuitionCharge.amountDue
        : input.chargeType === "clinic_fee"
            ? summary.clinicFeeCharge.amountDue
            : input.chargeType === "exam_fee"
                ? summary.examFeeCharge.amountDue
                : summary.lateFeeCharge.amountDue;
    const maxAllowedForCharge = input.chargeType === "tuition" && input.paymentPlan === "installment"
        ? roundToMoney(selectedDue + 15)
        : selectedDue;
    if (selectedDue <= 0) {
        throw new Error("There is no outstanding balance for the selected charge.");
    }
    if (amount > maxAllowedForCharge) {
        throw new Error("Payment amount cannot exceed the amount due for this charge.");
    }
    const invoiceNumber = invoiceNumberFor(input.studentId);
    const referenceId = referenceIdFor(input.studentId);
    const charged = await chargeAuthorizeOpaqueData({
        amount,
        opaqueData: input.opaqueData,
        invoiceNumber,
        referenceId,
        studentId: input.studentId,
        termCode: parsedTerm.termCode,
    });
    await recordAuthorizeNetPayment({
        studentId: input.studentId,
        term: parsedTerm.term,
        year: parsedTerm.year,
        amount,
        paidAt: new Date().toISOString().slice(0, 10),
        method: "authorize_net",
        description: input.paymentPlan === "installment"
            ? `Authorize.net ${input.chargeType} installment ${input.installmentCount} payment ${charged.transactionId}`.slice(0, 255)
            : `Authorize.net ${input.chargeType} payment ${charged.transactionId}`.slice(0, 255),
        providerTransactionId: charged.transactionId,
        invoiceNumber,
        status: "succeeded",
    });
    return {
        amount: amount.toFixed(2),
        providerTransactionId: charged.transactionId,
        invoiceNumber,
    };
}
//# sourceMappingURL=studentAuthorizePaymentService.js.map
import { pool } from "../lib/db.js";
import { academicTermsPaymentDueDateColumnExists, deleteManualBillingAdjustment, deletePortalPayment, getBillingAdjustmentById, getFinanceQuarterDdlFromAcademicTerms, getPortalPaymentById, insertPortalBillingAdjustment, insertPortalPayment, insertSystemLateFee, insertSystemLateFeeReversal, listAdminFinanceRosterPage, countAdminFinanceRosterPage, listGlobalFinanceQuarters, listSystemLateFeeRowsForQuarter, listStudentIdsWithPortalQuarterActivity, setFinanceQuarterDdlOnAcademicTerms, updateManualBillingAdjustment, updatePortalPayment, } from "../repositories/adminFinanceRepository.js";
import { loadLegacyAccountingRows } from "../repositories/studentLegacyAccountRepository.js";
import { getAccountingLedgerPayload, getAccountingQuartersPayload, } from "./studentLedgerService.js";
import { isPastSchoolLocalDueDate } from "../lib/schoolLocalDate.js";
import { isClinicBucketCharge, isExamFeeMemo, isLateFeeRow, isTuitionBucketCharge, } from "./billingChargeBuckets.js";
const CHARGE_CATEGORIES = [
    "fees",
    "other",
    "tuition",
    "clinical",
];
function roundMoney(n) {
    return Math.round(n * 100) / 100;
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
        const debit = roundMoney(Math.max(0, Number(row.debit) || 0));
        const credit = roundMoney(Math.max(0, Number(row.credit) || 0));
        const memo = String(row.memo ?? "").trim();
        const type = String(row.type ?? "").trim();
        const code = String(row.code ?? "").trim();
        if (debit > 0) {
            if (isLateFeeRow({ type, memo, sourceType: row.sourceType })) {
                chargeTotals.late_fee = roundMoney(chargeTotals.late_fee + debit);
            }
            else if (isExamFeeMemo(memo)) {
                chargeTotals.exam_fee = roundMoney(chargeTotals.exam_fee + debit);
            }
            else if (isClinicBucketCharge({
                type,
                code,
                memo,
                sourceType: row.sourceType,
            })) {
                chargeTotals.clinic_fee = roundMoney(chargeTotals.clinic_fee + debit);
            }
            else if (isTuitionBucketCharge({
                type,
                code,
                memo,
                sourceType: row.sourceType,
            })) {
                chargeTotals.tuition = roundMoney(chargeTotals.tuition + debit);
            }
        }
        if (credit > 0) {
            totalCredits = roundMoney(totalCredits + credit);
            const inferred = inferPaymentChargeTypeFromMemo(memo);
            if (inferred != null) {
                paymentTotals[inferred] = roundMoney(paymentTotals[inferred] + credit);
            }
        }
    }
    const typedPayments = roundMoney(paymentTotals.tuition +
        paymentTotals.clinic_fee +
        paymentTotals.exam_fee +
        paymentTotals.late_fee);
    return {
        chargeTotals,
        paymentTotals,
        unassignedPayments: roundMoney(Math.max(0, totalCredits - typedPayments)),
    };
}
function distributeUnassignedPayments(chargeTotals, paymentTotals, unassignedPayments) {
    const paid = {
        tuition: 0,
        clinic_fee: 0,
        exam_fee: 0,
        late_fee: 0,
    };
    let carry = roundMoney(Math.max(0, unassignedPayments));
    const order = [
        "tuition",
        "clinic_fee",
        "exam_fee",
        "late_fee",
    ];
    for (const key of order) {
        const target = roundMoney(Math.max(0, chargeTotals[key]));
        if (target <= 0)
            continue;
        const direct = roundMoney(Math.max(0, paymentTotals[key]));
        const remainingAfterDirect = roundMoney(Math.max(0, target - direct));
        const allocation = roundMoney(Math.min(remainingAfterDirect, carry));
        carry = roundMoney(Math.max(0, carry - allocation));
        paid[key] = roundMoney(Math.min(target, direct + allocation));
    }
    return paid;
}
function formatQuarterLabel(term, year) {
    const t = term.trim();
    if (t.length === 0)
        return String(year);
    const head = t.slice(0, 1).toUpperCase();
    const tail = t.slice(1).toLowerCase();
    return `${head}${tail} ${year}`;
}
export async function listGlobalQuartersPayload() {
    const pairs = await listGlobalFinanceQuarters(pool);
    return {
        quarters: pairs.map((p) => ({
            term: p.term,
            year: p.year,
            label: formatQuarterLabel(p.term, p.year),
        })),
    };
}
export async function getQuarterSettingsPayload(term, year) {
    const y = Math.trunc(year);
    const t = term.trim();
    const hasCol = await academicTermsPaymentDueDateColumnExists(pool);
    const { paymentDueDate, rowExists } = await getFinanceQuarterDdlFromAcademicTerms(pool, t, y);
    const ddlPersistenceAvailable = hasCol && rowExists;
    let ddlSaveNote = null;
    if (!ddlPersistenceAvailable) {
        if (!hasCol) {
            ddlSaveNote =
                "Payment DDL persistence is not yet enabled on academic terms.";
        }
        else {
            ddlSaveNote =
                "No matching academic term row for this quarter. Create it under Academic Terms before saving a payment due date.";
        }
    }
    return {
        term: t,
        year: y,
        paymentDueDate,
        lateFeeEnabled: true,
        lateFeeAmount: 30,
        ddlPersistenceAvailable,
        ddlSaveNote,
    };
}
async function evaluateLateFeeEligibility(studentId, term, year, paymentDueDate) {
    const due = paymentDueDate?.trim() ?? "";
    if (due === "") {
        return {
            eligible: false,
            tuitionOutstanding: 0,
            lateFeeOutstanding: 0,
            reason: "missing_due_date",
        };
    }
    if (!isPastSchoolLocalDueDate(due)) {
        return {
            eligible: false,
            tuitionOutstanding: 0,
            lateFeeOutstanding: 0,
            reason: "due_date_not_passed",
        };
    }
    const legacy = await loadLegacyAccountingRows(pool, studentId, term, year);
    if (legacy.length > 0) {
        return {
            eligible: false,
            tuitionOutstanding: 0,
            lateFeeOutstanding: 0,
            reason: "legacy_accounting_exists",
        };
    }
    const ledger = await getAccountingLedgerPayload(studentId, term, year, {
        skipExpiredClinicalBookingReconciliation: true,
        skipLateFeeEvaluation: true,
    });
    const rows = ledger?.rows ?? [];
    const summarized = summarizeTermChargesFromLedger(rows);
    const paid = distributeUnassignedPayments(summarized.chargeTotals, summarized.paymentTotals, summarized.unassignedPayments);
    const tuitionOutstanding = roundMoney(Math.max(0, summarized.chargeTotals.tuition - paid.tuition));
    const lateFeeOutstanding = roundMoney(Math.max(0, summarized.chargeTotals.late_fee - paid.late_fee));
    if (tuitionOutstanding <= 0) {
        return {
            eligible: false,
            tuitionOutstanding,
            lateFeeOutstanding,
            reason: "no_outstanding_tuition",
        };
    }
    return {
        eligible: true,
        tuitionOutstanding,
        lateFeeOutstanding,
        reason: "eligible",
    };
}
export async function previewLateFeeReconciliationForQuarter(term, year, paymentDueDateOverride) {
    const t = term.trim();
    const y = Math.trunc(year);
    const current = await getFinanceQuarterDdlFromAcademicTerms(pool, t, y);
    const dueDate = paymentDueDateOverride === undefined
        ? current.paymentDueDate
        : paymentDueDateOverride;
    const studentIds = await listStudentIdsWithPortalQuarterActivity(pool, t, y);
    const feeRows = await listSystemLateFeeRowsForQuarter(pool, t, y);
    const activeByStudent = new Map();
    for (const row of feeRows) {
        if (row.activeAmount <= 0)
            continue;
        const key = row.studentExternalId.trim();
        const arr = activeByStudent.get(key) ?? [];
        arr.push(row);
        activeByStudent.set(key, arr);
    }
    let wouldAddSystemLateFeeCount = 0;
    let wouldReverseInvalidSystemLateFeeCount = 0;
    let wouldRequireManualReviewCount = 0;
    let sampleReversalStudentId = null;
    for (const studentId of studentIds) {
        const eligible = await evaluateLateFeeEligibility(studentId, t, y, dueDate);
        const activeFees = activeByStudent.get(studentId) ?? [];
        if (eligible.eligible) {
            if (activeFees.length === 0) {
                wouldAddSystemLateFeeCount += 1;
            }
            continue;
        }
        if (activeFees.length === 0)
            continue;
        if (eligible.lateFeeOutstanding > 0) {
            wouldReverseInvalidSystemLateFeeCount += activeFees.length;
            if (sampleReversalStudentId == null) {
                sampleReversalStudentId = studentId;
            }
        }
        else {
            wouldRequireManualReviewCount += activeFees.length;
        }
    }
    return {
        term: t,
        year: y,
        paymentDueDate: dueDate,
        studentsScanned: studentIds.length,
        wouldAddSystemLateFeeCount,
        wouldReverseInvalidSystemLateFeeCount,
        wouldRequireManualReviewCount,
        sampleReversalStudentId,
    };
}
export async function reconcileLateFeesForQuarter(term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const { paymentDueDate } = await getFinanceQuarterDdlFromAcademicTerms(pool, t, y);
    const studentIds = await listStudentIdsWithPortalQuarterActivity(pool, t, y);
    const allFeeRows = await listSystemLateFeeRowsForQuarter(pool, t, y);
    const activeByStudent = new Map();
    for (const row of allFeeRows) {
        if (row.activeAmount <= 0)
            continue;
        const key = row.studentExternalId.trim();
        const arr = activeByStudent.get(key) ?? [];
        arr.push(row);
        activeByStudent.set(key, arr);
    }
    let insertedCount = 0;
    let reversedCount = 0;
    let protectedSettledCount = 0;
    let skippedCount = 0;
    let sampleReversal = null;
    const feeAmount = roundMoney(30);
    for (const studentId of studentIds) {
        const eligibility = await evaluateLateFeeEligibility(studentId, t, y, paymentDueDate);
        const activeFees = [...(activeByStudent.get(studentId) ?? [])].sort((a, b) => a.id - b.id);
        if (eligibility.eligible) {
            if (activeFees.length === 0) {
                await insertSystemLateFee(pool, {
                    studentExternalId: studentId,
                    term: t,
                    year: y,
                    amount: feeAmount,
                });
                insertedCount += 1;
            }
            else if (activeFees.length > 1) {
                let reversibleRemaining = roundMoney(Math.max(0, eligibility.lateFeeOutstanding - activeFees[0].activeAmount));
                for (const fee of activeFees.slice(1)) {
                    if (reversibleRemaining <= 0) {
                        protectedSettledCount += 1;
                        continue;
                    }
                    const reversalAmount = roundMoney(Math.min(fee.activeAmount, reversibleRemaining));
                    if (reversalAmount <= 0) {
                        protectedSettledCount += 1;
                        continue;
                    }
                    const reversalId = await insertSystemLateFeeReversal(pool, {
                        studentExternalId: studentId,
                        term: t,
                        year: y,
                        sourceAdjustmentId: fee.id,
                        amount: reversalAmount,
                        reason: "Removed duplicate active system late fee during reconciliation",
                    });
                    reversedCount += 1;
                    reversibleRemaining = roundMoney(Math.max(0, reversibleRemaining - reversalAmount));
                    if (sampleReversal == null) {
                        sampleReversal = {
                            studentId,
                            originalLateFeeAdjustmentId: fee.id,
                            reversalAdjustmentId: reversalId,
                        };
                    }
                }
            }
            else {
                skippedCount += 1;
            }
            continue;
        }
        if (activeFees.length === 0) {
            skippedCount += 1;
            continue;
        }
        let reversibleRemaining = roundMoney(Math.max(0, eligibility.lateFeeOutstanding));
        for (const fee of activeFees) {
            if (reversibleRemaining <= 0) {
                protectedSettledCount += 1;
                continue;
            }
            const reversalAmount = roundMoney(Math.min(fee.activeAmount, reversibleRemaining));
            if (reversalAmount <= 0) {
                protectedSettledCount += 1;
                continue;
            }
            const reversalId = await insertSystemLateFeeReversal(pool, {
                studentExternalId: studentId,
                term: t,
                year: y,
                sourceAdjustmentId: fee.id,
                amount: reversalAmount,
                reason: "Payment due date reconciliation: late fee no longer valid",
            });
            reversedCount += 1;
            reversibleRemaining = roundMoney(Math.max(0, reversibleRemaining - reversalAmount));
            if (sampleReversal == null) {
                sampleReversal = {
                    studentId,
                    originalLateFeeAdjustmentId: fee.id,
                    reversalAdjustmentId: reversalId,
                };
            }
        }
    }
    return {
        ok: true,
        term: t,
        year: y,
        paymentDueDate,
        studentsScanned: studentIds.length,
        insertedCount,
        reversedCount,
        protectedSettledCount,
        skippedCount,
        sampleReversal,
    };
}
export async function putQuarterSettings(input) {
    void input.lateFeeEnabled;
    void input.lateFeeAmount;
    void input.updatedBy;
    const result = await setFinanceQuarterDdlOnAcademicTerms(pool, input.term, input.year, input.paymentDueDate);
    if (result === "no_column") {
        return {
            ok: false,
            message: "Payment DDL persistence is not yet enabled on academic terms.",
        };
    }
    if (result === "not_found") {
        return {
            ok: false,
            message: "No matching academic term row for this quarter. Create it under Academic Terms first.",
        };
    }
    const reconciliation = await reconcileLateFeesForQuarter(input.term, input.year);
    return { ok: true, reconciliation };
}
export function parseBalanceFilterParam(raw) {
    const s = (raw ?? "").trim().toLowerCase();
    if (s === "positive" ||
        s === "negative" ||
        s === "zero" ||
        s === "all") {
        return s;
    }
    return "all";
}
/**
 * Paginated finance roster: search and balance filters run in SQL; balances are aggregated
 * in `quarter_bal` (no per-student queries).
 */
export async function listAdminFinanceStudentsPaginated(term, year, query) {
    const t = term.trim();
    const y = Math.trunc(year);
    const page = Math.max(1, Math.trunc(query.page));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize)));
    const offset = (page - 1) * pageSize;
    const searchTrimmed = query.search.trim();
    const [total, rawRows] = await Promise.all([
        countAdminFinanceRosterPage(pool, {
            term: t,
            year: y,
            searchTrimmed,
            balanceFilter: query.balanceFilter,
        }),
        listAdminFinanceRosterPage(pool, {
            term: t,
            year: y,
            searchTrimmed,
            balanceFilter: query.balanceFilter,
            limit: pageSize,
            offset,
        }),
    ]);
    const items = rawRows.map((r) => ({
        studentId: r.studentId,
        name: r.name,
        balance: roundMoney(r.balance),
    }));
    return { items, total, page, pageSize };
}
export async function getAdminFinanceQuarters(studentId) {
    return getAccountingQuartersPayload(studentId);
}
export async function getAdminFinanceLedger(studentId, term, year) {
    return getAccountingLedgerPayload(studentId, term.trim(), year);
}
function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}
function parseCategory(raw) {
    if (raw === undefined || raw === null)
        return "fees";
    if (typeof raw !== "string")
        return null;
    const s = raw.trim().toLowerCase();
    if (s === "")
        return "fees";
    if (CHARGE_CATEGORIES.includes(s)) {
        return s;
    }
    return null;
}
export function validatePostChargeBody(raw) {
    if (raw == null || typeof raw !== "object") {
        return { ok: false, error: "Request body must be a JSON object." };
    }
    const o = raw;
    const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
    const term = typeof o.term === "string" ? o.term.trim() : "";
    const yearRaw = o.year;
    const year = typeof yearRaw === "number"
        ? yearRaw
        : typeof yearRaw === "string"
            ? Number(yearRaw)
            : Number.NaN;
    const description = typeof o.description === "string" ? o.description.trim() : "";
    const amountRaw = o.amount;
    const amount = typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
            ? Number(amountRaw)
            : Number.NaN;
    if (studentId === "" || term === "" || !Number.isFinite(year)) {
        return {
            ok: false,
            error: "studentId, term, and year are required; year must be a finite number.",
        };
    }
    if (description === "") {
        return { ok: false, error: "description is required." };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "amount must be a number greater than 0." };
    }
    const category = parseCategory(o.category);
    if (category == null) {
        return {
            ok: false,
            error: "category must be one of: fees, other, tuition, clinical (or omit for fees).",
        };
    }
    return {
        ok: true,
        data: {
            studentId,
            term,
            year: Math.trunc(year),
            description,
            amount: roundMoney(amount),
            category,
        },
    };
}
export function validatePostPaymentBody(raw) {
    if (raw == null || typeof raw !== "object") {
        return { ok: false, error: "Request body must be a JSON object." };
    }
    const o = raw;
    const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
    const term = typeof o.term === "string" ? o.term.trim() : "";
    const yearRaw = o.year;
    const year = typeof yearRaw === "number"
        ? yearRaw
        : typeof yearRaw === "string"
            ? Number(yearRaw)
            : Number.NaN;
    const amountRaw = o.amount;
    const amount = typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
            ? Number(amountRaw)
            : Number.NaN;
    if (studentId === "" || term === "" || !Number.isFinite(year)) {
        return {
            ok: false,
            error: "studentId, term, and year are required; year must be a finite number.",
        };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "amount must be a number greater than 0." };
    }
    let paidAt;
    if (o.paidAt === undefined || o.paidAt === null) {
        paidAt = todayIsoDate();
    }
    else if (typeof o.paidAt === "string" && o.paidAt.trim() !== "") {
        paidAt = o.paidAt.trim().slice(0, 10);
    }
    else {
        return {
            ok: false,
            error: "paidAt must be an ISO date string (YYYY-MM-DD) or omitted.",
        };
    }
    const method = o.method === undefined || o.method === null
        ? "admin"
        : typeof o.method === "string" && o.method.trim() !== ""
            ? o.method.trim()
            : null;
    if (method == null) {
        return { ok: false, error: "method must be a non-empty string or omitted." };
    }
    const description = o.description === undefined || o.description === null
        ? "Admin recorded payment"
        : typeof o.description === "string"
            ? o.description.trim() || "Admin recorded payment"
            : null;
    if (description == null) {
        return { ok: false, error: "description must be a string or omitted." };
    }
    return {
        ok: true,
        data: {
            studentId,
            term,
            year: Math.trunc(year),
            amount: roundMoney(amount),
            paidAt,
            method,
            description,
        },
    };
}
export async function postAdminFinanceCharge(input) {
    await insertPortalBillingAdjustment(pool, {
        studentExternalId: input.studentId,
        term: input.term,
        year: input.year,
        description: input.description,
        amount: input.amount,
        category: input.category ?? "fees",
        adjustmentSource: "manual",
    });
}
export async function postAdminFinancePayment(input) {
    await insertPortalPayment(pool, {
        studentExternalId: input.studentId,
        term: input.term,
        year: input.year,
        amount: input.amount,
        paidAt: input.paidAt ?? todayIsoDate(),
        method: input.method ?? "admin",
        description: input.description ?? "Admin recorded payment",
    });
}
export function validatePutChargeBody(raw) {
    if (raw == null || typeof raw !== "object") {
        return { ok: false, error: "Request body must be a JSON object." };
    }
    const o = raw;
    const description = typeof o.description === "string" ? o.description.trim() : "";
    const amountRaw = o.amount;
    const amount = typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
            ? Number(amountRaw)
            : Number.NaN;
    const category = parseCategory(o.category);
    if (description === "") {
        return { ok: false, error: "description is required." };
    }
    if (!Number.isFinite(amount) || amount === 0) {
        return { ok: false, error: "amount must be a non-zero number." };
    }
    if (category == null) {
        return {
            ok: false,
            error: "category must be one of: fees, other, tuition, clinical (or omit for fees).",
        };
    }
    return {
        ok: true,
        data: {
            description,
            amount: roundMoney(amount),
            category,
        },
    };
}
export function validatePutPaymentBody(raw) {
    if (raw == null || typeof raw !== "object") {
        return { ok: false, error: "Request body must be a JSON object." };
    }
    const o = raw;
    const amountRaw = o.amount;
    const amount = typeof amountRaw === "number"
        ? amountRaw
        : typeof amountRaw === "string"
            ? Number(amountRaw)
            : Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "amount must be a number greater than 0." };
    }
    const paidAt = typeof o.paidAt === "string" && o.paidAt.trim() !== ""
        ? o.paidAt.trim().slice(0, 10)
        : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
        return { ok: false, error: "paidAt must be YYYY-MM-DD." };
    }
    const method = typeof o.method === "string" && o.method.trim() !== ""
        ? o.method.trim()
        : "";
    if (method === "") {
        return { ok: false, error: "method is required." };
    }
    let description;
    if (o.description === undefined || o.description === null) {
        description = null;
    }
    else if (typeof o.description === "string") {
        const s = o.description.trim();
        description = s === "" ? null : s;
    }
    else {
        return { ok: false, error: "description must be a string or null." };
    }
    return {
        ok: true,
        data: {
            amount: roundMoney(amount),
            paidAt,
            method,
            description,
        },
    };
}
export async function putAdminFinanceCharge(id, body) {
    try {
        await updateManualBillingAdjustment(pool, id, body);
    }
    catch (e) {
        if (e instanceof Error && e.message === "NOT_MANUAL_OR_MISSING") {
            const err = new Error("Charge not found or is not an editable manual adjustment.");
            err.statusCode = 400;
            throw err;
        }
        throw e;
    }
}
export async function deleteAdminFinanceCharge(id) {
    try {
        await deleteManualBillingAdjustment(pool, id);
    }
    catch (e) {
        if (e instanceof Error && e.message === "NOT_MANUAL_OR_MISSING") {
            const err = new Error("Charge not found or is not a deletable manual adjustment.");
            err.statusCode = 400;
            throw err;
        }
        throw e;
    }
}
export async function putAdminFinancePayment(id, body) {
    const row = await getPortalPaymentById(pool, id);
    if (row == null) {
        const err = new Error("Payment not found.");
        err.statusCode = 400;
        throw err;
    }
    await updatePortalPayment(pool, id, body);
}
export async function deleteAdminFinancePayment(id) {
    try {
        await deletePortalPayment(pool, id);
    }
    catch (e) {
        if (e instanceof Error && e.message === "MISSING_PAYMENT") {
            const err = new Error("Payment not found.");
            err.statusCode = 400;
            throw err;
        }
        throw e;
    }
}
export async function verifyManualChargeForStudentTerm(id, studentId, term, year) {
    const row = await getBillingAdjustmentById(pool, id);
    if (row == null)
        return false;
    if (row.adjustmentSource !== "manual")
        return false;
    return (row.studentExternalId === studentId.trim() &&
        row.term.trim().toLowerCase() === term.trim().toLowerCase() &&
        row.year === Math.trunc(year));
}
export async function verifyPaymentForStudentTerm(id, studentId, term, year) {
    const row = await getPortalPaymentById(pool, id);
    if (row == null)
        return false;
    return (row.studentExternalId === studentId.trim() &&
        row.term.trim().toLowerCase() === term.trim().toLowerCase() &&
        row.year === Math.trunc(year));
}
export async function runLateFeeCheckForQuarter(term, year) {
    const t = term.trim();
    const y = Math.trunc(year);
    const result = await reconcileLateFeesForQuarter(t, y);
    return {
        ok: true,
        insertedCount: result.insertedCount,
        skippedCount: result.skippedCount + result.protectedSettledCount,
        message: result.reversedCount > 0
            ? `Reconciled late fees: inserted ${result.insertedCount}, reversed ${result.reversedCount}.`
            : undefined,
    };
}
//# sourceMappingURL=adminFinanceService.js.map
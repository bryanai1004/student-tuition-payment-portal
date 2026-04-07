import { buildAcademicCourseRecordsFromMarksWithLookup, resolveRegistrationAnchoredAcademicTerm, scheduleRowsFromAcademicCourseRecords, termsMatch, } from "./studentAcademicCourseRecords.js";
import { buildAccountCurrentTerm, deriveAccountRegistration, } from "./studentAccountDashboard.js";
function roundMoney(n) {
    return Math.round(n * 100) / 100;
}
/** Legacy `accounting.date` is stored as YYYYMMDD (int). Emit ISO date for API / frontend. */
export function legacyAccountingDateToIso(dateRaw) {
    const n = Math.trunc(Number(dateRaw));
    if (!Number.isFinite(n) || n < 19000101 || n > 21001231) {
        return "1970-01-01";
    }
    const s = String(n).padStart(8, "0");
    const y = s.slice(0, 4);
    const m = s.slice(4, 6);
    const d = s.slice(6, 8);
    return `${y}-${m}-${d}`;
}
function typeNorm(type) {
    return type.trim().toLowerCase();
}
export function assembleLegacyStudentAccountPayload(snap, accountingRows, 
/** All `marks` rows for the student (newest term first), same source as `/academics`. */
allMarksRows, courseLookup, options) {
    const regFees = roundMoney(snap.totalFees);
    let totalCharges;
    let paymentsTotal;
    let outstandingBalance;
    let tuitionTotal;
    let feesTotal;
    let otherTotal;
    let payments;
    if (accountingRows.length === 0) {
        totalCharges = regFees;
        paymentsTotal = 0;
        outstandingBalance = regFees;
        tuitionTotal = 0;
        feesTotal = 0;
        otherTotal = 0;
        payments = [];
    }
    else {
        const sumDebit = accountingRows.reduce((s, r) => s + r.debit, 0);
        const sumCredit = accountingRows.reduce((s, r) => s + r.credit, 0);
        totalCharges = roundMoney(sumDebit);
        paymentsTotal = roundMoney(sumCredit);
        outstandingBalance = roundMoney(sumDebit - sumCredit);
        tuitionTotal = 0;
        feesTotal = 0;
        for (const r of accountingRows) {
            const tk = typeNorm(r.type);
            if (tk === "tuition")
                tuitionTotal += r.debit;
            else if (tk === "fee")
                feesTotal += r.debit;
        }
        tuitionTotal = roundMoney(tuitionTotal);
        feesTotal = roundMoney(feesTotal);
        const clinicalTotal = 0;
        otherTotal = roundMoney(totalCharges - tuitionTotal - feesTotal - clinicalTotal);
        payments = accountingRows
            .filter((r) => r.credit > 0)
            .map((r) => ({
            amount: roundMoney(r.credit),
            paidAt: legacyAccountingDateToIso(r.date),
            method: "legacy",
            description: r.memo.length > 0 ? r.memo : undefined,
        }));
    }
    const browseTerm = { term: snap.term, year: snap.year };
    const { portalActiveTerm, availableScheduleTerms, clinicalProgress } = options;
    const marksRowsForBrowse = allMarksRows.filter((m) => m.year === browseTerm.year && termsMatch(m.term, browseTerm.term));
    const courseRecords = buildAcademicCourseRecordsFromMarksWithLookup(snap.studentId, allMarksRows, courseLookup, portalActiveTerm);
    const browseRecords = courseRecords.filter((r) => r.year === browseTerm.year && termsMatch(r.term, browseTerm.term));
    const scheduleRows = scheduleRowsFromAcademicCourseRecords(browseRecords);
    const currentTerm = portalActiveTerm != null
        ? buildAccountCurrentTerm(portalActiveTerm.term, portalActiveTerm.year)
        : null;
    const browseLabel = buildAccountCurrentTerm(snap.term, snap.year).label;
    const browseMatchesPortalActive = portalActiveTerm != null &&
        portalActiveTerm.year === browseTerm.year &&
        termsMatch(portalActiveTerm.term, browseTerm.term);
    const registration = deriveAccountRegistration({
        scheduleRows,
        termLabel: browseLabel,
        ...(browseMatchesPortalActive
            ? {
                academicEnrollmentActive: resolveRegistrationAnchoredAcademicTerm(browseTerm, allMarksRows) != null,
                marksRowsForRegistrationTerm: marksRowsForBrowse.length,
            }
            : {}),
    });
    return {
        program: null,
        term: snap.term,
        year: snap.year,
        studentId: snap.studentId,
        student: {
            name: snap.displayName,
            studentId: snap.studentId,
            term: snap.term,
            year: snap.year,
        },
        preference: null,
        lineItems: [],
        summary: {
            tuitionTotal,
            clinicalTotal: 0,
            feesTotal,
            otherTotal,
            totalCharges,
            payments: paymentsTotal,
            outstandingBalance,
        },
        scheduleRows,
        currentTerm,
        availableScheduleTerms,
        registration,
        payments,
        installmentSchedule: [],
        installmentPolicy: [],
        billingStatus: null,
        termChargeEffectiveDate: null,
        clinicalProgress,
    };
}
//# sourceMappingURL=studentLegacyAccountAssembler.js.map
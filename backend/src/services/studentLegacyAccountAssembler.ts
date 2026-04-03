import type { MarksRow } from "../repositories/studentAcademicsRepository.js";
import type {
  LegacyAccountingRow,
  LegacyAccountSnapshot,
} from "../repositories/studentLegacyAccountRepository.js";
import type { PaymentRecord, StudentAccountPayload } from "../types/studentAccount.js";
import {
  buildAcademicCourseRecordsFromMarks,
  resolveActiveTermFromCourseRecords,
  scheduleRowsFromAcademicCourseRecords,
  termsMatch,
} from "./studentAcademicCourseRecords.js";
import {
  buildAccountCurrentTerm,
  deriveAccountRegistration,
} from "./studentAccountDashboard.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Legacy `accounting.date` is stored as YYYYMMDD (int). Emit ISO date for API / frontend. */
export function legacyAccountingDateToIso(dateRaw: number): string {
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

function typeNorm(type: string): string {
  return type.trim().toLowerCase();
}

/**
 * Real-student payload: legacy `students` + `registration` + `accounting` (Step 3B).
 * Category splits are minimal; `lineItems` and portal-only fields stay empty until later steps.
 */
export function assembleLegacyStudentAccountPayload(
  snap: LegacyAccountSnapshot,
  accountingRows: LegacyAccountingRow[],
  /** All `marks` rows for the student (newest term first), same source as `/academics`. */
  allMarksRows: MarksRow[],
): StudentAccountPayload {
  const regFees = roundMoney(snap.totalFees);

  let totalCharges: number;
  let paymentsTotal: number;
  let outstandingBalance: number;
  let tuitionTotal: number;
  let feesTotal: number;
  let otherTotal: number;
  let payments: PaymentRecord[];

  if (accountingRows.length === 0) {
    totalCharges = regFees;
    paymentsTotal = 0;
    outstandingBalance = regFees;
    tuitionTotal = 0;
    feesTotal = 0;
    otherTotal = 0;
    payments = [];
  } else {
    const sumDebit = accountingRows.reduce((s, r) => s + r.debit, 0);
    const sumCredit = accountingRows.reduce((s, r) => s + r.credit, 0);
    totalCharges = roundMoney(sumDebit);
    paymentsTotal = roundMoney(sumCredit);
    outstandingBalance = roundMoney(sumDebit - sumCredit);

    tuitionTotal = 0;
    feesTotal = 0;
    for (const r of accountingRows) {
      const tk = typeNorm(r.type);
      if (tk === "tuition") tuitionTotal += r.debit;
      else if (tk === "fee") feesTotal += r.debit;
    }
    tuitionTotal = roundMoney(tuitionTotal);
    feesTotal = roundMoney(feesTotal);

    const clinicalTotal = 0;
    otherTotal = roundMoney(
      totalCharges - tuitionTotal - feesTotal - clinicalTotal,
    );

    payments = accountingRows
      .filter((r) => r.credit > 0)
      .map((r) => ({
        amount: roundMoney(r.credit),
        paidAt: legacyAccountingDateToIso(r.date),
        method: "legacy",
        description: r.memo.length > 0 ? r.memo : undefined,
      }));
  }

  const courseRecords = buildAcademicCourseRecordsFromMarks(
    snap.studentId,
    allMarksRows,
  );
  const activeTerm = resolveActiveTermFromCourseRecords(courseRecords);
  const currentTermMarks =
    activeTerm != null
      ? courseRecords.filter(
          (r) =>
            r.year === activeTerm.year && termsMatch(r.term, activeTerm.term),
        )
      : [];
  const scheduleRows = scheduleRowsFromAcademicCourseRecords(currentTermMarks);
  const currentTerm =
    activeTerm != null
      ? buildAccountCurrentTerm(activeTerm.term, activeTerm.year)
      : buildAccountCurrentTerm(snap.term, snap.year);
  const registration = deriveAccountRegistration({
    scheduleRows,
    enrollmentSourceCount:
      currentTermMarks.length > 0 ? currentTermMarks.length : allMarksRows.length,
    termLabel: currentTerm.label,
  });

  return {
    program: null,
    term: snap.term,
    year: snap.year,
    studentId: snap.studentId,
    student: {
      name: snap.displayName,
      studentId: snap.studentId,
      term: currentTerm.term,
      year: currentTerm.year,
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
    registration,
    payments,
    installmentSchedule: [],
    installmentPolicy: [],
    billingStatus: null,
    termChargeEffectiveDate: null,
  };
}

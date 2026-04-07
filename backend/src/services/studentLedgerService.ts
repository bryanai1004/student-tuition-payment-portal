import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import {
  listPortalScheduleTermsForStudent,
  loadPortalTermBillingContext,
} from "../repositories/studentAccountRepository.js";
import {
  listLegacyAccountingQuarters,
  loadLegacyAccountingRows,
} from "../repositories/studentLegacyAccountRepository.js";
import type { AccountContext, StudentTermPreference } from "../types/studentAccount.js";
import {
  calculateCourseCharge,
  calculateInstallmentServiceFee,
  formatPortalLedgerCourseMemo,
  STANDARD_TERM_FEES,
} from "./billingMath.js";
import { termSortOrder } from "./studentAcademicCourseRecords.js";

export type LedgerQuarterOption = {
  term: string;
  year: number;
  label: string;
};

export type LedgerRowDto = {
  date: string;
  type: string;
  code: string;
  memo: string;
  debit: number;
  credit: number;
};

export type LedgerSummaryDto = {
  totalCharges: number;
  totalPayments: number;
  balance: number;
};

const DEFAULT_TERM_PREF: StudentTermPreference = {
  useInstallmentPlan: false,
  tuitionPaidInFullDuringRegistration: false,
  installmentCount: 3,
  registrationPeriodEnds: "2026-09-05",
};

function formatQuarterLabel(term: string, year: number): string {
  const t = term.trim();
  if (t.length === 0) {
    return String(year);
  }
  const head = t.slice(0, 1).toUpperCase();
  const tail = t.slice(1).toLowerCase();
  return `${head}${tail} ${year}`;
}

/** Legacy `accounting.date` is YYYYMMDD int → `YYYY-MM-DD` for clients. */
function legacyAccountingDateToIso(date: number): string {
  const n = Math.trunc(Number(date));
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  const s = String(Math.abs(n)).padStart(8, "0").slice(-8);
  const y = s.slice(0, 4);
  const mo = s.slice(4, 6);
  const d = s.slice(6, 8);
  return `${y}-${mo}-${d}`;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function quarterDedupeKey(term: string, year: number): string {
  return `${Math.trunc(year)}:${term.trim().toLowerCase()}`;
}

function sortQuartersNewestFirst(
  pairs: { term: string; year: number }[],
): { term: string; year: number }[] {
  return [...pairs].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return termSortOrder(b.term) - termSortOrder(a.term);
  });
}

function mergeQuarterLists(
  legacy: { term: string; year: number }[],
  portal: { term: string; year: number }[],
): { term: string; year: number }[] {
  const byKey = new Map<string, { term: string; year: number }>();
  for (const p of legacy) {
    const k = quarterDedupeKey(p.term, p.year);
    if (!byKey.has(k)) {
      byKey.set(k, { term: p.term.trim(), year: Math.trunc(p.year) });
    }
  }
  for (const p of portal) {
    const k = quarterDedupeKey(p.term, p.year);
    if (!byKey.has(k)) {
      byKey.set(k, { term: p.term.trim(), year: Math.trunc(p.year) });
    }
  }
  return sortQuartersNewestFirst([...byKey.values()]);
}

function isoEffectiveDateForPortalCharges(): string {
  return new Date().toISOString().slice(0, 10);
}

function summarizeLedgerRows(rows: LedgerRowDto[]): LedgerSummaryDto {
  let totalCharges = 0;
  let totalPayments = 0;
  for (const r of rows) {
    totalCharges += r.debit;
    totalPayments += r.credit;
  }
  return {
    totalCharges: roundMoney(totalCharges),
    totalPayments: roundMoney(totalPayments),
    balance: roundMoney(totalCharges - totalPayments),
  };
}

/**
 * Portal-synthesized ledger when legacy `accounting` has no rows for the quarter.
 * Charges follow AMU catalog rules; payments come from `portal_payments`.
 */
function buildPortalLedgerRowsFromContext(ctx: AccountContext): LedgerRowDto[] {
  const rows: LedgerRowDto[] = [];
  const chargeDate = isoEffectiveDateForPortalCharges();
  const courseById = new Map(ctx.courses.map((c) => [c.courseId, c]));

  const sortedEnrollments = [...ctx.enrollments].sort((a, b) => {
    const ca = courseById.get(a.courseId)?.courseCode ?? "";
    const cb = courseById.get(b.courseId)?.courseCode ?? "";
    return ca.localeCompare(cb);
  });

  for (const e of sortedEnrollments) {
    const course = courseById.get(e.courseId);
    if (!course) continue;
    const amt = roundMoney(calculateCourseCharge(course));
    if (amt <= 0) continue;
    rows.push({
      date: chargeDate,
      type: "Tuition",
      code: course.courseCode,
      memo: formatPortalLedgerCourseMemo(course),
      debit: amt,
      credit: 0,
    });
  }

  if (ctx.enrollments.length > 0) {
    for (const fee of STANDARD_TERM_FEES) {
      rows.push({
        date: chargeDate,
        type: "Fee",
        code: "",
        memo: fee.description,
        debit: roundMoney(fee.amount),
        credit: 0,
      });
    }
    const pref = ctx.preference ?? DEFAULT_TERM_PREF;
    const installmentFee = calculateInstallmentServiceFee(pref);
    if (installmentFee.amount > 0) {
      rows.push({
        date: chargeDate,
        type: "Fee",
        code: "",
        memo: "Tuition Installment Service Fee",
        debit: roundMoney(installmentFee.amount),
        credit: 0,
      });
    }
  }

  for (const adj of ctx.adjustments) {
    const raw = roundMoney(adj.amount);
    if (raw === 0) continue;
    if (raw > 0) {
      rows.push({
        date: chargeDate,
        type: "Adjustment",
        code: "",
        memo: adj.description.trim() || "Adjustment",
        debit: raw,
        credit: 0,
      });
    } else {
      rows.push({
        date: chargeDate,
        type: "Adjustment",
        code: "",
        memo: adj.description.trim() || "Adjustment",
        debit: 0,
        credit: roundMoney(Math.abs(raw)),
      });
    }
  }

  for (const p of ctx.payments) {
    const credit = roundMoney(Math.abs(p.amount));
    if (credit <= 0) continue;
    const paid = String(p.paidAt ?? "").trim().slice(0, 10);
    rows.push({
      date: paid.length >= 10 ? paid : chargeDate,
      type: "Payment",
      code: String(p.method ?? "").trim(),
      memo:
        p.description != null && String(p.description).trim() !== ""
          ? String(p.description).trim()
          : "Payment",
      debit: 0,
      credit,
    });
  }

  return rows;
}

export async function getAccountingQuartersPayload(studentId: string): Promise<{
  studentId: string;
  quarters: LedgerQuarterOption[];
}> {
  if (studentId === DEMO_STUDENT_ID) {
    return { studentId, quarters: [] };
  }

  const [legacyRows, portalTerms] = await Promise.all([
    listLegacyAccountingQuarters(pool, studentId),
    listPortalScheduleTermsForStudent(pool, studentId),
  ]);

  const merged = mergeQuarterLists(legacyRows, portalTerms);
  const quarters = merged.map((r) => ({
    term: r.term,
    year: r.year,
    label: formatQuarterLabel(r.term, r.year),
  }));

  return { studentId, quarters };
}

export async function getAccountingLedgerPayload(
  studentId: string,
  term: string,
  year: number,
): Promise<{
  studentId: string;
  term: string;
  year: number;
  rows: LedgerRowDto[];
  summary: LedgerSummaryDto;
} | null> {
  const termTrim = term.trim();
  if (termTrim === "" || !Number.isFinite(year)) {
    return null;
  }

  if (studentId === DEMO_STUDENT_ID) {
    return {
      studentId,
      term: termTrim,
      year,
      rows: [],
      summary: { totalCharges: 0, totalPayments: 0, balance: 0 },
    };
  }

  const legacy = await loadLegacyAccountingRows(
    pool,
    studentId,
    termTrim,
    year,
  );

  if (legacy.length > 0) {
    let totalCharges = 0;
    let totalPayments = 0;
    const rows: LedgerRowDto[] = legacy.map((r) => {
      totalCharges += r.debit;
      totalPayments += r.credit;
      return {
        date: legacyAccountingDateToIso(r.date),
        type: r.type,
        code: r.code,
        memo: r.memo,
        debit: r.debit,
        credit: r.credit,
      };
    });

    const resolvedTerm = legacy[0]?.term ?? termTrim;
    const resolvedYear = legacy[0]?.year ?? year;

    return {
      studentId,
      term: resolvedTerm,
      year: resolvedYear,
      rows,
      summary: {
        totalCharges: roundMoney(totalCharges),
        totalPayments: roundMoney(totalPayments),
        balance: roundMoney(totalCharges - totalPayments),
      },
    };
  }

  const ctx = await loadPortalTermBillingContext(
    pool,
    studentId,
    termTrim,
    year,
  );
  const rows = buildPortalLedgerRowsFromContext(ctx);
  const summary = summarizeLedgerRows(rows);

  return {
    studentId,
    term: ctx.term.trim() || termTrim,
    year: ctx.year,
    rows,
    summary,
  };
}

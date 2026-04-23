import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { isPastSchoolLocalDueDate } from "../lib/schoolLocalDate.js";
import {
  getFinanceQuarterDdlFromAcademicTerms,
  hasSystemLateFeeForQuarter,
  insertSystemLateFee,
} from "../repositories/adminFinanceRepository.js";
import { listClinicalFinanceQuarterHintsForStudent } from "../repositories/clinicalEnrollmentRepository.js";
import {
  listPortalScheduleTermsForStudent,
  loadPortalBillingAdjustmentsForQuarter,
  loadPortalTermBillingContext,
} from "../repositories/studentAccountRepository.js";
import {
  listLegacyAccountingQuarters,
  loadLegacyAccountingRows,
} from "../repositories/studentLegacyAccountRepository.js";
import { isClinicalBookingExpired } from "../clinicalBookingPolicy.js";
import { listActiveClinicalBookingPaymentHoldsForStudentQuarter } from "../repositories/clinicalBookingPaymentHoldRepository.js";
import type {
  AccountContext,
  BillingAdjustmentRecord,
  StudentTermPreference,
} from "../types/studentAccount.js";
import {
  calculateCourseCharge,
  calculateInstallmentServiceFee,
  formatPortalLedgerCourseMemo,
  STANDARD_TERM_FEES,
} from "./billingMath.js";
import {
  isClinicBucketCharge,
  isExamFeeMemo,
  isLateFeeRow,
  isTuitionBucketCharge,
} from "./billingChargeBuckets.js";
import { termSortOrder } from "./studentAcademicCourseRecords.js";

export type LedgerQuarterOption = {
  term: string;
  year: number;
  label: string;
};

export type LedgerRowSourceType =
  | "system"
  | "manual_charge"
  | "manual_payment"
  | "auto_late_fee";

/** Present on ledger rows tied to an active clinical booking payment hold. */
export type LedgerClinicalBookingPaymentHoldDto = {
  /** ISO-8601 UTC instant when the hold window ends. */
  holdExpiresAt: string;
  /** Whole seconds remaining at response time (server clock); clients should tick from `holdExpiresAt`. */
  remainingSeconds: number;
  holdStatus: string;
};

export type LedgerRowDto = {
  date: string;
  type: string;
  code: string;
  memo: string;
  debit: number;
  credit: number;
  sourceType: LedgerRowSourceType;
  sourceId: string | number | null;
  isEditable: boolean;
  isDeletable: boolean;
  clinicalBookingPaymentHold?: LedgerClinicalBookingPaymentHoldDto | null;
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

type ChargeBucketType = "tuition" | "clinic_fee" | "exam_fee" | "late_fee";

function inferPaymentChargeTypeFromMemo(memo: string): ChargeBucketType | null {
  const m = memo.trim().toLowerCase();
  const explicit = /authorize\.net\s+(tuition|clinic_fee|exam_fee|late_fee)\b/.exec(
    m,
  );
  if (explicit) {
    return explicit[1] as ChargeBucketType;
  }
  if (/\btuition\b/.test(m)) return "tuition";
  if (/clinic/.test(m)) return "clinic_fee";
  if (/exam/.test(m)) return "exam_fee";
  if (/late\s*payment\s*fee|late\s*fee/.test(m)) return "late_fee";
  return null;
}

function summarizeTermChargesFromLedger(rows: LedgerRowDto[]): {
  chargeTotals: Record<ChargeBucketType, number>;
  paymentTotals: Record<ChargeBucketType, number>;
  unassignedPayments: number;
} {
  const chargeTotals: Record<ChargeBucketType, number> = {
    tuition: 0,
    clinic_fee: 0,
    exam_fee: 0,
    late_fee: 0,
  };
  const paymentTotals: Record<ChargeBucketType, number> = {
    tuition: 0,
    clinic_fee: 0,
    exam_fee: 0,
    late_fee: 0,
  };
  let totalCredits = 0;
  for (const row of rows) {
    const debit = roundMoney(Math.max(0, Number(row.debit) || 0));
    const credit = roundMoney(Math.max(0, Number(row.credit) || 0));
    if (debit > 0) {
      if (
        isLateFeeRow({
          type: row.type,
          memo: row.memo,
          sourceType: row.sourceType,
        })
      ) {
        chargeTotals.late_fee = roundMoney(chargeTotals.late_fee + debit);
      } else if (isExamFeeMemo(row.memo)) {
        chargeTotals.exam_fee = roundMoney(chargeTotals.exam_fee + debit);
      } else if (
        isClinicBucketCharge({
          type: row.type,
          code: row.code,
          memo: row.memo,
          sourceType: row.sourceType,
        })
      ) {
        chargeTotals.clinic_fee = roundMoney(chargeTotals.clinic_fee + debit);
      } else if (
        isTuitionBucketCharge({
          type: row.type,
          code: row.code,
          memo: row.memo,
          sourceType: row.sourceType,
        })
      ) {
        chargeTotals.tuition = roundMoney(chargeTotals.tuition + debit);
      }
    }
    if (credit > 0) {
      totalCredits = roundMoney(totalCredits + credit);
      const inferred = inferPaymentChargeTypeFromMemo(row.memo);
      if (inferred != null) {
        paymentTotals[inferred] = roundMoney(paymentTotals[inferred] + credit);
      }
    }
  }

  const typedPayments = roundMoney(
    paymentTotals.tuition +
      paymentTotals.clinic_fee +
      paymentTotals.exam_fee +
      paymentTotals.late_fee,
  );
  return {
    chargeTotals,
    paymentTotals,
    unassignedPayments: roundMoney(Math.max(0, totalCredits - typedPayments)),
  };
}

function distributeUnassignedPayments(
  chargeTotals: Record<ChargeBucketType, number>,
  paymentTotals: Record<ChargeBucketType, number>,
  unassignedPayments: number,
): Record<ChargeBucketType, number> {
  const paid: Record<ChargeBucketType, number> = {
    tuition: 0,
    clinic_fee: 0,
    exam_fee: 0,
    late_fee: 0,
  };
  let carry = roundMoney(Math.max(0, unassignedPayments));
  const order: ChargeBucketType[] = [
    "tuition",
    "clinic_fee",
    "exam_fee",
    "late_fee",
  ];
  for (const key of order) {
    const target = roundMoney(Math.max(0, chargeTotals[key]));
    if (target <= 0) continue;
    const direct = roundMoney(Math.max(0, paymentTotals[key]));
    const remainingAfterDirect = roundMoney(Math.max(0, target - direct));
    const allocation = roundMoney(Math.min(remainingAfterDirect, carry));
    carry = roundMoney(Math.max(0, carry - allocation));
    paid[key] = roundMoney(Math.min(target, direct + allocation));
  }
  return paid;
}

async function ensureSystemLateFeeForStudentQuarter(
  studentId: string,
  term: string,
  year: number,
  options?: AccountingLedgerPayloadOptions,
): Promise<boolean> {
  const { paymentDueDate } = await getFinanceQuarterDdlFromAcademicTerms(
    pool,
    term,
    year,
  );
  const due = paymentDueDate?.trim() ?? "";
  if (due === "" || !isPastSchoolLocalDueDate(due)) return false;

  const already = await hasSystemLateFeeForQuarter(pool, studentId, term, year);
  if (already) return false;

  const payload = await getAccountingLedgerPayload(studentId, term, year, {
    skipExpiredClinicalBookingReconciliation:
      options?.skipExpiredClinicalBookingReconciliation === true,
    skipLateFeeEvaluation: true,
  });
  if (!payload) return false;

  const summarized = summarizeTermChargesFromLedger(payload.rows);
  const paid = distributeUnassignedPayments(
    summarized.chargeTotals,
    summarized.paymentTotals,
    summarized.unassignedPayments,
  );
  const tuitionDue = roundMoney(
    Math.max(0, summarized.chargeTotals.tuition - paid.tuition),
  );
  if (tuitionDue <= 0) return false;

  await insertSystemLateFee(pool, {
    studentExternalId: studentId,
    term,
    year,
    amount: 30,
  });
  return true;
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

/** Positive `system_clinical` charges map to `portal_billing_adjustments.id` on ledger `sourceId`. */
function clinicalBookingChargeAdjustmentIds(
  adjustments: BillingAdjustmentRecord[],
): Set<number> {
  const s = new Set<number>();
  for (const a of adjustments) {
    if (a.adjustmentSource !== "system_clinical") continue;
    const id = a.id;
    if (id == null || !Number.isFinite(id)) continue;
    if (roundMoney(a.amount) <= 0) continue;
    s.add(Math.trunc(Number(id)));
  }
  return s;
}

function applyClinicalBookingPaymentHoldsToLedgerRows(
  rows: LedgerRowDto[],
  adjustments: BillingAdjustmentRecord[],
  holds: {
    billingAdjustmentId: number;
    holdExpiresAt: Date;
    status: string;
  }[],
): void {
  const adjIds = clinicalBookingChargeAdjustmentIds(adjustments);
  if (adjIds.size === 0 || holds.length === 0) return;

  const byBill = new Map(holds.map((h) => [h.billingAdjustmentId, h] as const));
  const nowMs = Date.now();

  for (const row of rows) {
    /* Portal adjustment lines only — avoids legacy `accounting.seq` id collisions. */
    if (row.type !== "Adjustment") continue;
    const sid = row.sourceId;
    if (typeof sid !== "number" || !Number.isFinite(sid)) continue;
    const b = Math.trunc(sid);
    if (!adjIds.has(b)) continue;
    const h = byBill.get(b);
    if (!h) continue;
    if (isClinicalBookingExpired(h.holdExpiresAt, nowMs)) continue;
    const exp = h.holdExpiresAt.getTime();
    const remainingSeconds = Math.max(0, Math.floor((exp - nowMs) / 1000));
    row.clinicalBookingPaymentHold = {
      holdExpiresAt: h.holdExpiresAt.toISOString(),
      remainingSeconds,
      holdStatus: h.status,
    };
  }
}

function systemRowMeta(): Pick<
  LedgerRowDto,
  "sourceType" | "sourceId" | "isEditable" | "isDeletable"
> {
  return {
    sourceType: "system",
    sourceId: null,
    isEditable: false,
    isDeletable: false,
  };
}

function adjustmentMetaForLedger(
  adj: BillingAdjustmentRecord,
): Pick<
  LedgerRowDto,
  "sourceType" | "sourceId" | "isEditable" | "isDeletable"
> {
  const isLateFee = adj.adjustmentSource === "system_late_fee";
  const isSystemClinical = adj.adjustmentSource === "system_clinical";
  const isLateFeeReversal =
    adj.adjustmentSource === "system_late_fee_reversal";
  const sid = adj.id != null && Number.isFinite(adj.id) ? adj.id : null;
  if (isLateFee) {
    return {
      sourceType: "auto_late_fee",
      sourceId: sid,
      isEditable: false,
      isDeletable: false,
    };
  }
  if (isSystemClinical) {
    return {
      sourceType: "system",
      sourceId: sid,
      isEditable: false,
      isDeletable: false,
    };
  }
  if (isLateFeeReversal) {
    return {
      sourceType: "system",
      sourceId: sid,
      isEditable: false,
      isDeletable: false,
    };
  }
  return {
    sourceType: "manual_charge",
    sourceId: sid,
    isEditable: sid != null,
    isDeletable: sid != null,
  };
}

/** Maps `portal_billing_adjustments` rows to ledger DTO lines (portal or legacy+portal merge). */
function ledgerRowsFromPortalAdjustments(
  adjustments: BillingAdjustmentRecord[],
  chargeDate: string,
): LedgerRowDto[] {
  const rows: LedgerRowDto[] = [];
  for (const adj of adjustments) {
    const raw = roundMoney(adj.amount);
    if (raw === 0) continue;
    const baseMeta = adjustmentMetaForLedger(adj);
    if (raw > 0) {
      rows.push({
        date: chargeDate,
        type: "Adjustment",
        code: "",
        memo: adj.description.trim() || "Adjustment",
        debit: raw,
        credit: 0,
        ...baseMeta,
      });
    } else {
      rows.push({
        date: chargeDate,
        type: "Adjustment",
        code: "",
        memo: adj.description.trim() || "Adjustment",
        debit: 0,
        credit: roundMoney(Math.abs(raw)),
        ...baseMeta,
      });
    }
  }
  return rows;
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
      ...systemRowMeta(),
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
        ...systemRowMeta(),
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
        ...systemRowMeta(),
      });
    }
  }

  rows.push(...ledgerRowsFromPortalAdjustments(ctx.adjustments, chargeDate));

  for (const p of ctx.payments) {
    const credit = roundMoney(Math.abs(p.amount));
    if (credit <= 0) continue;
    const paid = String(p.paidAt ?? "").trim().slice(0, 10);
    const pid = p.id != null && Number.isFinite(p.id) ? p.id : null;
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
      sourceType: "manual_payment",
      sourceId: pid,
      isEditable: pid != null,
      isDeletable: pid != null,
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

  const [legacyRows, portalTerms, clinicalTerms] = await Promise.all([
    listLegacyAccountingQuarters(pool, studentId),
    listPortalScheduleTermsForStudent(pool, studentId),
    listClinicalFinanceQuarterHintsForStudent(studentId),
  ]);

  const merged = mergeQuarterLists(
    mergeQuarterLists(legacyRows, portalTerms),
    clinicalTerms,
  );
  const quarters = merged.map((r) => ({
    term: r.term,
    year: r.year,
    label: formatQuarterLabel(r.term, r.year),
  }));

  return { studentId, quarters };
}

export type AccountingLedgerPayloadOptions = {
  /**
   * When true, skip query-time revocation of expired unpaid clinical bookings.
   * Used by `getStudentQuarterBalance` to avoid recursion while holds are reconciled.
   */
  skipExpiredClinicalBookingReconciliation?: boolean;
  /** Internal recursion guard and read-only contexts that must not mutate ledger rows. */
  skipLateFeeEvaluation?: boolean;
};

export async function getAccountingLedgerPayload(
  studentId: string,
  term: string,
  year: number,
  options?: AccountingLedgerPayloadOptions,
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

  if (!options?.skipLateFeeEvaluation) {
    await ensureSystemLateFeeForStudentQuarter(studentId, termTrim, year, options);
  }

  if (!options?.skipExpiredClinicalBookingReconciliation) {
    const { reconcileExpiredClinicalBookingHoldsForStudent } = await import(
      "./clinicalBookingPaymentHoldService.js"
    );
    await reconcileExpiredClinicalBookingHoldsForStudent(studentId);
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
    const rows: LedgerRowDto[] = legacy.map((r) => ({
      date: legacyAccountingDateToIso(r.date),
      type: r.type,
      code: r.code,
      memo: r.memo,
      debit: r.debit,
      credit: r.credit,
      sourceType: "system",
      sourceId: r.seqNumber,
      isEditable: false,
      isDeletable: false,
    }));

    const resolvedTerm = legacy[0]?.term ?? termTrim;
    const resolvedYear = legacy[0]?.year ?? year;

    const [portalAdjustments, quarterHolds] = await Promise.all([
      loadPortalBillingAdjustmentsForQuarter(
        pool,
        studentId,
        resolvedTerm.trim(),
        resolvedYear,
      ),
      listActiveClinicalBookingPaymentHoldsForStudentQuarter(
        studentId,
        resolvedTerm.trim(),
        resolvedYear,
      ),
    ]);
    const portalAdjRows = ledgerRowsFromPortalAdjustments(
      portalAdjustments,
      isoEffectiveDateForPortalCharges(),
    );
    const mergedRows = [...rows, ...portalAdjRows];
    applyClinicalBookingPaymentHoldsToLedgerRows(
      mergedRows,
      portalAdjustments,
      quarterHolds,
    );
    const summary = summarizeLedgerRows(mergedRows);

    return {
      studentId,
      term: resolvedTerm,
      year: resolvedYear,
      rows: mergedRows,
      summary,
    };
  }

  const [ctx, quarterHolds] = await Promise.all([
    loadPortalTermBillingContext(pool, studentId, termTrim, year),
    listActiveClinicalBookingPaymentHoldsForStudentQuarter(
      studentId,
      termTrim,
      year,
    ),
  ]);
  const rows = buildPortalLedgerRowsFromContext(ctx);
  applyClinicalBookingPaymentHoldsToLedgerRows(rows, ctx.adjustments, quarterHolds);
  const summary = summarizeLedgerRows(rows);

  return {
    studentId,
    term: ctx.term.trim() || termTrim,
    year: ctx.year,
    rows,
    summary,
  };
}

/** Quarter balance using the same ledger rules as `getAccountingLedgerPayload`. */
export async function getStudentQuarterBalance(
  studentId: string,
  term: string,
  year: number,
): Promise<number> {
  const payload = await getAccountingLedgerPayload(studentId, term.trim(), year, {
    skipExpiredClinicalBookingReconciliation: true,
    skipLateFeeEvaluation: true,
  });
  return payload?.summary.balance ?? 0;
}

import { pool } from "../lib/db.js";
import {
  academicTermsPaymentDueDateColumnExists,
  countAdminFinanceRosterSearchOnly,
  deleteManualBillingAdjustment,
  deletePortalPayment,
  getBillingAdjustmentById,
  getFinanceQuarterDdlFromAcademicTerms,
  getPortalPaymentById,
  hasSystemLateFeeForQuarter,
  insertPortalBillingAdjustment,
  insertPortalPayment,
  insertSystemLateFee,
  insertSystemLateFeeReversal,
  listAdminFinanceRosterAllSearchOnlyOrdered,
  listAdminFinanceRosterPageSearchOnly,
  listGlobalFinanceQuarters,
  listSystemLateFeeRowsForQuarter,
  listStudentIdsWithPortalQuarterActivity,
  sumPortalBillingAdjustmentsNetByStudentForQuarter,
  sumPortalPaymentsByStudentForQuarter,
  type AdminFinanceRosterBalanceFilter,
  type AdminFinanceRosterScope,
  type PortalBillingCategory,
  setFinanceQuarterDdlOnAcademicTerms,
  updateManualBillingAdjustment,
  updatePortalPayment,
} from "../repositories/adminFinanceRepository.js";
import { batchLoadPortalTermBillingContextsForQuarter } from "../repositories/studentAccountRepository.js";
import {
  loadLegacyAccountingRows,
  sumLegacyAccountingBalanceByStudentForQuarter,
} from "../repositories/studentLegacyAccountRepository.js";
import {
  computePortalOnlyQuarterNetBalance,
  getAccountingLedgerPayload,
  getAccountingQuartersPayload,
} from "./studentLedgerService.js";
import { isPastSchoolLocalDueDate } from "../lib/schoolLocalDate.js";
import type { AccountContext } from "../types/studentAccount.js";
import {
  distributeUnassignedPaymentsToBuckets,
  summarizeLedgerRowsIntoChargeBuckets,
} from "./ledgerTuitionFlowMath.js";
import { computeTuitionBalanceSnapshot } from "./tuitionBalanceService.js";
import { resolveCanonicalStudentExternalId } from "../repositories/studentIdentityRepository.js";
import type { LedgerRowForTuitionFlow } from "./ledgerTuitionFlowMath.js";

export type AdminFinanceStudentStatus =
  | "paid"
  | "owes"
  | "overdue"
  | "credit";

export type AdminFinanceStatusFilter =
  | "all"
  | "owes"
  | "paid"
  | "late_fee"
  | "clinic_unpaid";

export type AdminFinanceStudentBuckets = {
  tuitionDue: number;
  clinicDue: number;
  lateFeeDue: number;
  examDue: number;
};

/** One row in the paginated admin finance student list. */
export type AdminFinanceStudentListItem = {
  studentId: string;
  name: string;
  /** Net balance for the selected quarter (legacy `accounting` + portal adjustments, or full portal ledger when no legacy rows). */
  balance: number;
  /** Null when bucket breakdown was not computed for the list view (see drawer / ledger). */
  tuitionDue: number | null;
  clinicDue: number | null;
  lateFeeDue: number | null;
  examDue: number | null;
  bucketsLoaded: boolean;
  status: AdminFinanceStudentStatus;
};

export type AdminFinanceQuarterSummary = {
  term: string;
  year: number;
  paymentDueDate: string | null;
  studentsOwing: number;
  totalOutstanding: number;
};

export type AdminFinanceStudentsListResponse = {
  items: AdminFinanceStudentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

const CHARGE_CATEGORIES: PortalBillingCategory[] = [
  "fees",
  "other",
  "tuition",
  "clinical",
  "exam",
];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatQuarterLabel(term: string, year: number): string {
  const t = term.trim();
  if (t.length === 0) return String(year);
  const head = t.slice(0, 1).toUpperCase();
  const tail = t.slice(1).toLowerCase();
  return `${head}${tail} ${year}`;
}

export async function listGlobalQuartersPayload(): Promise<{
  quarters: { term: string; year: number; label: string }[];
}> {
  const pairs = await listGlobalFinanceQuarters(pool);
  return {
    quarters: pairs.map((p) => ({
      term: p.term,
      year: p.year,
      label: formatQuarterLabel(p.term, p.year),
    })),
  };
}

export async function getQuarterSettingsPayload(
  term: string,
  year: number,
): Promise<{
  term: string;
  year: number;
  paymentDueDate: string | null;
  lateFeeEnabled: boolean;
  lateFeeAmount: number;
  ddlPersistenceAvailable: boolean;
  ddlSaveNote: string | null;
}> {
  const y = Math.trunc(year);
  const t = term.trim();
  const hasCol = await academicTermsPaymentDueDateColumnExists(pool);
  const { paymentDueDate, rowExists } = await getFinanceQuarterDdlFromAcademicTerms(
    pool,
    t,
    y,
  );
  const ddlPersistenceAvailable = hasCol && rowExists;
  let ddlSaveNote: string | null = null;
  if (!ddlPersistenceAvailable) {
    if (!hasCol) {
      ddlSaveNote =
        "Payment DDL persistence is not yet enabled on academic terms.";
    } else {
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

type LateFeeEligibility = {
  eligible: boolean;
  tuitionOutstanding: number;
  lateFeeOutstanding: number;
  reason:
    | "missing_due_date"
    | "due_date_not_passed"
    | "legacy_accounting_exists"
    | "no_outstanding_tuition"
    | "eligible";
};

/** Active system late fee rows must be reversible when DDL says no late fee yet (no due date / due date in the future). */
function shouldReverseActiveSystemLateFeesRegardlessOfLedger(
  eligibility: LateFeeEligibility,
): boolean {
  return (
    !eligibility.eligible &&
    (eligibility.reason === "due_date_not_passed" ||
      eligibility.reason === "missing_due_date")
  );
}

async function evaluateLateFeeEligibility(
  studentId: string,
  term: string,
  year: number,
  paymentDueDate: string | null,
): Promise<LateFeeEligibility> {
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
  const rows = (ledger?.rows ?? []) as LedgerRowForTuitionFlow[];
  const summarized = summarizeLedgerRowsIntoChargeBuckets(rows);
  const paid = distributeUnassignedPaymentsToBuckets(
    summarized.chargeTotals,
    summarized.paymentTotals,
    summarized.unassignedPayments,
  );
  const tuitionOutstanding = roundMoney(
    Math.max(0, summarized.chargeTotals.tuition - paid.tuition),
  );
  const lateFeeOutstanding = roundMoney(
    Math.max(0, summarized.chargeTotals.late_fee - paid.late_fee),
  );
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

export type LateFeeReconciliationPreview = {
  term: string;
  year: number;
  paymentDueDate: string | null;
  studentsScanned: number;
  wouldAddSystemLateFeeCount: number;
  wouldReverseInvalidSystemLateFeeCount: number;
  wouldRequireManualReviewCount: number;
  sampleReversalStudentId: string | null;
};

export async function previewLateFeeReconciliationForQuarter(
  term: string,
  year: number,
  paymentDueDateOverride?: string | null,
): Promise<LateFeeReconciliationPreview> {
  const t = term.trim();
  const y = Math.trunc(year);
  const current = await getFinanceQuarterDdlFromAcademicTerms(pool, t, y);
  const dueDate = paymentDueDateOverride === undefined
    ? current.paymentDueDate
    : paymentDueDateOverride;
  const studentIds = await listStudentIdsWithPortalQuarterActivity(pool, t, y);
  const feeRows = await listSystemLateFeeRowsForQuarter(pool, t, y);
  const activeByStudent = new Map<string, typeof feeRows>();
  for (const row of feeRows) {
    if (row.activeAmount <= 0) continue;
    const key = row.studentExternalId.trim();
    const arr = activeByStudent.get(key) ?? [];
    arr.push(row);
    activeByStudent.set(key, arr);
  }

  let wouldAddSystemLateFeeCount = 0;
  let wouldReverseInvalidSystemLateFeeCount = 0;
  let wouldRequireManualReviewCount = 0;
  let sampleReversalStudentId: string | null = null;

  for (const studentId of studentIds) {
    const eligible = await evaluateLateFeeEligibility(studentId, t, y, dueDate);
    const activeFees = activeByStudent.get(studentId) ?? [];
    if (eligible.eligible) {
      if (activeFees.length === 0) {
        wouldAddSystemLateFeeCount += 1;
      }
      continue;
    }
    if (activeFees.length === 0) continue;
    if (
      eligible.lateFeeOutstanding > 0 ||
      shouldReverseActiveSystemLateFeesRegardlessOfLedger(eligible)
    ) {
      wouldReverseInvalidSystemLateFeeCount += activeFees.length;
      if (sampleReversalStudentId == null) {
        sampleReversalStudentId = studentId;
      }
    } else {
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

export type LateFeeReconciliationResult = {
  ok: true;
  term: string;
  year: number;
  paymentDueDate: string | null;
  studentsScanned: number;
  insertedCount: number;
  reversedCount: number;
  protectedSettledCount: number;
  skippedCount: number;
  sampleReversal:
    | {
        studentId: string;
        originalLateFeeAdjustmentId: number;
        reversalAdjustmentId: number;
      }
    | null;
};

export async function reconcileLateFeesForQuarter(
  term: string,
  year: number,
): Promise<LateFeeReconciliationResult> {
  const t = term.trim();
  const y = Math.trunc(year);
  const { paymentDueDate } = await getFinanceQuarterDdlFromAcademicTerms(pool, t, y);
  const studentIds = await listStudentIdsWithPortalQuarterActivity(pool, t, y);
  const allFeeRows = await listSystemLateFeeRowsForQuarter(pool, t, y);
  const activeByStudent = new Map<string, typeof allFeeRows>();
  for (const row of allFeeRows) {
    if (row.activeAmount <= 0) continue;
    const key = row.studentExternalId.trim();
    const arr = activeByStudent.get(key) ?? [];
    arr.push(row);
    activeByStudent.set(key, arr);
  }

  let insertedCount = 0;
  let reversedCount = 0;
  let protectedSettledCount = 0;
  let skippedCount = 0;
  let sampleReversal: LateFeeReconciliationResult["sampleReversal"] = null;
  const feeAmount = roundMoney(30);

  for (const studentId of studentIds) {
    const eligibility = await evaluateLateFeeEligibility(
      studentId,
      t,
      y,
      paymentDueDate,
    );
    const activeFees = [...(activeByStudent.get(studentId) ?? [])].sort(
      (a, b) => a.id - b.id,
    );
    if (eligibility.eligible) {
      if (activeFees.length === 0) {
        await insertSystemLateFee(pool, {
          studentExternalId: studentId,
          term: t,
          year: y,
          amount: feeAmount,
        });
        insertedCount += 1;
      } else if (activeFees.length > 1) {
        let reversibleRemaining = roundMoney(
          Math.max(0, eligibility.lateFeeOutstanding - activeFees[0]!.activeAmount),
        );
        for (const fee of activeFees.slice(1)) {
          if (reversibleRemaining <= 0) {
            protectedSettledCount += 1;
            continue;
          }
          const reversalAmount = roundMoney(
            Math.min(fee.activeAmount, reversibleRemaining),
          );
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
          reversibleRemaining = roundMoney(
            Math.max(0, reversibleRemaining - reversalAmount),
          );
          if (sampleReversal == null) {
            sampleReversal = {
              studentId,
              originalLateFeeAdjustmentId: fee.id,
              reversalAdjustmentId: reversalId,
            };
          }
        }
      } else {
        skippedCount += 1;
      }
      continue;
    }

    if (activeFees.length === 0) {
      skippedCount += 1;
      continue;
    }

    let reversibleRemaining = shouldReverseActiveSystemLateFeesRegardlessOfLedger(
      eligibility,
    )
      ? roundMoney(
          activeFees.reduce(
            (sum, fee) => roundMoney(sum + Math.max(0, fee.activeAmount)),
            0,
          ),
        )
      : roundMoney(Math.max(0, eligibility.lateFeeOutstanding));
    for (const fee of activeFees) {
      if (reversibleRemaining <= 0) {
        protectedSettledCount += 1;
        continue;
      }
      const reversalAmount = roundMoney(
        Math.min(fee.activeAmount, reversibleRemaining),
      );
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
      reversibleRemaining = roundMoney(
        Math.max(0, reversibleRemaining - reversalAmount),
      );
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

export async function putQuarterSettings(input: {
  term: string;
  year: number;
  paymentDueDate: string | null;
  lateFeeEnabled?: boolean;
  lateFeeAmount?: number;
  updatedBy?: string | null;
}): Promise<
  | { ok: true; reconciliation: LateFeeReconciliationResult }
  | { ok: false; message: string }
> {
  void input.lateFeeEnabled;
  void input.lateFeeAmount;
  void input.updatedBy;
  const result = await setFinanceQuarterDdlOnAcademicTerms(
    pool,
    input.term,
    input.year,
    input.paymentDueDate,
  );
  if (result === "no_column") {
    return {
      ok: false,
      message: "Payment DDL persistence is not yet enabled on academic terms.",
    };
  }
  if (result === "not_found") {
    return {
      ok: false,
      message:
        "No matching academic term row for this quarter. Create it under Academic Terms first.",
    };
  }
  const reconciliation = await reconcileLateFeesForQuarter(input.term, input.year);
  return { ok: true, reconciliation };
}

export function parseBalanceFilterParam(
  raw: string | undefined,
): AdminFinanceRosterBalanceFilter {
  const s = (raw ?? "").trim().toLowerCase();
  if (
    s === "positive" ||
    s === "negative" ||
    s === "zero" ||
    s === "all"
  ) {
    return s;
  }
  return "all";
}

export function parseStatusFilterParam(
  raw: string | undefined,
): AdminFinanceStatusFilter {
  const s = (raw ?? "").trim().toLowerCase();
  if (
    s === "owes" ||
    s === "paid" ||
    s === "late_fee" ||
    s === "clinic_unpaid" ||
    s === "all"
  ) {
    return s;
  }
  return "all";
}

export function parseRosterScopeParam(
  raw: string | undefined,
): AdminFinanceRosterScope {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "all") return "all";
  return "quarter";
}

function statusFilterNeedsBuckets(
  filter: AdminFinanceStatusFilter,
): boolean {
  return filter === "late_fee" || filter === "clinic_unpaid";
}

function matchesFinanceBalanceFilter(
  balance: number,
  filter: AdminFinanceRosterBalanceFilter,
): boolean {
  const b = roundMoney(balance);
  if (filter === "all") return true;
  if (filter === "positive") return b > 0;
  if (filter === "negative") return b < 0;
  return b === 0;
}

function emptyFinanceBuckets(): AdminFinanceStudentBuckets {
  return {
    tuitionDue: 0,
    clinicDue: 0,
    lateFeeDue: 0,
    examDue: 0,
  };
}

async function computeFinanceBucketsForStudent(
  studentId: string,
  term: string,
  year: number,
): Promise<AdminFinanceStudentBuckets> {
  const requested = studentId.trim();
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, requested)) ?? requested;
  const ledger = await getAccountingLedgerPayload(
    canonical,
    term.trim(),
    year,
    {
      studentPortalLedgerPresentation: true,
      skipExpiredClinicalBookingReconciliation: true,
      skipLateFeeEvaluation: true,
    },
  );
  if (ledger == null) {
    return emptyFinanceBuckets();
  }
  const snap = computeTuitionBalanceSnapshot({
    requestedStudentId: requested,
    resolvedStudentId: canonical,
    term: ledger.term.trim() || term.trim(),
    year: ledger.year,
    rows: (ledger.rows ?? []) as LedgerRowForTuitionFlow[],
  });
  return {
    tuitionDue: snap.tuitionChargeAmountDue,
    clinicDue: roundMoney(
      Math.max(
        0,
        snap.chargeTotals.clinic_fee - snap.paidAllocations.clinic_fee,
      ),
    ),
    lateFeeDue: snap.lateFeeChargeAmountDue,
    examDue: roundMoney(
      Math.max(0, snap.chargeTotals.exam_fee - snap.paidAllocations.exam_fee),
    ),
  };
}

async function batchComputeFinanceBuckets(
  studentIds: string[],
  term: string,
  year: number,
  concurrency = 8,
): Promise<Map<string, AdminFinanceStudentBuckets>> {
  const out = new Map<string, AdminFinanceStudentBuckets>();
  const uniqueIds = [
    ...new Set(studentIds.map((s) => s.trim()).filter((s) => s !== "")),
  ];
  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const chunk = uniqueIds.slice(i, i + concurrency);
    const part = await Promise.all(
      chunk.map(async (id) => ({
        id,
        buckets: await computeFinanceBucketsForStudent(id, term, year),
      })),
    );
    for (const row of part) {
      out.set(row.id, row.buckets);
    }
  }
  return out;
}

function deriveFinanceStudentStatus(
  balance: number,
  buckets: AdminFinanceStudentBuckets,
  paymentDueDate: string | null,
): AdminFinanceStudentStatus {
  const b = roundMoney(balance);
  if (b < 0) return "credit";
  const hasBucketDue =
    buckets.tuitionDue > 0 ||
    buckets.clinicDue > 0 ||
    buckets.lateFeeDue > 0 ||
    buckets.examDue > 0;
  if (b <= 0 && !hasBucketDue) return "paid";
  if (b > 0 && paymentDueDate != null && isPastSchoolLocalDueDate(paymentDueDate)) {
    return "overdue";
  }
  if (b > 0 || hasBucketDue) return "owes";
  return "paid";
}

function matchesFinanceStatusFilter(
  balance: number,
  buckets: AdminFinanceStudentBuckets,
  status: AdminFinanceStudentStatus,
  filter: AdminFinanceStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "owes") return roundMoney(balance) > 0;
  if (filter === "paid") {
    return (
      status === "paid" ||
      (roundMoney(balance) <= 0 &&
        buckets.tuitionDue <= 0 &&
        buckets.clinicDue <= 0 &&
        buckets.lateFeeDue <= 0 &&
        buckets.examDue <= 0)
    );
  }
  if (filter === "late_fee") return buckets.lateFeeDue > 0;
  if (filter === "clinic_unpaid") return buckets.clinicDue > 0;
  return true;
}

function deriveFinanceStudentStatusFromBalanceOnly(
  balance: number,
  paymentDueDate: string | null,
): AdminFinanceStudentStatus {
  const b = roundMoney(balance);
  if (b < 0) return "credit";
  if (b <= 0) return "paid";
  if (
    paymentDueDate != null &&
    isPastSchoolLocalDueDate(paymentDueDate)
  ) {
    return "overdue";
  }
  return "owes";
}

function matchesFinanceStatusFilterBalanceOnly(
  balance: number,
  status: AdminFinanceStudentStatus,
  filter: AdminFinanceStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "owes") return roundMoney(balance) > 0;
  if (filter === "paid") return roundMoney(balance) <= 0;
  return true;
}

function buildFinanceStudentListItem(
  row: { studentId: string; name: string },
  balance: number,
  buckets: AdminFinanceStudentBuckets | null,
  paymentDueDate: string | null,
): AdminFinanceStudentListItem {
  const b = roundMoney(balance);
  if (buckets == null) {
    return {
      studentId: row.studentId,
      name: row.name,
      balance: b,
      tuitionDue: null,
      clinicDue: null,
      lateFeeDue: null,
      examDue: null,
      bucketsLoaded: false,
      status: deriveFinanceStudentStatusFromBalanceOnly(b, paymentDueDate),
    };
  }
  const status = deriveFinanceStudentStatus(b, buckets, paymentDueDate);
  return {
    studentId: row.studentId,
    name: row.name,
    balance: b,
    tuitionDue: buckets.tuitionDue,
    clinicDue: buckets.clinicDue,
    lateFeeDue: buckets.lateFeeDue,
    examDue: buckets.examDue,
    bucketsLoaded: true,
    status,
  };
}

function financeRosterQuery(
  term: string,
  year: number,
  searchTrimmed: string,
  rosterScope: AdminFinanceRosterScope,
): {
  searchTrimmed: string;
  rosterScope: AdminFinanceRosterScope;
  term: string;
  year: number;
} {
  return {
    searchTrimmed,
    rosterScope,
    term: term.trim(),
    year: Math.trunc(year),
  };
}

export async function getAdminFinanceQuarterSummary(
  term: string,
  year: number,
): Promise<AdminFinanceQuarterSummary> {
  const t = term.trim();
  const y = Math.trunc(year);
  const settings = await getQuarterSettingsPayload(t, y);
  const quarterRows = await listAdminFinanceRosterAllSearchOnlyOrdered(pool, {
    ...financeRosterQuery(t, y, "", "quarter"),
  });
  const quarterIds = quarterRows.map((r) => r.studentId);
  const maps = await loadQuarterBalanceAggregateMaps(t, y);
  const balMap = computeListQuarterBalancesFromAggregates(quarterIds, maps);
  let studentsOwing = 0;
  let totalOutstanding = 0;
  for (const id of quarterIds) {
    const b = roundMoney(balMap.get(id) ?? 0);
    if (b > 0) {
      studentsOwing += 1;
      totalOutstanding = roundMoney(totalOutstanding + b);
    }
  }
  return {
    term: t,
    year: y,
    paymentDueDate: settings.paymentDueDate,
    studentsOwing,
    totalOutstanding,
  };
}

type QuarterBalanceAggregateMaps = {
  legacyMap: Map<string, number>;
  adjMap: Map<string, number>;
  payMap: Map<string, number>;
  quarterActiveSet: Set<string>;
};

async function loadQuarterBalanceAggregateMaps(
  term: string,
  year: number,
): Promise<QuarterBalanceAggregateMaps> {
  const t = term.trim();
  const y = Math.trunc(year);
  const [legacyMap, adjMap, payMap, quarterActiveIds] = await Promise.all([
    sumLegacyAccountingBalanceByStudentForQuarter(pool, t, y),
    sumPortalBillingAdjustmentsNetByStudentForQuarter(pool, t, y),
    sumPortalPaymentsByStudentForQuarter(pool, t, y),
    listStudentIdsWithPortalQuarterActivity(pool, t, y),
  ]);
  return {
    legacyMap,
    adjMap,
    payMap,
    quarterActiveSet: new Set(quarterActiveIds),
  };
}

/** Fast roster balance: SQL aggregates only (no portal billing context / tuition synthesis). */
function computeListQuarterBalancesFromAggregates(
  studentIds: string[],
  maps: QuarterBalanceAggregateMaps,
): Map<string, number> {
  const out = new Map<string, number>();
  const uniqueIds = [
    ...new Set(studentIds.map((s) => s.trim()).filter((s) => s !== "")),
  ];
  for (const id of uniqueIds) {
    if (maps.legacyMap.has(id)) {
      const legacyNet = roundMoney(maps.legacyMap.get(id) ?? 0);
      const adjNet = roundMoney(maps.adjMap.get(id) ?? 0);
      out.set(id, roundMoney(legacyNet + adjNet));
      continue;
    }
    if (
      !maps.quarterActiveSet.has(id) &&
      roundMoney(maps.adjMap.get(id) ?? 0) === 0 &&
      roundMoney(maps.payMap.get(id) ?? 0) === 0
    ) {
      out.set(id, 0);
      continue;
    }
    const adjNet = roundMoney(maps.adjMap.get(id) ?? 0);
    const payNet = roundMoney(maps.payMap.get(id) ?? 0);
    out.set(id, roundMoney(adjNet - payNet));
  }
  return out;
}

/**
 * Merged quarter balance per student id: legacy `accounting` net + portal adjustments when
 * legacy rows exist; otherwise portal ledger net (tuition synthesis when enrollment-only).
 */
async function computeMergedFinanceQuarterBalancesForStudents(
  studentIds: string[],
  term: string,
  year: number,
): Promise<Map<string, number>> {
  const t = term.trim();
  const y = Math.trunc(year);
  const out = new Map<string, number>();
  const uniqueIds = [
    ...new Set(studentIds.map((s) => s.trim()).filter((s) => s !== "")),
  ];
  if (uniqueIds.length === 0) {
    return out;
  }

  const maps = await loadQuarterBalanceAggregateMaps(t, y);
  const { legacyMap, adjMap, payMap, quarterActiveSet } = maps;

  const portalOnlyIds = uniqueIds.filter((id) => !legacyMap.has(id));
  /** Tuition synthesis only when enrolled with no posted adjustment/payment rows yet. */
  const portalOnlyIdsNeedingCtx = portalOnlyIds.filter((id) => {
    const adjNet = roundMoney(adjMap.get(id) ?? 0);
    const payNet = roundMoney(payMap.get(id) ?? 0);
    if (adjNet !== 0 || payNet !== 0) return false;
    return quarterActiveSet.has(id);
  });
  const portalCtxByStudent = new Map<string, AccountContext>();
  const PORTAL_CTX_CHUNK = 200;
  for (let i = 0; i < portalOnlyIdsNeedingCtx.length; i += PORTAL_CTX_CHUNK) {
    const chunk = portalOnlyIdsNeedingCtx.slice(i, i + PORTAL_CTX_CHUNK);
    const part = await batchLoadPortalTermBillingContextsForQuarter(
      pool,
      chunk,
      t,
      y,
    );
    for (const [k, v] of part) {
      portalCtxByStudent.set(k, v);
    }
  }

  for (const id of uniqueIds) {
    if (legacyMap.has(id)) {
      const legacyNet = roundMoney(legacyMap.get(id) ?? 0);
      const adjNet = roundMoney(adjMap.get(id) ?? 0);
      out.set(id, roundMoney(legacyNet + adjNet));
      continue;
    }
    if (
      !quarterActiveSet.has(id) &&
      roundMoney(adjMap.get(id) ?? 0) === 0 &&
      roundMoney(payMap.get(id) ?? 0) === 0
    ) {
      out.set(id, 0);
      continue;
    }
    const ctx = portalCtxByStudent.get(id);
    if (ctx != null) {
      out.set(id, roundMoney(computePortalOnlyQuarterNetBalance(ctx)));
    } else {
      const adjNet = roundMoney(adjMap.get(id) ?? 0);
      const payNet = roundMoney(payMap.get(id) ?? 0);
      out.set(id, roundMoney(adjNet - payNet));
    }
  }

  return out;
}

/**
 * Paginated finance roster: one roster SQL (search + paging), one batched balance pass
 * (legacy aggregates, portal adjustment/payment sums, and batched portal billing contexts).
 */
export async function listAdminFinanceStudentsPaginated(
  term: string,
  year: number,
  query: {
    page: number;
    pageSize: number;
    search: string;
    balanceFilter: AdminFinanceRosterBalanceFilter;
    statusFilter: AdminFinanceStatusFilter;
    rosterScope: AdminFinanceRosterScope;
  },
): Promise<AdminFinanceStudentsListResponse> {
  console.time("[admin finance students] total");
  const t = term.trim();
  const y = Math.trunc(year);
  const page = Math.max(1, Math.trunc(query.page));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize)));
  const offset = (page - 1) * pageSize;
  const searchTrimmed = query.search.trim();
  const balanceFilter = query.balanceFilter;
  const statusFilter = query.statusFilter;
  const rosterScope = query.rosterScope;
  const rosterQuery = financeRosterQuery(t, y, searchTrimmed, rosterScope);
  const needsFullRosterPass =
    balanceFilter !== "all" || statusFilter !== "all";
  const needsBuckets = statusFilterNeedsBuckets(statusFilter);

  const [quarterSettings, balanceMaps] = await Promise.all([
    getQuarterSettingsPayload(t, y),
    needsBuckets ? Promise.resolve(null) : loadQuarterBalanceAggregateMaps(t, y),
  ]);
  const paymentDueDate = quarterSettings.paymentDueDate;

  try {
    if (!needsFullRosterPass) {
      console.time("[admin finance students] students query");
      const [total, rawRows] = await Promise.all([
        countAdminFinanceRosterSearchOnly(pool, rosterQuery),
        listAdminFinanceRosterPageSearchOnly(pool, {
          ...rosterQuery,
          limit: pageSize,
          offset,
        }),
      ]);
      console.timeEnd("[admin finance students] students query");

      console.time("[admin finance students] balance aggregate");
      const ids = rawRows.map((r) => r.studentId);
      const balMap =
        balanceMaps != null
          ? computeListQuarterBalancesFromAggregates(ids, balanceMaps)
          : await computeMergedFinanceQuarterBalancesForStudents(ids, t, y);
      console.timeEnd("[admin finance students] balance aggregate");

      const items: AdminFinanceStudentListItem[] = rawRows.map((r) =>
        buildFinanceStudentListItem(
          r,
          balMap.get(r.studentId) ?? 0,
          null,
          paymentDueDate,
        ),
      );
      return { items, total, page, pageSize };
    }

    console.time("[admin finance students] students query");
    const allRows = await listAdminFinanceRosterAllSearchOnlyOrdered(
      pool,
      rosterQuery,
    );
    console.timeEnd("[admin finance students] students query");

    console.time("[admin finance students] balance aggregate");
    const allIds = allRows.map((r) => r.studentId);
    const balMap =
      balanceMaps != null
        ? computeListQuarterBalancesFromAggregates(allIds, balanceMaps)
        : await computeMergedFinanceQuarterBalancesForStudents(allIds, t, y);
    const bucketMap = needsBuckets
      ? await batchComputeFinanceBuckets(allIds, t, y)
      : null;
    console.timeEnd("[admin finance students] balance aggregate");

    const filtered = allRows.filter((r) => {
      const balance = balMap.get(r.studentId) ?? 0;
      if (!matchesFinanceBalanceFilter(balance, balanceFilter)) {
        return false;
      }
      if (needsBuckets && bucketMap != null) {
        const buckets = bucketMap.get(r.studentId) ?? emptyFinanceBuckets();
        const status = deriveFinanceStudentStatus(
          balance,
          buckets,
          paymentDueDate,
        );
        return matchesFinanceStatusFilter(
          balance,
          buckets,
          status,
          statusFilter,
        );
      }
      const status = deriveFinanceStudentStatusFromBalanceOnly(
        balance,
        paymentDueDate,
      );
      return matchesFinanceStatusFilterBalanceOnly(
        balance,
        status,
        statusFilter,
      );
    });
    const total = filtered.length;
    const slice = filtered.slice(offset, offset + pageSize);
    const items: AdminFinanceStudentListItem[] = slice.map((r) => {
      const balance = balMap.get(r.studentId) ?? 0;
      const buckets =
        needsBuckets && bucketMap != null
          ? (bucketMap.get(r.studentId) ?? emptyFinanceBuckets())
          : null;
      return buildFinanceStudentListItem(
        r,
        balance,
        buckets,
        paymentDueDate,
      );
    });
    return { items, total, page, pageSize };
  } finally {
    console.timeEnd("[admin finance students] total");
  }
}

export async function getAdminFinanceQuarters(studentId: string) {
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, studentId)) ?? studentId.trim();
  return getAccountingQuartersPayload(canonical);
}

export async function getAdminFinanceLedger(
  studentId: string,
  term: string,
  year: number,
) {
  const requested = studentId.trim();
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, requested)) ?? requested;
  const payload = await getAccountingLedgerPayload(
    canonical,
    term.trim(),
    year,
  );
  if (payload == null) {
    return null;
  }
  const presentation = await getAccountingLedgerPayload(
    canonical,
    term.trim(),
    year,
    {
      studentPortalLedgerPresentation: true,
      skipExpiredClinicalBookingReconciliation: true,
      skipLateFeeEvaluation: true,
    },
  );
  const tuitionSnap =
    presentation == null
      ? null
      : computeTuitionBalanceSnapshot({
          requestedStudentId: requested,
          resolvedStudentId: canonical,
          term: presentation.term.trim() || term.trim(),
          year: presentation.year,
          rows: (presentation.rows ?? []) as LedgerRowForTuitionFlow[],
        });
  const bucketSummary =
    tuitionSnap == null
      ? null
      : {
          tuitionDue: tuitionSnap.tuitionChargeAmountDue,
          clinicDue: roundMoney(
            Math.max(
              0,
              tuitionSnap.chargeTotals.clinic_fee -
                tuitionSnap.paidAllocations.clinic_fee,
            ),
          ),
          lateFeeDue: tuitionSnap.lateFeeChargeAmountDue,
          examDue: roundMoney(
            Math.max(
              0,
              tuitionSnap.chargeTotals.exam_fee -
                tuitionSnap.paidAllocations.exam_fee,
            ),
          ),
        };
  console.log("[admin-ledger-summary]", {
    studentId: canonical,
    requestedStudentId: requested,
    term: payload.term,
    year: payload.year,
    totalCharges: payload.summary.totalCharges,
    totalPayments: payload.summary.totalPayments,
    balance: payload.summary.balance,
    tuitionPayFlowBalance: tuitionSnap?.tuitionBalanceDue ?? null,
  });
  return {
    ...payload,
    studentId: canonical,
    tuitionPayFlowSummary:
      tuitionSnap == null
        ? null
        : {
            tuitionCharges: tuitionSnap.tuitionCharges,
            lateFees: tuitionSnap.lateFees,
            tuitionPaymentsApplied: tuitionSnap.tuitionPayments,
            lateFeePaymentsApplied: tuitionSnap.lateFeePayments,
            tuitionBalanceDue: tuitionSnap.tuitionBalanceDue,
            tuitionChargeAmountDue: tuitionSnap.tuitionChargeAmountDue,
            lateFeeChargeAmountDue: tuitionSnap.lateFeeChargeAmountDue,
          },
    bucketSummary,
  };
}

export type PostAdminChargeInput = {
  studentId: string;
  term: string;
  year: number;
  description: string;
  amount: number;
  category?: PortalBillingCategory;
};

export type PostAdminPaymentInput = {
  studentId: string;
  term: string;
  year: number;
  amount: number;
  paidAt?: string;
  method?: string;
  description?: string;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseCategory(raw: unknown): PortalBillingCategory | null {
  if (raw === undefined || raw === null) return "tuition";
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return "tuition";
  if ((CHARGE_CATEGORIES as string[]).includes(s)) {
    return s as PortalBillingCategory;
  }
  return null;
}

export function validatePostChargeBody(
  raw: unknown,
): { ok: true; data: PostAdminChargeInput } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
  const term = typeof o.term === "string" ? o.term.trim() : "";
  const yearRaw = o.year;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
        ? Number(yearRaw)
        : Number.NaN;
  const description =
    typeof o.description === "string" ? o.description.trim() : "";
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : Number.NaN;

  if (studentId === "" || term === "" || !Number.isFinite(year)) {
    return {
      ok: false,
      error:
        "studentId, term, and year are required; year must be a finite number.",
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
      error:
        "category must be one of: fees, other, tuition, clinical, exam (or omit for tuition).",
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

export function validatePostPaymentBody(
  raw: unknown,
): { ok: true; data: PostAdminPaymentInput } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
  const term = typeof o.term === "string" ? o.term.trim() : "";
  const yearRaw = o.year;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
        ? Number(yearRaw)
        : Number.NaN;
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : Number.NaN;

  if (studentId === "" || term === "" || !Number.isFinite(year)) {
    return {
      ok: false,
      error:
        "studentId, term, and year are required; year must be a finite number.",
    };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a number greater than 0." };
  }

  let paidAt: string | undefined;
  if (o.paidAt === undefined || o.paidAt === null) {
    paidAt = todayIsoDate();
  } else if (typeof o.paidAt === "string" && o.paidAt.trim() !== "") {
    paidAt = o.paidAt.trim().slice(0, 10);
  } else {
    return {
      ok: false,
      error: "paidAt must be an ISO date string (YYYY-MM-DD) or omitted.",
    };
  }

  const method =
    o.method === undefined || o.method === null
      ? "admin"
      : typeof o.method === "string" && o.method.trim() !== ""
        ? o.method.trim()
        : null;
  if (method == null) {
    return { ok: false, error: "method must be a non-empty string or omitted." };
  }

  const description =
    o.description === undefined || o.description === null
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

export async function postAdminFinanceCharge(
  input: PostAdminChargeInput,
): Promise<void> {
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, input.studentId)) ??
    input.studentId.trim();
  await insertPortalBillingAdjustment(pool, {
    studentExternalId: canonical,
    term: input.term,
    year: input.year,
    description: input.description,
    amount: input.amount,
    category: input.category ?? "tuition",
    adjustmentSource: "admin_manual_charge",
  });
}

export async function postAdminFinancePayment(
  input: PostAdminPaymentInput,
): Promise<void> {
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, input.studentId)) ??
    input.studentId.trim();
  const baseDesc = (input.description ?? "Admin recorded payment").trim();
  const desc =
    baseDesc.startsWith("[admin_manual_payment]")
      ? baseDesc.slice(0, 255)
      : `[admin_manual_payment] ${baseDesc}`.slice(0, 255);
  await insertPortalPayment(pool, {
    studentExternalId: canonical,
    term: input.term,
    year: input.year,
    amount: input.amount,
    paidAt: input.paidAt ?? todayIsoDate(),
    method: input.method ?? "admin",
    description: desc,
  });
}

export function validatePutChargeBody(
  raw: unknown,
): { ok: true; data: { description: string; amount: number; category: PortalBillingCategory } } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const description =
    typeof o.description === "string" ? o.description.trim() : "";
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number"
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
      error:
        "category must be one of: fees, other, tuition, clinical, exam (or omit for tuition).",
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

export function validatePutPaymentBody(
  raw: unknown,
): {
  ok: true;
  data: { amount: number; paidAt: string; method: string; description: string | null };
} | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : Number.NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be a number greater than 0." };
  }
  const paidAt =
    typeof o.paidAt === "string" && o.paidAt.trim() !== ""
      ? o.paidAt.trim().slice(0, 10)
      : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
    return { ok: false, error: "paidAt must be YYYY-MM-DD." };
  }
  const method =
    typeof o.method === "string" && o.method.trim() !== ""
      ? o.method.trim()
      : "";
  if (method === "") {
    return { ok: false, error: "method is required." };
  }
  let description: string | null;
  if (o.description === undefined || o.description === null) {
    description = null;
  } else if (typeof o.description === "string") {
    const s = o.description.trim();
    description = s === "" ? null : s;
  } else {
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

export async function putAdminFinanceCharge(
  id: number,
  body: { description: string; amount: number; category: PortalBillingCategory },
): Promise<void> {
  try {
    await updateManualBillingAdjustment(pool, id, body);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_MANUAL_OR_MISSING") {
      const err = new Error(
        "Charge not found or is not an editable manual adjustment.",
      );
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
    throw e;
  }
}

export async function deleteAdminFinanceCharge(id: number): Promise<void> {
  try {
    await deleteManualBillingAdjustment(pool, id);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_MANUAL_OR_MISSING") {
      const err = new Error(
        "Charge not found or is not a deletable manual adjustment.",
      );
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
    throw e;
  }
}

export async function putAdminFinancePayment(
  id: number,
  body: {
    amount: number;
    paidAt: string;
    method: string;
    description: string | null;
  },
): Promise<void> {
  const row = await getPortalPaymentById(pool, id);
  if (row == null) {
    const err = new Error("Payment not found.");
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }
  await updatePortalPayment(pool, id, body);
}

export async function deleteAdminFinancePayment(id: number): Promise<void> {
  try {
    await deletePortalPayment(pool, id);
  } catch (e) {
    if (e instanceof Error && e.message === "MISSING_PAYMENT") {
      const err = new Error("Payment not found.");
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
    throw e;
  }
}

export async function verifyManualChargeForStudentTerm(
  id: number,
  studentId: string,
  term: string,
  year: number,
): Promise<boolean> {
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, studentId)) ?? studentId.trim();
  const row = await getBillingAdjustmentById(pool, id);
  if (row == null) return false;
  const src = String(row.adjustmentSource ?? "").trim().toLowerCase();
  if (src !== "manual" && src !== "admin_manual_charge") return false;
  return (
    row.studentExternalId.trim() === canonical &&
    row.term.trim().toLowerCase() === term.trim().toLowerCase() &&
    row.year === Math.trunc(year)
  );
}

export async function verifyPaymentForStudentTerm(
  id: number,
  studentId: string,
  term: string,
  year: number,
): Promise<boolean> {
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, studentId)) ?? studentId.trim();
  const row = await getPortalPaymentById(pool, id);
  if (row == null) return false;
  return (
    row.studentExternalId.trim() === canonical &&
    row.term.trim().toLowerCase() === term.trim().toLowerCase() &&
    row.year === Math.trunc(year)
  );
}

export async function runLateFeeCheckForQuarter(
  term: string,
  year: number,
): Promise<{
  ok: true;
  insertedCount: number;
  skippedCount: number;
  message?: string;
}> {
  const t = term.trim();
  const y = Math.trunc(year);
  const result = await reconcileLateFeesForQuarter(t, y);
  return {
    ok: true,
    insertedCount: result.insertedCount,
    skippedCount: result.skippedCount + result.protectedSettledCount,
    message:
      result.reversedCount > 0
        ? `Reconciled late fees: inserted ${result.insertedCount}, reversed ${result.reversedCount}.`
        : undefined,
  };
}

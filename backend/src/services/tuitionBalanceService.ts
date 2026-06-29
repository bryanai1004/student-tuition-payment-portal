import { type Pool } from "../lib/db.js";
import { resolveCanonicalStudentExternalId } from "../repositories/studentIdentityRepository.js";
import { getAccountingLedgerPayload } from "./studentLedgerService.js";
import {
  classifyDebitChargeBucket,
  distributeUnassignedPaymentsToBuckets,
  inferPaymentBucketForCredit,
  summarizeLedgerRowsIntoChargeBuckets,
  type LedgerRowForTuitionFlow,
  type PaymentChargeBucket,
} from "./ledgerTuitionFlowMath.js";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Operator-facing Pay Tuition balance composition (single `[tuition-summary breakdown]` log line). */
export function logTuitionSummaryBreakdown(args: {
  studentId: string;
  term: string;
  year: number;
  rows: LedgerRowForTuitionFlow[];
  snapshot: TuitionBalanceSnapshotDetails;
}): void {
  let baseTuitionCharges = 0;
  let tuitionFeeCharges = 0;
  let tuitionAdjustmentsIncluded = 0;
  let examAdjustmentsExcluded = 0;
  let clinicalAdjustmentsExcluded = 0;
  let examPaymentsExcluded = 0;
  let clinicalPaymentsExcluded = 0;

  for (const row of args.rows) {
    const debit = roundMoney(Math.max(0, Number(row.debit) || 0));
    if (debit > 0) {
      const bucket = classifyDebitChargeBucket(row);
      const typeLower = String(row.type ?? "").trim().toLowerCase();
      if (bucket === "tuition") {
        if (typeLower === "tuition") {
          baseTuitionCharges = roundMoney(baseTuitionCharges + debit);
        } else if (typeLower === "fee") {
          tuitionFeeCharges = roundMoney(tuitionFeeCharges + debit);
        } else if (typeLower === "adjustment") {
          tuitionAdjustmentsIncluded = roundMoney(tuitionAdjustmentsIncluded + debit);
        }
      } else if (bucket === "exam_fee") {
        examAdjustmentsExcluded = roundMoney(examAdjustmentsExcluded + debit);
      } else if (bucket === "clinic_fee") {
        clinicalAdjustmentsExcluded = roundMoney(clinicalAdjustmentsExcluded + debit);
      }
    }

    const credit = roundMoney(Math.max(0, Number(row.credit) || 0));
    if (credit > 0) {
      const payBucket = inferPaymentBucketForCredit(row);
      if (payBucket === "exam_fee") {
        examPaymentsExcluded = roundMoney(examPaymentsExcluded + credit);
      } else if (payBucket === "clinic_fee") {
        clinicalPaymentsExcluded = roundMoney(clinicalPaymentsExcluded + credit);
      }
    }
  }

  console.log("[tuition-summary breakdown]", {
    studentId: args.studentId,
    term: args.term,
    year: args.year,
    baseTuitionCharges,
    tuitionFeeCharges,
    tuitionAdjustmentsIncluded,
    examAdjustmentsExcluded,
    clinicalAdjustmentsExcluded,
    tuitionPaymentsIncluded: args.snapshot.tuitionPayments,
    examPaymentsExcluded,
    clinicalPaymentsExcluded,
    tuitionTotalDue: args.snapshot.tuitionBalanceDue,
  });
}

export type TuitionBalanceForTermResult = {
  resolvedStudentId: string;
  term: string;
  year: number;
  /** Gross tuition-bucket charges before payment allocation. */
  tuitionCharges: number;
  /** Tuition + fees + other adjustment debits (subset of tuition bucket ex. course lines). */
  tuitionAdjustments: number;
  /** Payments typed or allocated to tuition (after distribution). */
  tuitionPayments: number;
  lateFees: number;
  lateFeePayments: number;
  excludedClinical: number;
  excludedExam: number;
  /** Same as student Pay Tuition `tuitionCharge.amountDue` + `lateFeeCharge.amountDue`. */
  tuitionBalanceDue: number;
  tuitionChargeAmountDue: number;
  lateFeeChargeAmountDue: number;
};

export type TuitionBalanceSnapshotDetails = TuitionBalanceForTermResult & {
  chargeTotals: Record<PaymentChargeBucket, number>;
  paidAllocations: Record<PaymentChargeBucket, number>;
};

export function computeTuitionBalanceSnapshot(args: {
  requestedStudentId: string;
  resolvedStudentId: string;
  term: string;
  year: number;
  rows: LedgerRowForTuitionFlow[];
}): TuitionBalanceSnapshotDetails {
  const rows = args.rows;
  const summarized = summarizeLedgerRowsIntoChargeBuckets(rows);
  const paid = distributeUnassignedPaymentsToBuckets(
    summarized.chargeTotals,
    summarized.paymentTotals,
    summarized.unassignedPayments,
  );

  let tuitionAdjustments = 0;
  for (const row of rows) {
    const debit = roundMoney(Math.max(0, Number(row.debit) || 0));
    if (debit <= 0) continue;
    if (String(row.type ?? "").trim() !== "Adjustment") continue;
    if (classifyDebitChargeBucket(row) !== "tuition") continue;
    tuitionAdjustments = roundMoney(tuitionAdjustments + debit);
  }

  const tuitionChargeAmountDue = roundMoney(
    Math.max(0, summarized.chargeTotals.tuition - paid.tuition),
  );
  const lateFeeChargeAmountDue = roundMoney(
    Math.max(0, summarized.chargeTotals.late_fee - paid.late_fee),
  );
  const tuitionBalanceDue = roundMoney(
    tuitionChargeAmountDue + lateFeeChargeAmountDue,
  );

  return {
    resolvedStudentId: args.resolvedStudentId,
    term: args.term.trim(),
    year: Math.trunc(args.year),
    tuitionCharges: summarized.chargeTotals.tuition,
    tuitionAdjustments,
    tuitionPayments: paid.tuition,
    lateFees: summarized.chargeTotals.late_fee,
    lateFeePayments: paid.late_fee,
    excludedClinical: summarized.chargeTotals.clinic_fee,
    excludedExam: summarized.chargeTotals.exam_fee,
    tuitionBalanceDue,
    tuitionChargeAmountDue,
    lateFeeChargeAmountDue,
    chargeTotals: summarized.chargeTotals,
    paidAllocations: paid,
  };
}

/**
 * Single source of truth for Pay Tuition balance (tuition + late fee buckets, portal presentation).
 */
export async function getTuitionBalanceForTerm(
  db: Pool,
  input: {
    studentId: string;
    term: string;
    year: number;
    /** When set, logs `[tuition-summary]` for operator verification. */
    logLabel?: "tuition-summary";
    requestedStudentId?: string;
    /** When already resolved upstream, skips duplicate lookup. */
    resolvedStudentId?: string;
  },
): Promise<TuitionBalanceForTermResult | null> {
  const requestedStudentId = (input.requestedStudentId ?? input.studentId).trim();
  const resolved =
    input.resolvedStudentId?.trim() ||
    (await resolveCanonicalStudentExternalId(db, input.studentId.trim())) ||
    input.studentId.trim();
  if (resolved === "") {
    return null;
  }

  const termTrim = input.term.trim();
  const year = Math.trunc(input.year);
  const ledger = await getAccountingLedgerPayload(resolved, termTrim, year, {
    studentPortalLedgerPresentation: true,
  });
  if (ledger == null) {
    return null;
  }

  const details = computeTuitionBalanceSnapshot({
    requestedStudentId,
    resolvedStudentId: resolved,
    term: ledger.term.trim() || termTrim,
    year: ledger.year,
    rows: (ledger.rows ?? []) as LedgerRowForTuitionFlow[],
  });

  const out: TuitionBalanceForTermResult = {
    resolvedStudentId: details.resolvedStudentId,
    term: details.term,
    year: details.year,
    tuitionCharges: details.tuitionCharges,
    tuitionAdjustments: details.tuitionAdjustments,
    tuitionPayments: details.tuitionPayments,
    lateFees: details.lateFees,
    lateFeePayments: details.lateFeePayments,
    excludedClinical: details.excludedClinical,
    excludedExam: details.excludedExam,
    tuitionBalanceDue: details.tuitionBalanceDue,
    tuitionChargeAmountDue: details.tuitionChargeAmountDue,
    lateFeeChargeAmountDue: details.lateFeeChargeAmountDue,
  };

  if (input.logLabel === "tuition-summary") {
    logTuitionSummaryBreakdown({
      studentId: out.resolvedStudentId,
      term: out.term,
      year: out.year,
      rows: (ledger.rows ?? []) as LedgerRowForTuitionFlow[],
      snapshot: details,
    });
  }

  return out;
}

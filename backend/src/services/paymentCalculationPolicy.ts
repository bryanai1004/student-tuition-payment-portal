/**
 * Payment calculation rules for the student portal (account summary, Pay Tuition, clinic/exam flows).
 *
 * Official reference: {@link AMU_SOURCE_DOCUMENTS.tuitionPaymentPortal} (see `backend/knowledge/SOURCE_INDEX.md`).
 *
 * Implementation:
 * - Portal course charges: {@link calculateCourseCharge}, {@link buildEnrollmentLineItems} in `billingMath.ts`
 * - Account summary buckets: {@link buildStudentAccountSummary}
 * - Ledger buckets (Authorize.net): {@link classifyDebitChargeBucket} in `ledgerTuitionFlowMath.ts`
 * - Pay Tuition balance: {@link computeTuitionBalanceSnapshot} in `tuitionBalanceService.ts`
 * - Checkout validation: {@link computeMaxPaymentBaseAmount} in `paymentAmountValidation.ts`
 * - System late fees: {@link reconcileLateFeesForQuarter} in `adminFinanceService.ts`
 */

import {
  AMU_SOURCE_DOCUMENTS,
  describeAmuSourceDocument,
} from "../config/amuSourceDocuments.js";
import {
  CLINICAL_RATE,
  DIDACTIC_RATE,
  INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT,
  MAX_INSTALLMENTS_PER_QUARTER,
  MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER,
} from "./billingMath.js";

/** Repo path to the official tuition/payment portal policy PDF (relative to `backend/`). */
export const PAYMENT_POLICY_OFFICIAL_SOURCE =
  AMU_SOURCE_DOCUMENTS.tuitionPaymentPortal;

export const PAYMENT_POLICY_OFFICIAL_SOURCE_LABEL = describeAmuSourceDocument(
  "tuitionPaymentPortal",
);

export {
  DIDACTIC_RATE,
  CLINICAL_RATE,
  INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT,
  MAX_INSTALLMENTS_PER_QUARTER,
  MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER,
};

/** Default system late fee when reconciliation inserts `system_late_fee` rows (see admin finance). */
export const DEFAULT_LATE_FEE_AMOUNT = 30;

export const PAYMENT_CALCULATION_POLICY_SUMMARY = [
  `Didactic/lab tuition: units × $${DIDACTIC_RATE} per quarter unit (category tuition).`,
  `Clinical course tuition on the academic schedule: clock hours × $${CLINICAL_RATE} (category clinical).`,
  `Clinical booking / exam fees: separate ledger buckets (clinic_fee, exam_fee), not mixed into Pay Tuition course lines.`,
  `Standard term fees: technology/facility and malpractice when portal enrollments exist (category fees).`,
  `Installment plan: optional $${INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT} non-refundable fee per installment (max ${MAX_INSTALLMENTS_PER_QUARTER} installments, $${MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER}/quarter cap on account summary).`,
  `Online Pay Tuition: amount validated server-side against ledger amountDue; installment payments may include one installment service fee ($${INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT}) above tuition due for that charge.`,
  `Late fees: $${DEFAULT_LATE_FEE_AMOUNT} system adjustment after payment due date when tuition remains outstanding (portal ledger students); assessed/reversed by admin reconciliation.`,
  `Account summary totalCharges = tuition + clinical + fees + other + exam line items minus recorded payments.`,
].join(" ");

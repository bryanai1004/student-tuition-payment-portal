import { pool } from "../lib/db.js";
import { getAccountingLedgerPayload } from "./studentLedgerService.js";
import { chargeAuthorizeOpaqueData } from "./authorizeNetGatewayService.js";
import { recordAuthorizeNetPayment } from "../repositories/studentAuthorizePaymentRepository.js";
import {
  inferCardFundingFromBinPrefix,
  normalizeCardBinPrefix,
} from "./cardFundingFromBin.js";
import { totalChargeWithProcessingFee } from "./creditCardProcessingFee.js";
import {
  parsePaymentBillingDetails,
  splitCardholderNameForBillTo,
} from "./paymentBillingFields.js";

export { proportionalProcessingFeeRefund } from "./creditCardProcessingFee.js";
import {
  getFinanceQuarterDdlFromAcademicTerms,
} from "../repositories/adminFinanceRepository.js";
import { revokeExpiredClinicalBooking } from "./clinicalBookingPaymentHoldService.js";
import { getLatestClinicalBookingPaymentHoldStatusForStudentQuarter } from "../repositories/clinicalBookingPaymentHoldRepository.js";
import { resolveCanonicalStudentExternalId } from "../repositories/studentIdentityRepository.js";
import {
  computeTuitionBalanceSnapshot,
  logTuitionSummaryBreakdown,
} from "./tuitionBalanceService.js";
import type { LedgerRowForTuitionFlow } from "./ledgerTuitionFlowMath.js";

type OpaqueDataInput = {
  dataDescriptor: string;
  dataValue: string;
};

export type PaymentChargeType = "tuition" | "clinic_fee" | "exam_fee" | "late_fee";
export type PaymentPlan = "full" | "installment";
export type PaymentChargeStatus = "pending" | "paid";
export type ClinicFeeStatus =
  | "pending"
  | "paid"
  | "expired"
  | "registration_cancelled";

export type AuthorizeChargeBody = {
  term: string;
  amount: number;
  chargeType: PaymentChargeType;
  paymentPlan: PaymentPlan;
  installmentCount: 1 | 2 | 3;
  opaqueData: OpaqueDataInput;
  /** First 6–8 digits of the PAN (BIN); used only for credit vs debit fee rules. */
  cardBinPrefix: string;
  cardholderName: string;
  billingZip: string;
};

export type AuthorizeChargeResult = {
  /** Total charged to the card (base + processing fee). */
  amount: string;
  baseAmount: string;
  processingFee: string;
  cardFunding: "credit" | "debit" | "unknown";
  providerTransactionId: string;
  invoiceNumber: string;
};

export type BillingChargeBucket = {
  type: PaymentChargeType;
  term: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  status: PaymentChargeStatus;
  dueDate: string | null;
  isInstallmentEligible: boolean;
};

export type CurrentTermBillingSummary = {
  term: string;
  year: number;
  paymentDeadline: string | null;
  tuitionCharge: BillingChargeBucket;
  clinicFeeCharge: BillingChargeBucket;
  clinicFeeStatus: ClinicFeeStatus;
  examFeeCharge: BillingChargeBucket;
  lateFeeCharge: BillingChargeBucket;
  requiredBalanceDue: number;
  totalBalanceDue: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseChargeType(raw: unknown): PaymentChargeType | null {
  const v = String(raw ?? "tuition").trim().toLowerCase();
  if (
    v === "tuition" ||
    v === "clinic_fee" ||
    v === "exam_fee" ||
    v === "late_fee"
  ) {
    return v;
  }
  return null;
}

function parsePaymentPlan(raw: unknown): PaymentPlan | null {
  const v = String(raw ?? "full").trim().toLowerCase();
  if (v === "full" || v === "installment") {
    return v;
  }
  return null;
}

function parseInstallmentCount(raw: unknown): 1 | 2 | 3 | null {
  const n =
    typeof raw === "number" ? raw
    : typeof raw === "string" ? Number(raw)
    : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const whole = Math.trunc(n);
  if (whole === 1 || whole === 2 || whole === 3) return whole;
  return null;
}

function isInstallmentEligible(chargeType: PaymentChargeType): boolean {
  return chargeType === "tuition";
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseTermCode(raw: string): { term: string; year: number; termCode: string } | null {
  const input = raw.trim();
  const coded = /^(\d{4})\s*[-_/]\s*([a-zA-Z]+)$/.exec(input);
  if (coded) {
    const year = Number(coded[1]);
    const code = coded[2].trim().toUpperCase();
    const term =
      code.startsWith("SPR") ? "Spring"
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
    const term =
      token.startsWith("SPR") ? "Spring"
      : token.startsWith("SUM") ? "Summer"
      : token.startsWith("FAL") ? "Fall"
      : token.startsWith("WIN") ? "Winter"
      : "";
    const suffix =
      token.startsWith("SPR") ? "SPR"
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

function roundToMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

function buildTermBucket(
  type: PaymentChargeType,
  term: string,
  amount: number,
  paid: number,
  dueDate: string | null,
): BillingChargeBucket {
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

function deadlineHasPassed(deadline: string | null): boolean {
  const due = typeof deadline === "string" ? deadline.trim() : "";
  if (due === "") return false;
  return isoToday() > due;
}

async function resolveClinicFeeStatus(args: {
  studentId: string;
  term: string;
  year: number;
  amount: number;
  amountDue: number;
  paymentDeadline: string | null;
}): Promise<ClinicFeeStatus> {
  const totalAssessed = roundToMoney(Math.max(0, args.amount));
  const remainingDue = roundToMoney(Math.max(0, args.amountDue));
  if (totalAssessed <= 0) {
    const latestHoldStatus =
      await getLatestClinicalBookingPaymentHoldStatusForStudentQuarter(
        args.studentId,
        args.term,
        args.year,
      );
    if (
      latestHoldStatus === "expired_auto_dropped" ||
      latestHoldStatus === "cancelled_enrollment_inactive" ||
      latestHoldStatus === "cancelled_manual_drop" ||
      latestHoldStatus === "cancelled_superseded"
    ) {
      return "registration_cancelled";
    }
    return "pending";
  }
  if (remainingDue <= 0) {
    return "paid";
  }
  if (!deadlineHasPassed(args.paymentDeadline)) {
    return "pending";
  }

  await revokeExpiredClinicalBooking(args.studentId);
  const latestHoldStatus =
    await getLatestClinicalBookingPaymentHoldStatusForStudentQuarter(
      args.studentId,
      args.term,
      args.year,
    );
  if (
    latestHoldStatus === "expired_auto_dropped" ||
    latestHoldStatus === "cancelled_enrollment_inactive" ||
    latestHoldStatus === "cancelled_manual_drop" ||
    latestHoldStatus === "cancelled_superseded"
  ) {
    return "registration_cancelled";
  }
  return "registration_cancelled";
}

async function buildCurrentTermBillingSummary(args: {
  studentId: string;
  requestedStudentId: string;
  term: string;
  year: number;
  paymentDeadline: string | null;
  emitTuitionSummaryDebugLog?: boolean;
}): Promise<CurrentTermBillingSummary> {
  const ledger = await getAccountingLedgerPayload(
    args.studentId,
    args.term,
    args.year,
    { studentPortalLedgerPresentation: true },
  );
  const rows = (ledger?.rows ?? []) as LedgerRowForTuitionFlow[];
  const details = computeTuitionBalanceSnapshot({
    requestedStudentId: args.requestedStudentId,
    resolvedStudentId: args.studentId,
    term: ledger?.term ?? args.term,
    year: ledger?.year ?? args.year,
    rows,
  });
  const summarized = {
    chargeTotals: details.chargeTotals as Record<PaymentChargeType, number>,
  };
  const paid = details.paidAllocations as Record<PaymentChargeType, number>;
  const tuitionCharge = buildTermBucket(
    "tuition",
    args.term,
    summarized.chargeTotals.tuition,
    paid.tuition,
    args.paymentDeadline,
  );
  const clinicFeeCharge = buildTermBucket(
    "clinic_fee",
    args.term,
    summarized.chargeTotals.clinic_fee,
    paid.clinic_fee,
    args.paymentDeadline,
  );
  const examFeeCharge = buildTermBucket(
    "exam_fee",
    args.term,
    summarized.chargeTotals.exam_fee,
    paid.exam_fee,
    args.paymentDeadline,
  );
  const lateFeeCharge = buildTermBucket(
    "late_fee",
    args.term,
    summarized.chargeTotals.late_fee,
    paid.late_fee,
    isoToday(),
  );
  const clinicFeeStatus = await resolveClinicFeeStatus({
    studentId: args.studentId,
    term: args.term,
    year: args.year,
    amount: clinicFeeCharge.amount,
    amountDue: clinicFeeCharge.amountDue,
    paymentDeadline: args.paymentDeadline,
  });
  const requiredBalanceDue = roundToMoney(
    tuitionCharge.amountDue + clinicFeeCharge.amountDue + examFeeCharge.amountDue,
  );
  const totalBalanceDue = roundToMoney(requiredBalanceDue + lateFeeCharge.amountDue);
  if (args.emitTuitionSummaryDebugLog === true) {
    logTuitionSummaryBreakdown({
      studentId: args.studentId,
      term: args.term,
      year: args.year,
      rows,
      snapshot: details,
    });
  }
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

export async function getCurrentTermBillingSummary(input: {
  studentId: string;
  termInput: string;
  emitTuitionSummaryDebugLog?: boolean;
}): Promise<CurrentTermBillingSummary> {
  const parsed = parseTermCode(input.termInput);
  if (!parsed) {
    throw new Error("term must be in `YYYY-TERM` format (example: 2027-SPR).");
  }
  const requested = input.studentId.trim();
  const canonical =
    (await resolveCanonicalStudentExternalId(pool, requested)) ?? requested;
  const { paymentDueDate } = await getFinanceQuarterDdlFromAcademicTerms(
    pool,
    parsed.term,
    parsed.year,
  );
  return buildCurrentTermBillingSummary({
    studentId: canonical,
    requestedStudentId: requested,
    term: parsed.term,
    year: parsed.year,
    paymentDeadline: paymentDueDate,
    emitTuitionSummaryDebugLog: input.emitTuitionSummaryDebugLog === true,
  });
}

export type TuitionOnlyBillingSummary = {
  term: string;
  year: number;
  paymentDeadline: string | null;
  tuitionCharge: BillingChargeBucket;
  lateFeeCharge: BillingChargeBucket;
  examFeeCharge: BillingChargeBucket;
  tuitionTotalDue: number;
};

export type ClinicFeeBillingSummary = {
  term: string;
  year: number;
  paymentDeadline: string | null;
  clinicFeeCharge: BillingChargeBucket;
  clinicFeeStatus: ClinicFeeStatus;
};

export async function getTuitionOnlyBillingSummary(input: {
  studentId: string;
  termInput: string;
}): Promise<TuitionOnlyBillingSummary> {
  const summary = await getCurrentTermBillingSummary({
    ...input,
    emitTuitionSummaryDebugLog: true,
  });
  return {
    term: summary.term,
    year: summary.year,
    paymentDeadline: summary.paymentDeadline,
    tuitionCharge: summary.tuitionCharge,
    lateFeeCharge: summary.lateFeeCharge,
    examFeeCharge: summary.examFeeCharge,
    tuitionTotalDue: roundToMoney(
      summary.tuitionCharge.amountDue + summary.lateFeeCharge.amountDue,
    ),
  };
}

export async function getClinicFeeBillingSummary(input: {
  studentId: string;
  termInput: string;
}): Promise<ClinicFeeBillingSummary> {
  const summary = await getCurrentTermBillingSummary(input);
  return {
    term: summary.term,
    year: summary.year,
    paymentDeadline: summary.paymentDeadline,
    clinicFeeCharge: summary.clinicFeeCharge,
    clinicFeeStatus: summary.clinicFeeStatus,
  };
}

function invoiceNumberFor(studentId: string): string {
  const sid = studentId.trim().replace(/[^a-zA-Z0-9]/g, "").slice(-10) || "STD";
  const stamp = Date.now().toString(36).toUpperCase();
  return `MYAMU-${sid}-${stamp}`.slice(0, 20);
}

function referenceIdFor(studentId: string): string {
  const sid = studentId.trim().replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "STD";
  const stamp = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  return `REF-${sid}-${stamp}`.slice(0, 20);
}

export function parseAuthorizeChargeBody(
  raw: unknown,
): { ok: true; value: AuthorizeChargeBody } | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  const term = typeof o.term === "string" ? o.term.trim() : "";
  const amountRaw = o.amount;
  const amount =
    typeof amountRaw === "number" ? amountRaw
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
  if (
    paymentPlan === "installment" &&
    o.installmentCount != null &&
    parsedInstallmentCount == null
  ) {
    return { ok: false, error: "installmentCount must be 1, 2, or 3." };
  }
  if (opaque == null || typeof opaque !== "object") {
    return { ok: false, error: "opaqueData is required." };
  }
  const descriptor = String((opaque as Record<string, unknown>).dataDescriptor ?? "").trim();
  const value = String((opaque as Record<string, unknown>).dataValue ?? "").trim();
  if (!descriptor || !value) {
    return {
      ok: false,
      error: "opaqueData must include dataDescriptor and dataValue.",
    };
  }
  const isApplePay = /apple/i.test(descriptor);
  let cardBinPrefix: string;
  if (isApplePay) {
    cardBinPrefix =
      normalizeCardBinPrefix(o.cardBinPrefix ?? o.cardBinSix) ?? "424242";
  } else {
    const bin = normalizeCardBinPrefix(o.cardBinPrefix ?? o.cardBinSix);
    if (bin == null) {
      return {
        ok: false,
        error: "cardBinPrefix must be the first 6–8 digits of the card number.",
      };
    }
    cardBinPrefix = bin;
  }
  const billing = parsePaymentBillingDetails(o);
  if (!billing.ok) {
    return billing;
  }
  return {
    ok: true,
    value: {
      term,
      amount: roundMoney(amount),
      chargeType,
      paymentPlan,
      installmentCount:
        paymentPlan === "installment" ? installmentCount : 1,
      opaqueData: {
        dataDescriptor: descriptor,
        dataValue: value,
      },
      cardBinPrefix,
      cardholderName: billing.value.cardholderName,
      billingZip: billing.value.billingZip,
    },
  };
}

export async function processAuthorizeNetStudentPayment(input: {
  studentId: string;
  termInput: string;
  amount: number;
  chargeType: PaymentChargeType;
  paymentPlan: PaymentPlan;
  installmentCount: 1 | 2 | 3;
  opaqueData: OpaqueDataInput;
  cardBinPrefix: string;
  cardholderName: string;
  billingZip: string;
}): Promise<AuthorizeChargeResult> {
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
  const selectedDue =
    input.chargeType === "tuition"
      ? summary.tuitionCharge.amountDue
      : input.chargeType === "clinic_fee"
        ? summary.clinicFeeCharge.amountDue
        : input.chargeType === "exam_fee"
          ? summary.examFeeCharge.amountDue
          : summary.lateFeeCharge.amountDue;
  const maxAllowedForCharge =
    input.chargeType === "tuition" && input.paymentPlan === "installment"
      ? roundToMoney(selectedDue + 15)
      : selectedDue;
  if (selectedDue <= 0) {
    throw new Error("There is no outstanding balance for the selected charge.");
  }
  if (amount > maxAllowedForCharge) {
    throw new Error("Payment amount cannot exceed the amount due for this charge.");
  }
  const cardFunding = inferCardFundingFromBinPrefix(input.cardBinPrefix);
  const { base, fee, total } = totalChargeWithProcessingFee(amount, cardFunding);
  const invoiceNumber = invoiceNumberFor(input.studentId);
  const referenceId = referenceIdFor(input.studentId);
  const billToNames = splitCardholderNameForBillTo(input.cardholderName);
  const charged = await chargeAuthorizeOpaqueData({
    amount: total,
    opaqueData: input.opaqueData,
    invoiceNumber,
    referenceId,
    studentId: input.studentId,
    termCode: parsedTerm.termCode,
    billTo: {
      firstName: billToNames.firstName,
      lastName: billToNames.lastName,
      zip: input.billingZip,
    },
  });

  const feePart =
    fee > 0
      ? ` card fee ${fee.toFixed(2)} total charged ${total.toFixed(2)}`
      : ` total charged ${total.toFixed(2)}`;
  const baseDescription =
    input.paymentPlan === "installment"
      ? `Authorize.net ${input.chargeType} installment ${input.installmentCount} payment ${charged.transactionId}`
      : `Authorize.net ${input.chargeType} payment ${charged.transactionId}`;
  const description = `${baseDescription}${feePart}`.slice(0, 255);

  await recordAuthorizeNetPayment({
    studentId: input.studentId,
    term: parsedTerm.term,
    year: parsedTerm.year,
    amount: base,
    providerChargedAmount: total,
    paidAt: new Date().toISOString().slice(0, 10),
    method: "authorize_net",
    description,
    providerTransactionId: charged.transactionId,
    invoiceNumber,
    status: "succeeded",
  });

  return {
    amount: total.toFixed(2),
    baseAmount: base.toFixed(2),
    processingFee: fee.toFixed(2),
    cardFunding,
    providerTransactionId: charged.transactionId,
    invoiceNumber,
  };
}

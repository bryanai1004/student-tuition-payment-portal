import { INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT } from "./billingMath.js";

export type PaymentChargeType = "tuition" | "clinic_fee" | "exam_fee" | "late_fee";
export type PaymentPlan = "full" | "installment";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Maximum base payment (before card processing fee) allowed for a charge at checkout.
 * Mirrors frontend `FinancesPaymentPage` validation.
 */
export function computeMaxPaymentBaseAmount(args: {
  chargeType: PaymentChargeType;
  paymentPlan: PaymentPlan;
  amountDue: number;
  /** Per-installment service fee included on a single tuition installment payment (default $15). */
  installmentServiceFee?: number;
}): number {
  const due = roundMoney(Math.max(0, args.amountDue));
  if (args.chargeType === "tuition" && args.paymentPlan === "installment") {
    const fee = roundMoney(
      Math.max(0, args.installmentServiceFee ?? INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT),
    );
    return roundMoney(due + fee);
  }
  return due;
}

export type PaymentAmountValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export function validatePaymentBaseAmount(args: {
  amount: number;
  chargeType: PaymentChargeType;
  paymentPlan: PaymentPlan;
  amountDue: number;
  installmentServiceFee?: number;
}): PaymentAmountValidationResult {
  const amount = roundMoney(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Payment amount must be greater than 0." };
  }
  const due = roundMoney(Math.max(0, args.amountDue));
  if (due <= 0) {
    return { ok: false, error: "There is no outstanding balance for the selected charge." };
  }
  const maxAllowed = computeMaxPaymentBaseAmount({
    chargeType: args.chargeType,
    paymentPlan: args.paymentPlan,
    amountDue: due,
    installmentServiceFee: args.installmentServiceFee,
  });
  if (amount > maxAllowed) {
    return {
      ok: false,
      error: "Payment amount cannot exceed the amount due for this charge.",
    };
  }
  return { ok: true };
}

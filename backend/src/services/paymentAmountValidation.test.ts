import { describe, expect, it } from "vitest";
import {
  computeMaxPaymentBaseAmount,
  validatePaymentBaseAmount,
} from "./paymentAmountValidation.js";

describe("computeMaxPaymentBaseAmount", () => {
  it("caps full tuition at amount due", () => {
    expect(
      computeMaxPaymentBaseAmount({
        chargeType: "tuition",
        paymentPlan: "full",
        amountDue: 1200,
      }),
    ).toBe(1200);
  });

  it("allows one installment service fee on top of tuition due", () => {
    expect(
      computeMaxPaymentBaseAmount({
        chargeType: "tuition",
        paymentPlan: "installment",
        amountDue: 400,
      }),
    ).toBe(415);
  });

  it("does not add service fee for clinic or late fee charges", () => {
    expect(
      computeMaxPaymentBaseAmount({
        chargeType: "clinic_fee",
        paymentPlan: "installment",
        amountDue: 200,
      }),
    ).toBe(200);
    expect(
      computeMaxPaymentBaseAmount({
        chargeType: "late_fee",
        paymentPlan: "full",
        amountDue: 30,
      }),
    ).toBe(30);
  });
});

describe("validatePaymentBaseAmount", () => {
  it("accepts valid full payment", () => {
    expect(
      validatePaymentBaseAmount({
        amount: 500,
        chargeType: "tuition",
        paymentPlan: "full",
        amountDue: 500,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects overpayment", () => {
    const result = validatePaymentBaseAmount({
      amount: 501,
      chargeType: "tuition",
      paymentPlan: "full",
      amountDue: 500,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/cannot exceed/i);
    }
  });

  it("rejects payment when nothing is due", () => {
    const result = validatePaymentBaseAmount({
      amount: 10,
      chargeType: "exam_fee",
      paymentPlan: "full",
      amountDue: 0,
    });
    expect(result.ok).toBe(false);
  });
});

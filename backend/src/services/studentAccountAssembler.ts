import { PROGRAM_LABEL } from "../config/constants.js";
import type {
  AccountContext,
  BillingLineItem,
  PaymentRecord,
  StudentAccountPayload,
  StudentTermPreference,
} from "../types/studentAccount.js";
import {
  buildEnrollmentLineItems,
  buildInstallmentSchedule,
  buildScheduleRows,
  buildStudentAccountSummary,
  calculateInstallmentServiceFee,
  getInstallmentPlanPolicyText,
  mergeStandardFeesAndInstallmentFee,
} from "./billingMath.js";

const DEFAULT_INSTALLMENT_DUE_DATES = [
  "Sep 15, 2026",
  "Oct 15, 2026",
  "Nov 15, 2026",
];

const DEFAULT_PREFERENCE: StudentTermPreference = {
  useInstallmentPlan: false,
  tuitionPaidInFullDuringRegistration: false,
  installmentCount: 3,
  registrationPeriodEnds: "2026-09-05",
};

export function assembleStudentAccountPayload(
  ctx: AccountContext,
  options?: { termChargeEffectiveDate?: string },
): StudentAccountPayload {
  const {
    studentId,
    studentDisplayName,
    term,
    year,
    enrollments,
    preference,
    payments,
    adjustments,
    courses,
  } = ctx;

  const displayName =
    studentDisplayName?.trim() ||
    (studentId?.trim() ? studentId.trim() : "Student");

  const courseById = new Map(courses.map((c) => [c.courseId, c]));
  const pref = preference ?? DEFAULT_PREFERENCE;

  const enrollmentLines = buildEnrollmentLineItems(enrollments, courseById);
  const installmentFee = calculateInstallmentServiceFee(pref);
  let lineItems: BillingLineItem[] = mergeStandardFeesAndInstallmentFee(
    enrollmentLines,
    installmentFee,
  );

  for (const adj of adjustments) {
    lineItems.push({
      description: adj.description,
      amount: adj.amount,
      category: adj.category,
    });
  }

  const paymentsTotal =
    Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const summary = buildStudentAccountSummary(lineItems, paymentsTotal);
  const scheduleRows = buildScheduleRows(enrollments, courseById);

  const instCount = pref.useInstallmentPlan
    ? Math.min(Math.max(pref.installmentCount ?? 3, 2), 3)
    : 1;
  const installmentSchedule = buildInstallmentSchedule(
    summary.outstandingBalance,
    pref.useInstallmentPlan ? instCount : 1,
    DEFAULT_INSTALLMENT_DUE_DATES,
  );

  const apiPayments: PaymentRecord[] = payments.map((p) => ({
    amount: p.amount,
    paidAt: p.paidAt,
    method: p.method,
    description: p.description,
  }));

  return {
    program: PROGRAM_LABEL,
    term,
    year,
    studentId,
    student: {
      name: displayName,
      studentId,
      term,
      year,
    },
    preference: {
      useInstallmentPlan: pref.useInstallmentPlan,
      tuitionPaidInFullDuringRegistration:
        pref.tuitionPaidInFullDuringRegistration,
      installmentCount: pref.installmentCount ?? 3,
      registrationPeriodEnds: pref.registrationPeriodEnds,
    },
    lineItems,
    summary,
    scheduleRows,
    payments: apiPayments,
    installmentSchedule,
    installmentPolicy: getInstallmentPlanPolicyText(),
    billingStatus:
      summary.outstandingBalance > 0 ? "Active" : "Paid in full",
    termChargeEffectiveDate:
      options?.termChargeEffectiveDate ?? "2026-08-15",
  } satisfies StudentAccountPayload;
}

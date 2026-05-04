import type {
  BillingCategory,
  BillingLineItem,
  CourseRecord,
  EnrollmentRecord,
  ScheduleRow,
  StudentAccountSummary,
  StudentTermPreference,
} from "../types/studentAccount.js";

export const DIDACTIC_RATE = 200;
export const CLINICAL_RATE = 17;
export const INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT = 15;
export const MAX_INSTALLMENTS_PER_QUARTER = 3;
export const MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER =
  INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT * MAX_INSTALLMENTS_PER_QUARTER;

/** Per-term fees included with portal-synthesized tuition when enrollments exist; see `studentLedgerService` merge. */
export const STANDARD_TERM_FEES: BillingLineItem[] = [
  { description: "Technology / Facility Fee", amount: 50, category: "fees" },
  { description: "Malpractice Insurance", amount: 50, category: "fees" },
];

const sum = (items: Pick<BillingLineItem, "amount">[]) =>
  items.reduce((acc, i) => acc + i.amount, 0);

export function calculateCourseCharge(course: CourseRecord): number {
  if (
    (course.type === "didactic" || course.type === "lab") &&
    course.units != null
  ) {
    return course.units * DIDACTIC_RATE;
  }
  if (course.type === "clinical" && course.hours != null) {
    return course.hours * CLINICAL_RATE;
  }
  if (course.type === "other" && course.units != null) {
    return course.units * DIDACTIC_RATE;
  }
  return 0;
}

export function lineItemCategoryForCourse(
  course: CourseRecord,
): BillingCategory {
  if (course.type === "clinical") return "clinical";
  if (course.type === "didactic" || course.type === "lab") return "tuition";
  return "other";
}

function enrollmentSectionSuffix(e: EnrollmentRecord): string {
  const s = e.sectionCode?.trim() ?? "";
  const t = e.scheduleTrack?.trim() ?? "";
  if (s === "" && t === "") return "";
  if (s !== "" && t !== "") return ` — Sec ${s} (${t})`;
  if (s !== "") return ` — Sec ${s}`;
  return ` — ${t}`;
}

export function formatCourseLineDescription(course: CourseRecord): string {
  if (course.type === "didactic" || course.type === "lab") {
    const u =
      course.units != null && Number.isFinite(Number(course.units))
        ? Number(course.units).toFixed(1)
        : "0.0";
    return `${course.courseCode} ${course.title} (${u} units)`;
  }
  if (course.type === "clinical") {
    const h =
      course.hours != null && Number.isFinite(Number(course.hours))
        ? Number(course.hours).toFixed(1)
        : "0.0";
    return `${course.courseCode} ${course.title} (${h} hrs)`;
  }
  return `${course.courseCode} ${course.title}`.trim();
}

/** Ledger / finance display: course code + title + units or clock hours. */
export function formatPortalLedgerCourseMemo(course: CourseRecord): string {
  return formatCourseLineDescription(course);
}

export function buildStudentAccountSummary(
  lineItems: BillingLineItem[],
  paymentsTotal: number,
): StudentAccountSummary {
  const tuitionTotal = sum(lineItems.filter((i) => i.category === "tuition"));
  const clinicalTotal = sum(lineItems.filter((i) => i.category === "clinical"));
  const feesTotal = sum(lineItems.filter((i) => i.category === "fees"));
  const otherTotal = sum(lineItems.filter((i) => i.category === "other"));
  const totalCharges = tuitionTotal + clinicalTotal + feesTotal + otherTotal;
  const outstandingBalance = totalCharges - paymentsTotal;
  return {
    tuitionTotal,
    clinicalTotal,
    feesTotal,
    otherTotal,
    totalCharges,
    payments: paymentsTotal,
    outstandingBalance,
  };
}

export function calculateInstallmentServiceFee(pref: StudentTermPreference): {
  amount: number;
  description: string;
} {
  if (
    !pref.useInstallmentPlan ||
    pref.tuitionPaidInFullDuringRegistration
  ) {
    return { amount: 0, description: "" };
  }
  const n = Math.min(
    Math.max(Number(pref.installmentCount) || 2, 2),
    MAX_INSTALLMENTS_PER_QUARTER,
  );
  const raw = n * INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT;
  const amount = Math.min(raw, MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER);
  const description = `Tuition Installment Service Fee (${n} installment${n === 1 ? "" : "s"} × $${INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT}; non-refundable)`;
  return { amount, description };
}

export function buildEnrollmentLineItems(
  enrollments: EnrollmentRecord[],
  courseById: Map<string, CourseRecord>,
): BillingLineItem[] {
  const lines: BillingLineItem[] = [];
  for (const e of enrollments) {
    const course = courseById.get(e.courseId);
    if (!course) continue;
    const amount = calculateCourseCharge(course);
    if (amount <= 0) continue;
    const base = formatCourseLineDescription(course);
    lines.push({
      description: `${base}${enrollmentSectionSuffix(e)}`,
      amount,
      category: lineItemCategoryForCourse(course),
    });
  }
  return lines;
}

export function mergeStandardFeesAndInstallmentFee(
  baseLines: BillingLineItem[],
  installmentFee: { amount: number; description: string },
): BillingLineItem[] {
  const out = [...baseLines, ...STANDARD_TERM_FEES];
  if (installmentFee.amount > 0) {
    out.push({
      description: installmentFee.description,
      amount: installmentFee.amount,
      category: "fees",
    });
  }
  return out;
}

export function buildScheduleRows(
  enrollments: EnrollmentRecord[],
  courseById: Map<string, CourseRecord>,
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const e of enrollments) {
    const c = courseById.get(e.courseId);
    if (!c) continue;
    const charge = calculateCourseCharge(c);
    const suffix = enrollmentSectionSuffix(e);
    rows.push({
      courseCode: c.courseCode,
      title: suffix === "" ? c.title : `${c.title}${suffix}`,
      type: c.type,
      units: c.type === "clinical" ? null : (c.units ?? null),
      hours: c.type === "clinical" ? (c.hours ?? null) : null,
      charge,
    });
  }
  return rows;
}

export function buildInstallmentSchedule(
  outstanding: number,
  count: number,
  dueDates: string[],
): { installment: number; dueDate: string; amount: number }[] {
  const n = Math.max(1, Math.min(count, MAX_INSTALLMENTS_PER_QUARTER));
  if (outstanding <= 0) {
    return dueDates
      .slice(0, n)
      .map((due, i) => ({ installment: i + 1, dueDate: due, amount: 0 }));
  }
  const base = Math.floor((outstanding / n) * 100) / 100;
  const rows: { installment: number; dueDate: string; amount: number }[] = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const amt = isLast
      ? Math.round((outstanding - allocated) * 100) / 100
      : base;
    allocated += amt;
    rows.push({
      installment: i + 1,
      dueDate: dueDates[i] ?? dueDates[dueDates.length - 1] ?? "",
      amount: amt,
    });
  }
  return rows;
}

export function getInstallmentPlanPolicyText(): string[] {
  return [
    "If tuition is paid in full by the end of the registration period, no installment service fee applies.",
    "If you elect a quarterly installment plan, a non-refundable $15 installment service fee applies per installment (up to three installments per quarter; maximum $45 per quarter).",
  ];
}

import { describe, expect, it } from "vitest";
import {
  buildInstallmentSchedule,
  buildStudentAccountSummary,
  calculateCourseCharge,
  calculateInstallmentServiceFee,
  lineItemCategoryForCourse,
} from "./billingMath.js";
import type { CourseRecord, StudentTermPreference } from "../types/studentAccount.js";

describe("buildStudentAccountSummary", () => {
  it("includes exam category line items in totalCharges and outstandingBalance", () => {
    const summary = buildStudentAccountSummary(
      [
        { description: "Tuition", amount: 1000, category: "tuition" },
        { description: "Clinical", amount: 200, category: "clinical" },
        { description: "Tech fee", amount: 50, category: "fees" },
        { description: "Misc", amount: 25, category: "other" },
        { description: "Clinical exam fee", amount: 75, category: "exam" },
      ],
      300,
    );
    expect(summary.examTotal).toBe(75);
    expect(summary.totalCharges).toBe(1350);
    expect(summary.outstandingBalance).toBe(1050);
  });

  it("treats zero exam charges as examTotal 0 without affecting other buckets", () => {
    const summary = buildStudentAccountSummary(
      [{ description: "Tuition", amount: 500, category: "tuition" }],
      0,
    );
    expect(summary.examTotal).toBe(0);
    expect(summary.totalCharges).toBe(500);
  });
});

describe("calculateCourseCharge", () => {
  const didactic: CourseRecord = {
    courseId: "c1",
    courseCode: "TCM101",
    title: "Foundations",
    type: "didactic",
    units: 3,
  };
  const clinical: CourseRecord = {
    courseId: "c2",
    courseCode: "CLN301",
    title: "Internship",
    type: "clinical",
    hours: 40,
  };

  it("charges didactic courses by quarter units × $200", () => {
    expect(calculateCourseCharge(didactic)).toBe(600);
    expect(lineItemCategoryForCourse(didactic)).toBe("tuition");
  });

  it("charges clinical courses by clock hours × $17", () => {
    expect(calculateCourseCharge(clinical)).toBe(680);
    expect(lineItemCategoryForCourse(clinical)).toBe("clinical");
  });
});

describe("calculateInstallmentServiceFee", () => {
  const basePref: StudentTermPreference = {
    useInstallmentPlan: true,
    tuitionPaidInFullDuringRegistration: false,
    installmentCount: 3,
    registrationPeriodEnds: "2026-09-05",
  };

  it("charges $15 per installment up to three", () => {
    expect(calculateInstallmentServiceFee(basePref).amount).toBe(45);
  });

  it("waives fee when tuition paid in full during registration", () => {
    expect(
      calculateInstallmentServiceFee({
        ...basePref,
        tuitionPaidInFullDuringRegistration: true,
      }).amount,
    ).toBe(0);
  });
});

describe("buildInstallmentSchedule", () => {
  it("splits outstanding balance across installments with remainder on last row", () => {
    const rows = buildInstallmentSchedule(100, 3, ["2026-09-15", "2026-10-15", "2026-11-15"]);
    expect(rows).toHaveLength(3);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(100);
    expect(rows[2]!.amount).toBeGreaterThanOrEqual(rows[0]!.amount);
  });
});

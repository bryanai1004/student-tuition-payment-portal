import type { BillingCategory, BillingLineItem, CourseRecord, EnrollmentRecord, ScheduleRow, StudentAccountSummary, StudentTermPreference } from "../types/studentAccount.js";
export declare const DIDACTIC_RATE = 200;
export declare const CLINICAL_RATE = 17;
export declare const INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT = 15;
export declare const MAX_INSTALLMENTS_PER_QUARTER = 3;
export declare const MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER: number;
export declare const STANDARD_TERM_FEES: BillingLineItem[];
export declare function calculateCourseCharge(course: CourseRecord): number;
export declare function lineItemCategoryForCourse(course: CourseRecord): BillingCategory;
export declare function formatCourseLineDescription(course: CourseRecord): string;
export declare function buildStudentAccountSummary(lineItems: BillingLineItem[], paymentsTotal: number): StudentAccountSummary;
export declare function calculateInstallmentServiceFee(pref: StudentTermPreference): {
    amount: number;
    description: string;
};
export declare function buildEnrollmentLineItems(enrollments: EnrollmentRecord[], courseById: Map<string, CourseRecord>): BillingLineItem[];
export declare function mergeStandardFeesAndInstallmentFee(baseLines: BillingLineItem[], installmentFee: {
    amount: number;
    description: string;
}): BillingLineItem[];
export declare function buildScheduleRows(enrollments: EnrollmentRecord[], courseById: Map<string, CourseRecord>): ScheduleRow[];
export declare function buildInstallmentSchedule(outstanding: number, count: number, dueDates: string[]): {
    installment: number;
    dueDate: string;
    amount: number;
}[];
export declare function getInstallmentPlanPolicyText(): string[];
//# sourceMappingURL=billingMath.d.ts.map
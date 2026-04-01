export type BillingCategory = "tuition" | "clinical" | "fees" | "other";
export type BillingLineItem = {
    description: string;
    amount: number;
    category: BillingCategory;
};
export type StudentAccountSummary = {
    tuitionTotal: number;
    clinicalTotal: number;
    feesTotal: number;
    otherTotal: number;
    totalCharges: number;
    payments: number;
    outstandingBalance: number;
};
export type ScheduleRow = {
    courseCode: string;
    title: string;
    type: string;
    units: number | null;
    hours: number | null;
    charge: number;
};
export type StudentTermPreference = {
    useInstallmentPlan: boolean;
    tuitionPaidInFullDuringRegistration: boolean;
    installmentCount: number;
    registrationPeriodEnds: string;
};
export type PaymentRecord = {
    amount: number;
    paidAt: string;
    method: string;
    description?: string;
};
export type InstallmentScheduleEntry = {
    installment: number;
    dueDate: string;
    amount: number;
};
export type StudentAccountPayload = {
    program: string;
    term: string;
    year: number;
    studentId: string;
    /** Display profile block aligned with the portal UI (TopBar / Profile). */
    student: {
        name: string;
        studentId: string;
        term: string;
        year: number;
    };
    preference: StudentTermPreference;
    lineItems: BillingLineItem[];
    summary: StudentAccountSummary;
    scheduleRows: ScheduleRow[];
    payments: PaymentRecord[];
    installmentSchedule: InstallmentScheduleEntry[];
    installmentPolicy: string[];
    billingStatus: string;
    termChargeEffectiveDate: string;
};
export type EnrollmentRecord = {
    studentId: string;
    courseId: string;
    term: string;
    year: number;
};
export type CourseRecord = {
    courseId: string;
    courseCode: string;
    title: string;
    type: "didactic" | "clinical" | "lab" | "other";
    units?: number;
    hours?: number;
};
export type BillingAdjustmentRecord = {
    description: string;
    amount: number;
    category: BillingCategory;
};
/** Raw rows loaded from MySQL for one student term */
export type AccountContext = {
    studentId: string;
    /** From portal_students.full_name when present */
    studentDisplayName: string | null;
    term: string;
    year: number;
    enrollments: EnrollmentRecord[];
    preference: StudentTermPreference | null;
    payments: PaymentRecord[];
    adjustments: BillingAdjustmentRecord[];
    courses: CourseRecord[];
};
//# sourceMappingURL=studentAccount.d.ts.map
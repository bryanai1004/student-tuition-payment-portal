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
    /** Legacy real students (Step 3B+): sum of `accounting.debit` for the term (signed). */
    totalCharges: number;
    /** Legacy real students (Step 3B+): sum of `accounting.credit` for the term. */
    payments: number;
    /** Legacy: sum(debit) − sum(credit) for the term when accounting rows exist. */
    outstandingBalance: number;
};
export type ScheduleRow = {
    courseCode: string;
    title: string;
    type: string;
    units: number | null;
    hours: number | null;
    charge: number;
    /** Meeting pattern when available (e.g. legacy `marks` days/times). */
    schedule?: string | null;
    /** Room / building / virtual label when available from source data (never the instructor). */
    location?: string | null;
    /** Instructor of record when available (legacy `marks.instructor`). */
    instructor?: string | null;
};
/** Resolved academic quarter for dashboard / current-term views. */
export type AccountCurrentTerm = {
    term: string;
    year: number;
    label: string;
    quarterOrder?: number;
};
/** Distinct terms the student can browse for schedule/account (newest first in API lists). */
export type AccountScheduleTermOption = {
    term: string;
    year: number;
    label: string;
    /** When this calendar term maps to a row in `academic_terms` (portal registration / enrolled-sections). */
    academicTermId?: string;
};
export type AccountRegistrationStatus = "registered" | "not_registered" | "in_progress" | "unknown";
export type AccountRegistration = {
    status: AccountRegistrationStatus;
    hasActiveCourses: boolean;
    courseCount: number;
    totalUnits: number | null;
    emptyReason?: string;
};
export type StudentTermPreference = {
    useInstallmentPlan: boolean;
    tuitionPaidInFullDuringRegistration: boolean;
    installmentCount: number;
    registrationPeriodEnds: string;
};
export type PaymentRecord = {
    id?: number;
    amount: number;
    paidAt: string;
    /** Demo/portal rows use stored method; legacy `accounting` rows use `"legacy"` when unknown. */
    method: string;
    description?: string;
};
export type InstallmentScheduleEntry = {
    installment: number;
    dueDate: string;
    amount: number;
};
/** Legacy clinical ladder + hours vs program `requirements.clinic_hours` (real account payload only). */
export type ClinicalProgress = {
    level: number;
    completedHours: number;
    requiredHours: number;
    completedCourses: string[];
    readiness: "ready" | "not_ready";
    missing: string[];
};
export type StudentAccountPayload = {
    program: string | null;
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
    preference: StudentTermPreference | null;
    lineItems: BillingLineItem[];
    summary: StudentAccountSummary;
    scheduleRows: ScheduleRow[];
    /**
     * Count of **active** `portal_enrollments` rows for this payload’s browse `term`/`year` (withdrawn excluded).
     * Lets the dashboard distinguish “enrolled, timetable not published yet” from “no enrollments” without guessing.
     */
    activePortalEnrollmentCountForBrowseTerm?: number;
    /**
     * True active enrollment term for the student (legacy: latest `registration` row still open on `marks`).
     * Independent of `term`/`year`, which reflect the selected account browse term.
     */
    currentTerm: AccountCurrentTerm | null;
    /** Distinct registration terms with account data, newest first — for schedule/account term picker. */
    availableScheduleTerms: AccountScheduleTermOption[];
    registration: AccountRegistration;
    payments: PaymentRecord[];
    installmentSchedule: InstallmentScheduleEntry[];
    installmentPolicy: string[];
    billingStatus: string | null;
    termChargeEffectiveDate: string | null;
    clinicalProgress?: ClinicalProgress;
};
export type EnrollmentRecord = {
    studentId: string;
    courseId: string;
    term: string;
    year: number;
    sectionCode?: string | null;
    scheduleTrack?: string | null;
};
export type CourseRecord = {
    courseId: string;
    courseCode: string;
    title: string;
    type: "didactic" | "clinical" | "lab" | "other";
    units?: number;
    hours?: number;
};
export type BillingAdjustmentSource = "manual" | "system_late_fee" | "system_clinical" | "system_late_fee_reversal";
export type BillingAdjustmentRecord = {
    id?: number;
    description: string;
    amount: number;
    category: BillingCategory;
    /**
     * From `portal_billing_adjustments.adjustment_source` when present.
     * When the column is missing (legacy schema), the repository sets `"manual"` for every row.
     * Includes `system_clinical` for automatic clinical slot booking charges.
     */
    adjustmentSource?: BillingAdjustmentSource;
    /**
     * From `portal_billing_adjustments.reversal_of_adjustment_id` when present.
     * Links `system_late_fee_reversal` rows to the original adjustment id.
     */
    reversalOfAdjustmentId?: number | null;
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
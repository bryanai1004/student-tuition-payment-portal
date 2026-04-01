export const DIDACTIC_RATE = 200;
export const CLINICAL_RATE = 17;
export const INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT = 15;
export const MAX_INSTALLMENTS_PER_QUARTER = 3;
export const MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER = INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT * MAX_INSTALLMENTS_PER_QUARTER;
export const STANDARD_TERM_FEES = [
    { description: "Student Services Fee", amount: 150, category: "fees" },
    { description: "Technology Fee", amount: 75, category: "fees" },
];
const sum = (items) => items.reduce((acc, i) => acc + i.amount, 0);
export function calculateCourseCharge(course) {
    if ((course.type === "didactic" || course.type === "lab") &&
        course.units != null) {
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
export function lineItemCategoryForCourse(course) {
    if (course.type === "clinical")
        return "clinical";
    if (course.type === "didactic" || course.type === "lab")
        return "tuition";
    return "other";
}
export function formatCourseLineDescription(course) {
    if (course.type === "didactic" || course.type === "lab") {
        return `${course.title} (${course.units} unit${course.units === 1 ? "" : "s"})`;
    }
    if (course.type === "clinical") {
        return `${course.title} (${course.hours} hrs)`;
    }
    return String(course.title);
}
export function buildStudentAccountSummary(lineItems, paymentsTotal) {
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
export function calculateInstallmentServiceFee(pref) {
    if (!pref.useInstallmentPlan ||
        pref.tuitionPaidInFullDuringRegistration) {
        return { amount: 0, description: "" };
    }
    const n = Math.min(Math.max(Number(pref.installmentCount) || 2, 2), MAX_INSTALLMENTS_PER_QUARTER);
    const raw = n * INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT;
    const amount = Math.min(raw, MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER);
    const description = `Tuition installment plan service fee (${n} installment${n === 1 ? "" : "s"} × $${INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT}; non-refundable)`;
    return { amount, description };
}
export function buildEnrollmentLineItems(enrollments, courseById) {
    const lines = [];
    for (const e of enrollments) {
        const course = courseById.get(e.courseId);
        if (!course)
            continue;
        const amount = calculateCourseCharge(course);
        if (amount <= 0)
            continue;
        lines.push({
            description: formatCourseLineDescription(course),
            amount,
            category: lineItemCategoryForCourse(course),
        });
    }
    return lines;
}
export function mergeStandardFeesAndInstallmentFee(baseLines, installmentFee) {
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
export function buildScheduleRows(enrollments, courseById) {
    const rows = [];
    for (const e of enrollments) {
        const c = courseById.get(e.courseId);
        if (!c)
            continue;
        const charge = calculateCourseCharge(c);
        rows.push({
            courseCode: c.courseCode,
            title: c.title,
            type: c.type,
            units: c.type === "clinical" ? null : (c.units ?? null),
            hours: c.type === "clinical" ? (c.hours ?? null) : null,
            charge,
        });
    }
    return rows;
}
export function buildInstallmentSchedule(outstanding, count, dueDates) {
    const n = Math.max(1, Math.min(count, MAX_INSTALLMENTS_PER_QUARTER));
    if (outstanding <= 0) {
        return dueDates
            .slice(0, n)
            .map((due, i) => ({ installment: i + 1, dueDate: due, amount: 0 }));
    }
    const base = Math.floor((outstanding / n) * 100) / 100;
    const rows = [];
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
export function getInstallmentPlanPolicyText() {
    return [
        "If tuition is paid in full by the end of the registration period, no installment service fee applies.",
        "If you elect a quarterly installment plan, a non-refundable $15 service fee applies per installment (up to three installments per quarter, maximum $45).",
        "Missed or late payments may affect enrollment standing per bursar policy.",
    ];
}
//# sourceMappingURL=billingMath.js.map
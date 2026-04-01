/**
 * MySQL-first account reads. Expect these tables (adjust names in migrations as needed):
 *
 * portal_students (student_external_id PK, full_name)
 * portal_courses (course_id PK, course_code, title, type ENUM, units, hours)
 * portal_enrollments (student_external_id, course_id, term, year)
 * portal_student_term_prefs (student_external_id, term, year, use_installment_plan,
 *   tuition_paid_in_full_at_reg, installment_count, registration_period_ends)
 * portal_payments (student_external_id, term, year, amount, paid_at, method, description)
 * portal_billing_adjustments (student_external_id, term, year, description, amount, category)
 */
function formatSqlDate(value) {
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    if (typeof value === "string") {
        return value.slice(0, 10);
    }
    return String(value);
}
function asBool(v) {
    if (v === true || v === 1 || v === "1")
        return true;
    return false;
}
function asCourseType(raw) {
    const s = String(raw);
    if (s === "didactic" || s === "lab" || s === "clinical" || s === "other") {
        return s;
    }
    return "other";
}
function asBillingCategory(raw) {
    const s = String(raw);
    if (s === "tuition" || s === "clinical" || s === "fees" || s === "other") {
        return s;
    }
    return "other";
}
export async function loadAccountContext(pool, studentId, term, year) {
    const [enrollmentRows] = await pool.query(`SELECT student_external_id AS studentId, course_id AS courseId, term, year
     FROM portal_enrollments
     WHERE student_external_id = ? AND term = ? AND year = ?`, [studentId, term, year]);
    if (enrollmentRows.length === 0) {
        console.debug("[account-debug] loadAccountContext: no enrollments", JSON.stringify({ studentId, term, year }));
        return null;
    }
    const [[nameRow]] = await pool.query(`SELECT full_name AS fullName
     FROM portal_students
     WHERE student_external_id = ?
     LIMIT 1`, [studentId]);
    const studentDisplayName = nameRow?.fullName != null && String(nameRow.fullName).trim() !== ""
        ? String(nameRow.fullName).trim()
        : null;
    const enrollments = enrollmentRows.map((r) => ({
        studentId: String(r.studentId),
        courseId: String(r.courseId),
        term: String(r.term),
        year: Number(r.year),
    }));
    const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
    const placeholders = courseIds.map(() => "?").join(",");
    const [coursesQ, prefsQ, paymentsQ, adjQ] = await Promise.all([
        pool.query(`SELECT course_id AS courseId, course_code AS courseCode, title, type,
              units, hours
       FROM portal_courses
       WHERE course_id IN (${placeholders})`, courseIds),
        pool.query(`SELECT use_installment_plan AS useInstallmentPlan,
              tuition_paid_in_full_at_reg AS tuitionPaidInFullDuringRegistration,
              installment_count AS installmentCount,
              registration_period_ends AS registrationPeriodEnds
       FROM portal_student_term_prefs
       WHERE student_external_id = ? AND term = ? AND year = ?
       LIMIT 1`, [studentId, term, year]),
        pool.query(`SELECT amount, paid_at AS paidAt, method, description
       FROM portal_payments
       WHERE student_external_id = ? AND term = ? AND year = ?
       ORDER BY paid_at ASC, id ASC`, [studentId, term, year]),
        pool.query(`SELECT description, amount, category
       FROM portal_billing_adjustments
       WHERE student_external_id = ? AND term = ? AND year = ?`, [studentId, term, year]),
    ]);
    const courseRowList = coursesQ[0];
    const prefRowList = prefsQ[0];
    const paymentRowList = paymentsQ[0];
    const adjustmentRowList = adjQ[0];
    const courses = courseRowList.map((r) => ({
        courseId: String(r.courseId),
        courseCode: String(r.courseCode),
        title: String(r.title),
        type: asCourseType(r.type),
        units: r.units != null ? Number(r.units) : undefined,
        hours: r.hours != null ? Number(r.hours) : undefined,
    }));
    let preference = null;
    const pr = prefRowList[0];
    if (pr) {
        preference = {
            useInstallmentPlan: asBool(pr.useInstallmentPlan),
            tuitionPaidInFullDuringRegistration: asBool(pr.tuitionPaidInFullDuringRegistration),
            installmentCount: Number(pr.installmentCount) || 3,
            registrationPeriodEnds: pr.registrationPeriodEnds
                ? formatSqlDate(pr.registrationPeriodEnds)
                : "2026-09-05",
        };
    }
    const payments = paymentRowList.map((r) => ({
        amount: Number(r.amount),
        paidAt: formatSqlDate(r.paidAt),
        method: String(r.method),
        description: r.description != null ? String(r.description) : undefined,
    }));
    const adjustments = adjustmentRowList.map((r) => ({
        description: String(r.description),
        amount: Number(r.amount),
        category: asBillingCategory(r.category),
    }));
    const ctx = {
        studentId,
        studentDisplayName,
        term,
        year,
        enrollments,
        preference,
        payments,
        adjustments,
        courses,
    };
    console.debug("[account-debug] loadAccountContext: ok", JSON.stringify({
        studentId,
        term,
        year,
        enrollmentCount: enrollments.length,
        courseCount: courses.length,
        hasDisplayName: Boolean(studentDisplayName),
    }));
    return ctx;
}
//# sourceMappingURL=studentAccountRepository.js.map
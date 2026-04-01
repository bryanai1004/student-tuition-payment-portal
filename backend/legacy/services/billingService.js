/**
 * MAHM catalog-based billing: didactic per unit ($200), clinical per hour ($17).
 * Installment service fee: $15 per installment, up to 3 installments per quarter, max $45 (non-refundable).
 */

export const DIDACTIC_RATE = 200
export const CLINICAL_RATE = 17
export const INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT = 15
export const MAX_INSTALLMENTS_PER_QUARTER = 3
export const MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER =
  INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT * MAX_INSTALLMENTS_PER_QUARTER

/** Catalog Tuition and Fees section (representative amounts; adjust to match official MAHM catalog). */
export const STANDARD_TERM_FEES = [
  { description: 'Student Services Fee', amount: 150, category: 'fees' },
  { description: 'Technology Fee', amount: 75, category: 'fees' },
]

const sum = (items) => items.reduce((acc, i) => acc + i.amount, 0)

/**
 * @param {{ type: string, units?: number, hours?: number }} course
 * @returns {number}
 */
export function calculateCourseCharge(course) {
  if ((course.type === 'didactic' || course.type === 'lab') && course.units != null) {
    return course.units * DIDACTIC_RATE
  }
  if (course.type === 'clinical' && course.hours != null) {
    return course.hours * CLINICAL_RATE
  }
  if (course.type === 'other' && course.units != null) {
    return course.units * DIDACTIC_RATE
  }
  return 0
}

/** @param {Record<string, unknown>} course */
export function lineItemCategoryForCourse(course) {
  if (course.type === 'clinical') return 'clinical'
  if (course.type === 'didactic' || course.type === 'lab') return 'tuition'
  return 'other'
}

/**
 * @param {Record<string, unknown>} course
 */
export function formatCourseLineDescription(course) {
  if (course.type === 'didactic' || course.type === 'lab') {
    return `${course.title} (${course.units} unit${course.units === 1 ? '' : 's'})`
  }
  if (course.type === 'clinical') {
    return `${course.title} (${course.hours} hrs)`
  }
  return String(course.title)
}

/**
 * @typedef {{ description: string, amount: number, category: 'tuition'|'clinical'|'fees'|'other' }} BillingLineItem
 */

/**
 * @param {BillingLineItem[]} lineItems
 * @param {number} payments
 */
export function buildStudentAccountSummary(lineItems, payments) {
  const tuitionTotal = sum(lineItems.filter((i) => i.category === 'tuition'))
  const clinicalTotal = sum(lineItems.filter((i) => i.category === 'clinical'))
  const feesTotal = sum(lineItems.filter((i) => i.category === 'fees'))
  const otherTotal = sum(lineItems.filter((i) => i.category === 'other'))
  const totalCharges = tuitionTotal + clinicalTotal + feesTotal + otherTotal
  const outstandingBalance = totalCharges - payments
  return {
    tuitionTotal,
    clinicalTotal,
    feesTotal,
    otherTotal,
    totalCharges,
    payments,
    outstandingBalance,
  }
}

/**
 * Installment service fee: only when student is on a quarterly plan and did not pay tuition in full during registration.
 * @param {{ useInstallmentPlan: boolean, tuitionPaidInFullDuringRegistration: boolean, installmentCount?: number }} pref
 */
export function calculateInstallmentServiceFee(pref) {
  if (!pref.useInstallmentPlan || pref.tuitionPaidInFullDuringRegistration) {
    return { amount: 0, description: '' }
  }
  const n = Math.min(
    Math.max(Number(pref.installmentCount) || 2, 2),
    MAX_INSTALLMENTS_PER_QUARTER,
  )
  const raw = n * INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT
  const amount = Math.min(raw, MAX_INSTALLMENT_SERVICE_FEE_PER_QUARTER)
  const description = `Tuition installment plan service fee (${n} installment${n === 1 ? '' : 's'} × $${INSTALLMENT_SERVICE_FEE_PER_INSTALLMENT}; non-refundable)`
  return { amount, description }
}

/**
 * @param {Record<string, unknown>[]} enrollments
 * @param {Map<string, Record<string, unknown>>} courseById
 * @returns {BillingLineItem[]}
 */
export function buildEnrollmentLineItems(enrollments, courseById) {
  /** @type {BillingLineItem[]} */
  const lines = []
  for (const e of enrollments) {
    const course = courseById.get(e.courseId)
    if (!course) continue
    const amount = calculateCourseCharge(course)
    if (amount <= 0) continue
    lines.push({
      description: formatCourseLineDescription(course),
      amount,
      category: lineItemCategoryForCourse(course),
    })
  }
  return lines
}

/**
 * @param {BillingLineItem[]} baseLines
 * @param {ReturnType<typeof calculateInstallmentServiceFee>} installmentFee
 */
export function mergeStandardFeesAndInstallmentFee(baseLines, installmentFee) {
  /** @type {BillingLineItem[]} */
  const out = [...baseLines]
  for (const f of STANDARD_TERM_FEES) {
    out.push({ description: f.description, amount: f.amount, category: f.category })
  }
  if (installmentFee.amount > 0) {
    out.push({
      description: installmentFee.description,
      amount: installmentFee.amount,
      category: 'fees',
    })
  }
  return out
}

/**
 * @typedef {{ courseCode: string, title: string, type: string, units: number|null, hours: number|null, charge: number }} ScheduleRow
 */

/**
 * @param {Record<string, unknown>[]} enrollments
 * @param {Map<string, Record<string, unknown>>} courseById
 * @returns {ScheduleRow[]}
 */
export function buildScheduleRows(enrollments, courseById) {
  return enrollments
    .map((e) => {
      const c = courseById.get(e.courseId)
      if (!c) return null
      const charge = calculateCourseCharge(c)
      return {
        courseCode: c.courseCode,
        title: c.title,
        type: c.type,
        units: c.type === 'clinical' ? null : c.units ?? null,
        hours: c.type === 'clinical' ? c.hours ?? null : null,
        charge,
      }
    })
    .filter(Boolean)
}

/**
 * Equal installment amounts on remaining principal (simple bursar-style split).
 * @param {number} outstanding
 * @param {number} count
 * @param {string[]} dueDates ISO or display strings
 */
export function buildInstallmentSchedule(outstanding, count, dueDates) {
  const n = Math.max(1, Math.min(count, MAX_INSTALLMENTS_PER_QUARTER))
  if (outstanding <= 0) {
    return dueDates.slice(0, n).map((due, i) => ({ installment: i + 1, dueDate: due, amount: 0 }))
  }
  const base = Math.floor((outstanding / n) * 100) / 100
  const rows = []
  let allocated = 0
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1
    const amt = isLast ? Math.round((outstanding - allocated) * 100) / 100 : base
    allocated += amt
    rows.push({
      installment: i + 1,
      dueDate: dueDates[i] ?? dueDates[dueDates.length - 1],
      amount: amt,
    })
  }
  return rows
}

/**
 * Cancellation / refund (MAHM-style framework; verify against current catalog).
 * Tuition may be prorated by week of term; installment service fee and certain campus fees are non-refundable once assessed.
 *
 * @param {{ termWeekIndex: number, tuitionPortion: number, clinicalPortion: number, assessedNonRefundableFees: number }} input
 * @returns {{ refundableTuition: number, refundableClinical: number, nonRefundable: number, notes: string[] }}
 */
export function estimateRefundOnWithdrawal(input) {
  const week = Math.max(0, input.termWeekIndex)
  /** Example schedule: align with common academic refund tables — replace with catalog percentages. */
  let tuitionPct = 0
  if (week <= 0) tuitionPct = 1
  else if (week <= 1) tuitionPct = 0.75
  else if (week <= 2) tuitionPct = 0.5
  else if (week <= 4) tuitionPct = 0.25
  else tuitionPct = 0

  const clinicalPct = week <= 1 ? 0.5 : 0

  const refundableTuition = Math.round(input.tuitionPortion * tuitionPct * 100) / 100
  const refundableClinical = Math.round(input.clinicalPortion * clinicalPct * 100) / 100
  const nonRefundable = input.assessedNonRefundableFees

  const notes = [
    'Installment plan service fees are non-refundable once assessed (MAHM catalog).',
    'Refund percentages are illustrative; the official withdrawal date and catalog govern actual refunds.',
  ]
  return { refundableTuition, refundableClinical, nonRefundable, notes }
}

export function getInstallmentPlanPolicyText() {
  return [
    'If tuition is paid in full by the end of the registration period, no installment service fee applies.',
    'If you elect a quarterly installment plan, a non-refundable $15 service fee applies per installment (up to three installments per quarter, maximum $45).',
    'Missed or late payments may affect enrollment standing per bursar policy.',
  ]
}

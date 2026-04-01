import mongoose from 'mongoose'
import { Course } from '../models/Course.js'
import { Enrollment } from '../models/Enrollment.js'
import { Payment } from '../models/Payment.js'
import { StudentTermPreference } from '../models/StudentTermPreference.js'
import { BillingLineItem } from '../models/BillingLineItem.js'
import { DEMO_STUDENT_ID } from '../constants.js'
import { MAHM_COURSES } from '../seed/mahcCourses.js'
import {
  buildEnrollmentLineItems,
  buildStudentAccountSummary,
  mergeStandardFeesAndInstallmentFee,
  calculateInstallmentServiceFee,
  buildScheduleRows,
  buildInstallmentSchedule,
  getInstallmentPlanPolicyText,
} from './billingService.js'

const PROGRAM_LABEL = 'Master of Acupuncture and Herbal Medicine (MAHM)'

/** Fall quarter demo due dates (display strings). */
const DEFAULT_INSTALLMENT_DUE_DATES = ['Sep 15, 2026', 'Oct 15, 2026', 'Nov 15, 2026']

const DEMO_TERM = 'Fall'
const DEMO_YEAR = 2026

/** Same enrollments as seed/seed.js — used when Mongo is empty or offline. */
const CATALOG_DEMO_ENROLLMENTS = [
  { studentId: DEMO_STUDENT_ID, courseId: 'MAHM101', term: DEMO_TERM, year: DEMO_YEAR },
  { studentId: DEMO_STUDENT_ID, courseId: 'MAHM102', term: DEMO_TERM, year: DEMO_YEAR },
  { studentId: DEMO_STUDENT_ID, courseId: 'MAHM104', term: DEMO_TERM, year: DEMO_YEAR },
  { studentId: DEMO_STUDENT_ID, courseId: 'MAHM113', term: DEMO_TERM, year: DEMO_YEAR },
  { studentId: DEMO_STUDENT_ID, courseId: 'CLINIC1', term: DEMO_TERM, year: DEMO_YEAR },
]

const CATALOG_DEMO_PREFERENCE = {
  useInstallmentPlan: true,
  tuitionPaidInFullDuringRegistration: false,
  installmentCount: 3,
  registrationPeriodEnds: '2026-09-05',
}

const CATALOG_DEMO_PAYMENTS = [
  {
    studentId: DEMO_STUDENT_ID,
    term: DEMO_TERM,
    year: DEMO_YEAR,
    amount: 1250,
    paidAt: '2026-08-20',
    method: 'ach',
    description: 'Tuition payment — Fall 2026',
  },
]

/**
 * @param {{
 *   studentId: string
 *   term: string
 *   year: number
 *   enrollments: Record<string, unknown>[]
 *   preference: Record<string, unknown> | null | undefined
 *   payments: Record<string, unknown>[]
 *   adjustments: Record<string, unknown>[]
 *   courses: Record<string, unknown>[]
 * }} input
 */
function assembleStudentAccountPayload(input) {
  const {
    studentId,
    term,
    year,
    enrollments,
    preference,
    payments,
    adjustments,
    courses,
  } = input

  const courseById = new Map(courses.map((c) => [c.courseId, c]))

  const pref = preference ?? {
    useInstallmentPlan: false,
    tuitionPaidInFullDuringRegistration: false,
    installmentCount: 3,
    registrationPeriodEnds: '2026-09-05',
  }

  const enrollmentLines = buildEnrollmentLineItems(enrollments, courseById)
  const installmentFee = calculateInstallmentServiceFee(pref)
  let lineItems = mergeStandardFeesAndInstallmentFee(enrollmentLines, installmentFee)

  for (const adj of adjustments) {
    lineItems.push({
      description: adj.description,
      amount: adj.amount,
      category: adj.category,
    })
  }

  const paymentsTotal =
    Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100
  const summary = buildStudentAccountSummary(lineItems, paymentsTotal)
  const scheduleRows = buildScheduleRows(enrollments, courseById)

  const instCount = pref.useInstallmentPlan
    ? Math.min(Math.max(pref.installmentCount ?? 3, 2), 3)
    : 1
  const installmentSchedule = buildInstallmentSchedule(
    summary.outstandingBalance,
    pref.useInstallmentPlan ? instCount : 1,
    DEFAULT_INSTALLMENT_DUE_DATES,
  )

  return {
    program: PROGRAM_LABEL,
    term,
    year,
    studentId,
    preference: {
      useInstallmentPlan: pref.useInstallmentPlan,
      tuitionPaidInFullDuringRegistration: pref.tuitionPaidInFullDuringRegistration,
      installmentCount: pref.installmentCount ?? 3,
      registrationPeriodEnds: pref.registrationPeriodEnds,
    },
    lineItems,
    summary,
    scheduleRows,
    payments: payments.map((p) => ({
      amount: p.amount,
      paidAt: p.paidAt,
      method: p.method,
      description: p.description,
    })),
    installmentSchedule,
    installmentPolicy: getInstallmentPlanPolicyText(),
    billingStatus: summary.outstandingBalance > 0 ? 'Active' : 'Paid in full',
    termChargeEffectiveDate: '2026-08-15',
  }
}

/**
 * Demo payload computed from MAHM_COURSES + billingService rules (same path as DB-backed data).
 */
export function buildCatalogDemoAccountPayload() {
  const ids = new Set(CATALOG_DEMO_ENROLLMENTS.map((e) => e.courseId))
  const courses = MAHM_COURSES.filter((c) => ids.has(c.courseId))
  return assembleStudentAccountPayload({
    studentId: DEMO_STUDENT_ID,
    term: DEMO_TERM,
    year: DEMO_YEAR,
    enrollments: CATALOG_DEMO_ENROLLMENTS,
    preference: CATALOG_DEMO_PREFERENCE,
    payments: CATALOG_DEMO_PAYMENTS,
    adjustments: [],
    courses,
  })
}

function isDemoCatalogFallbackScope(studentId, term, year) {
  return studentId === DEMO_STUDENT_ID && term === DEMO_TERM && year === DEMO_YEAR
}

/**
 * @param {string} studentId
 * @param {string} term
 * @param {number} year
 */
export async function getStudentAccountPayload(studentId, term, year) {
  const mongoUp = mongoose.connection.readyState === 1

  if (!mongoUp) {
    if (isDemoCatalogFallbackScope(studentId, term, year)) {
      console.warn(
        '[billing] Mongo not connected — serving catalog-computed demo payload (no DB reads)',
      )
      return buildCatalogDemoAccountPayload()
    }
    const err = new Error('Database unavailable')
    err.code = 'DB_UNAVAILABLE'
    throw err
  }

  const [enrollments, preference, payments, adjustments] = await Promise.all([
    Enrollment.find({ studentId, term, year }).lean(),
    StudentTermPreference.findOne({ studentId, term, year }).lean(),
    Payment.find({ studentId, term, year }).lean(),
    BillingLineItem.find({ studentId, term, year }).lean(),
  ])

  console.log('[billing] Mongo read', {
    studentId,
    term,
    year,
    enrollments: enrollments.length,
    payments: payments.length,
    hasPreference: Boolean(preference),
  })

  if (isDemoCatalogFallbackScope(studentId, term, year) && enrollments.length === 0) {
    console.warn(
      '[billing] Demo student has no enrollments in DB — catalog fallback (run npm run seed in backend/)',
    )
    return buildCatalogDemoAccountPayload()
  }

  const courseIds = [...new Set(enrollments.map((e) => e.courseId))]
  const courses = await Course.find({ courseId: { $in: courseIds } }).lean()
  return assembleStudentAccountPayload({
    studentId,
    term,
    year,
    enrollments,
    preference,
    payments,
    adjustments,
    courses,
  })
}

export { PROGRAM_LABEL }

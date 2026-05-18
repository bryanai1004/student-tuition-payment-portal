import type { BillingLineItem } from '../types/billing'
import type { ScheduleRow } from '../types/billing'

export type MahmInstallmentScheduleEntry = {
  dueDate: string
  amount: number
  status: string
}

export type MahmRecentActivityEntry = {
  date: string
  description: string
  amount: number
}

export type MahmStatementEntry = {
  statementDate: string
  description: string
  balance: number
}

export type MahmCurrentTerm = {
  term: string
  year: number
  label: string
  quarterOrder?: number
}

export type MahmRegistrationStatus =
  | 'registered'
  | 'not_registered'
  | 'in_progress'
  | 'unknown'

export type MahmRegistration = {
  status: MahmRegistrationStatus
  hasActiveCourses: boolean
  courseCount: number
  totalUnits: number | null
  emptyReason?: string
}

/** Populated for legacy real students via GET /account (`clinicalProgress`); omitted for catalog demo. */
export type MahmClinicalProgress = {
  level: number
  completedHours: number
  requiredHours: number
  completedCourses: string[]
  readiness: 'ready' | 'not_ready'
  missing: string[]
}

export type MahmAccountMock = {
  program: string
  student: {
    name: string
    studentId: string
    term: string
    year: number
  }
  currentTerm: MahmCurrentTerm
  registration: MahmRegistration
  summary: {
    tuitionTotal: number
    clinicalTotal: number
    feesTotal: number
    totalCharges: number
    payments: number
    outstandingBalance: number
    /** Optional; omitted when zero */
    otherTotal?: number
    examTotal?: number
  }
  lineItems: BillingLineItem[]
  installmentPlan: {
    enabled: boolean
    installmentCount: number
    installmentAmount: number
    schedule: MahmInstallmentScheduleEntry[]
  }
  /** Bursar-facing copy for the payment plan page */
  installmentPolicy: string[]
  billingStatus: string
  termChargeEffectiveDate: string
  scheduleRows: ScheduleRow[]
  /** Terms available for schedule/account browsing (API); omit or single entry when not used. */
  availableScheduleTerms?: Array<{
    term: string
    year: number
    label: string
    /** `academic_terms.id` when provided by GET /account (avoids fragile client-only term matching). */
    academicTermId?: string
  }>
  /** Active `portal_enrollments` count for the account browse term (legacy + portal payloads). */
  activePortalEnrollmentCountForBrowseTerm?: number
  recentActivity: MahmRecentActivityEntry[]
  statements: MahmStatementEntry[]
  clinicalProgress?: MahmClinicalProgress
}

/**
 * Single source of truth for the MAHM frontend-only demo.
 * Amounts and catalog-style descriptions match the MAHM program structure.
 */
export const mahmAccountMock: MahmAccountMock = {
  program: 'Master of Acupuncture and Herbal Medicine (MAHM)',
  student: {
    name: 'Bingchen Li',
    studentId: 'AMU123456',
    term: 'Fall',
    year: 2026,
  },
  currentTerm: {
    term: 'Fall',
    year: 2026,
    label: 'Fall 2026',
    quarterOrder: 4,
  },
  registration: {
    status: 'registered',
    hasActiveCourses: true,
    courseCount: 5,
    totalUnits: 11,
  },

  summary: {
    tuitionTotal: 2200,
    clinicalTotal: 1530,
    feesTotal: 145,
    totalCharges: 3875,
    payments: 1250,
    outstandingBalance: 2625,
  },

  lineItems: [
    {
      description: 'TCM101 Foundations of Traditional Chinese Medicine (3.0 units)',
      amount: 600,
      category: 'tuition',
    },
    {
      description: 'ACU201 Acupuncture Techniques I (4.0 units)',
      amount: 800,
      category: 'tuition',
    },
    {
      description: 'HERB201 Chinese Herbal Medicine I (3.0 units)',
      amount: 600,
      category: 'tuition',
    },
    {
      description: 'ACULAB1 Acupuncture Lab I (1.0 units)',
      amount: 200,
      category: 'tuition',
    },
    {
      description: 'CLN301 Clinical Internship Level 1 (90.0 hrs)',
      amount: 1530,
      category: 'clinical',
    },
    { description: 'Technology / Facility Fee', amount: 50, category: 'fees' },
    { description: 'Malpractice Insurance', amount: 50, category: 'fees' },
    {
      description:
        'Tuition Installment Service Fee (3 installments × $15; non-refundable)',
      amount: 45,
      category: 'fees',
    },
  ],

  installmentPlan: {
    enabled: true,
    installmentCount: 3,
    installmentAmount: 875,
    schedule: [
      { dueDate: '2026-09-05', amount: 875, status: 'Upcoming' },
      { dueDate: '2026-10-05', amount: 875, status: 'Upcoming' },
      { dueDate: '2026-11-05', amount: 875, status: 'Upcoming' },
    ],
  },

  installmentPolicy: [
    'If tuition is paid in full by the end of the registration period, no installment service fee applies.',
    'If you elect a quarterly installment plan, a non-refundable $15 installment service fee applies per installment (up to three installments per quarter; maximum $45 per quarter).',
  ],

  billingStatus: 'Current — installment plan active',

  termChargeEffectiveDate: '2026-08-15',

  availableScheduleTerms: [{ term: 'Fall', year: 2026, label: 'Fall 2026' }],

  scheduleRows: [
    {
      courseCode: 'TCM101',
      title: 'Foundations of Traditional Chinese Medicine',
      type: 'Didactic',
      units: 3,
      hours: null,
      charge: 600,
    },
    {
      courseCode: 'ACU201',
      title: 'Acupuncture Techniques I',
      type: 'Didactic',
      units: 4,
      hours: null,
      charge: 800,
    },
    {
      courseCode: 'HERB201',
      title: 'Chinese Herbal Medicine I',
      type: 'Didactic',
      units: 3,
      hours: null,
      charge: 600,
    },
    {
      courseCode: 'ACULAB1',
      title: 'Acupuncture Lab I',
      type: 'Lab',
      units: 1,
      hours: null,
      charge: 200,
    },
    {
      courseCode: 'CLN301',
      title: 'Clinical Internship Level 1',
      type: 'Clinical',
      units: null,
      hours: 90,
      charge: 1530,
    },
  ],

  recentActivity: [
    {
      date: '2026-08-20',
      description: 'Tuition payment — Fall 2026',
      amount: -1250,
    },
    {
      date: '2026-08-15',
      description: 'Fall 2026 Tuition Charges Posted',
      amount: 4000,
    },
  ],

  statements: [
    {
      statementDate: '2026-08-15',
      description: 'Fall 2026 Tuition Statement — MAHM Program',
      balance: 2750,
    },
  ],
}

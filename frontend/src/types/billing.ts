export type BillingCategory = 'tuition' | 'clinical' | 'fees' | 'other' | 'exam'

export type BillingLineItem = {
  description: string
  amount: number
  category: BillingCategory
}

export type StudentAccountSummary = {
  tuitionTotal: number
  clinicalTotal: number
  feesTotal: number
  otherTotal: number
  examTotal?: number
  totalCharges: number
  payments: number
  outstandingBalance: number
}

export type ScheduleRow = {
  courseCode: string
  title: string
  type: string
  units: number | null
  hours: number | null
  charge: number
  schedule?: string | null
  location?: string | null
  instructor?: string | null
}

import type {
  StudentAcademicsResponse,
  StudentProfileResponse,
  StudentTranscriptPreviewResponse,
} from './api'
import {
  bilingualCourseTitleParts,
  rowsForSelectedTerm,
  transcriptRowCredits,
  type TranscriptRow,
} from './academicsTranscriptDisplay'
import type { RegistrationQuarter } from '../data/registrationFormTerms'
import { termsMatchQuarter } from '../data/registrationFormTerms'

export type RegistrationDidacticRow = {
  courseNo: string
  courseTitle: string
  units: number
  day: string
  time: string
  trackChEn: string
  instructor: string
}

export type RegistrationClinicRow = {
  courseNo: string
  clinicCourseTitle: string
  hours: number
  day: string
  time: string
  supervisorName: string
}

export type RegistrationOfficeFees = {
  tuition: number
  clinical: number
  fees: number
  other: number
  applicationFee: number
  discount: number
  registration: number
  clinic: number
  totalFees: number
}

export type RegistrationStudentBlock = {
  name: string
  address: string
  email: string
  registrationQuarter: string
  studentId: string
  contactPhone: string
}

export type RegistrationFormViewModel = {
  student: RegistrationStudentBlock
  didactic: RegistrationDidacticRow[]
  clinic: RegistrationClinicRow[]
  totalUnits: number
  totalHours: number
  office: RegistrationOfficeFees
}

const ZERO_OFFICE: RegistrationOfficeFees = {
  tuition: 0,
  clinical: 0,
  fees: 0,
  other: 0,
  applicationFee: 0,
  discount: 0,
  registration: 0,
  clinic: 0,
  totalFees: 0,
}

function str(v: unknown): string {
  if (v == null) return ''
  const s = String(v).trim()
  return s
}

function rowRecord(row: TranscriptRow): Record<string, unknown> {
  return row as TranscriptRow & Record<string, unknown>
}

function isClinicSource(row: TranscriptRow): boolean {
  const src = rowRecord(row).source
  return src === 'clinic'
}

function scheduleSlotLabel(
  days: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  const d = days?.trim() || ''
  const a = from?.trim() || ''
  const b = to?.trim() || ''
  if (a && b) return `${a} – ${b}`
  if (a) return a
  if (b) return b
  return d || '—'
}

function findScheduleMatch(
  schedule: StudentAcademicsResponse['currentSchedule'],
  courseCode: string,
  year: number,
  quarter: RegistrationQuarter,
): StudentAcademicsResponse['currentSchedule'][number] | null {
  const code = courseCode.trim().toUpperCase()
  for (const s of schedule) {
    if (s.courseCode.trim().toUpperCase() !== code) continue
    if (s.year !== year) continue
    if (!termsMatchQuarter(s.term, quarter)) continue
    return s
  }
  return null
}

export function extractFeeSummaryFromAccountPayload(raw: unknown): RegistrationOfficeFees {
  if (raw == null || typeof raw !== 'object') return { ...ZERO_OFFICE }
  const o = raw as Record<string, unknown>
  const summaryRaw = o.summary
  if (summaryRaw == null || typeof summaryRaw !== 'object') return { ...ZERO_OFFICE }
  const s = summaryRaw as Record<string, unknown>
  const tuition = Number(s.tuitionTotal ?? 0) || 0
  const clinical = Number(s.clinicalTotal ?? 0) || 0
  const schoolFees = Number(s.feesTotal ?? 0) || 0
  const other = Number(s.otherTotal ?? 0) || 0
  const totalCharges = Number(s.totalCharges ?? 0) || 0
  return {
    tuition,
    clinical: 0,
    fees: 0,
    other,
    applicationFee: 0,
    discount: 0,
    registration: schoolFees,
    clinic: clinical,
    totalFees: totalCharges || tuition + clinical + schoolFees + other,
  }
}

function buildStudentBlock(
  profile: StudentProfileResponse | null,
  accountName: string,
  accountStudentId: string,
  year: number,
  quarter: RegistrationQuarter,
): RegistrationStudentBlock {
  const name =
    profile?.fullName?.trim() ||
    accountName.trim() ||
    accountStudentId.trim() ||
    '—'
  const addrParts = [
    profile?.address?.trim(),
    [profile?.city, profile?.state, profile?.zip]
      .filter((x) => x != null && String(x).trim() !== '')
      .join(', '),
  ].filter((x) => x && String(x).trim() !== '')
  const address = addrParts.length > 0 ? addrParts.join(', ') : '—'
  const email = profile?.email?.trim() || '—'
  return {
    name,
    address,
    email,
    registrationQuarter: `${quarter} ${year}`,
    studentId: accountStudentId.trim() || '—',
    contactPhone: '—',
  }
}

/**
 * Maps transcript + optional schedule rows into a printable registration form view model.
 * Uses `source === 'clinic'` when present; otherwise all rows are treated as didactic.
 */
export function buildRegistrationFormViewModel(input: {
  year: number
  quarter: RegistrationQuarter
  transcript: StudentTranscriptPreviewResponse['transcript']
  schedule: StudentAcademicsResponse['currentSchedule'] | null
  profile: StudentProfileResponse | null
  accountName: string
  accountStudentId: string
  feePayload: unknown | null
}): RegistrationFormViewModel {
  const { year, quarter, transcript, schedule, profile, accountName, accountStudentId } =
    input

  const termRows = rowsForSelectedTerm(transcript as TranscriptRow[], quarter, year)

  const didactic: RegistrationDidacticRow[] = []
  const clinic: RegistrationClinicRow[] = []

  for (const row of termRows) {
    const code = str(row.courseCode) || '—'
    const titleParts = bilingualCourseTitleParts(row)
    const title = titleParts.primary || '—'
    const sched =
      schedule && schedule.length > 0
        ? findScheduleMatch(schedule, code, year, quarter)
        : null
    const day = sched?.days?.trim() || '—'
    const time = scheduleSlotLabel(sched?.days ?? null, sched?.timeFrom, sched?.timeTo)
    const instructor = sched?.instructor?.trim() || '—'
    const credits = transcriptRowCredits(row)
    const units = credits != null && Number.isFinite(credits) ? credits : 0

    const trackRaw =
      str(rowRecord(row).trackChEn) ||
      str(rowRecord(row).track) ||
      str(rowRecord(row).languageTrack)
    const trackChEn = trackRaw || '—'

    if (isClinicSource(row)) {
      clinic.push({
        courseNo: code,
        clinicCourseTitle: title,
        hours: units,
        day,
        time: time === '—' && sched
          ? scheduleSlotLabel(null, sched.timeFrom, sched.timeTo)
          : time,
        supervisorName: instructor,
      })
    } else {
      didactic.push({
        courseNo: code,
        courseTitle: title,
        units,
        day,
        time: time === '—' && sched
          ? scheduleSlotLabel(null, sched.timeFrom, sched.timeTo)
          : time,
        trackChEn,
        instructor,
      })
    }
  }

  const totalUnits = didactic.reduce((s, r) => s + (Number.isFinite(r.units) ? r.units : 0), 0)
  const totalHours = clinic.reduce((s, r) => s + (Number.isFinite(r.hours) ? r.hours : 0), 0)

  const office =
    input.feePayload != null
      ? extractFeeSummaryFromAccountPayload(input.feePayload)
      : { ...ZERO_OFFICE }

  return {
    student: buildStudentBlock(profile, accountName, accountStudentId, year, quarter),
    didactic,
    clinic,
    totalUnits,
    totalHours,
    office,
  }
}

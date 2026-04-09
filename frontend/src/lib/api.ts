import { parseScheduleRowsFromStudentAccountJson } from './parseStudentAccountScheduleRows'
import { normalizeScheduleTrackValue } from './scheduleTrack'
import type { ScheduleRow } from '../types/billing'

export { formatMoney } from './formatMoney'

export const CARD_CONVENIENCE_RATE = 0.0285

/** Normalized base (no trailing slash). Empty → relative `/api/...` (same-origin or Vite proxy). */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '')
  .trim()
  .replace(/\/$/, '')

const JSON_SNIPPET_MAX = 280

/**
 * Join base + path. `path` must start with `/` (e.g. `/api/students/x/account` or `...?term=Fall&year=2026`).
 */
export function buildApiUrl(pathWithQuery: string): string {
  const path =
    pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`
  if (!API_BASE_URL) return path
  return `${API_BASE_URL}${path}`
}

/**
 * Low-level fetch with debug logs (final URL, status, content-type).
 */
export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = buildApiUrl(path)
  console.debug('[api] request', url)
  const res = await fetch(url, init)
  const ct = res.headers.get('content-type') ?? ''
  console.debug('[api] response', res.status, ct || '(no content-type)')
  return res
}

/**
 * Fetch JSON from the API. Verifies `application/json` before parsing; throws with status, content-type,
 * and a body snippet when the response is HTML or other non-JSON.
 */
export async function fetchApiJson(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await apiFetch(path, init)
  const ct = (res.headers.get('content-type') ?? '').toLowerCase()
  const text = await res.text()

  if (!ct.includes('application/json')) {
    const snippet =
      text
        .slice(0, JSON_SNIPPET_MAX)
        .replace(/\s+/g, ' ')
        .trim() || '(empty)'
    const prefix = `Expected application/json but got "${ct || 'no content-type'}" (HTTP ${res.status}). Body starts with: ${snippet}`
    if (!res.ok) {
      throw new Error(`Request failed: ${prefix}`)
    }
    throw new Error(prefix)
  }

  const trimmed = text.trim()
  if (trimmed === '') {
    if (!res.ok) {
      throw new Error(`Empty response body (HTTP ${res.status})`)
    }
    return null
  }

  let data: unknown
  try {
    data = JSON.parse(trimmed) as unknown
  } catch {
    throw new Error(`Invalid JSON in response (HTTP ${res.status})`)
  }

  if (!res.ok) {
    const body = data as { error?: string; message?: string }
    const msg =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error === 'string' && body.error) ||
      'Request failed'
    throw new Error(`${msg} (HTTP ${res.status})`)
  }

  return data
}

export type FetchStudentAccountOptions = {
  /** When both set, load that term only; otherwise the API uses the latest enrolled term/year. */
  term?: string
  year?: number
  signal?: AbortSignal
}

/**
 * GET /api/students/:studentId/account
 * Optional query: `term` + `year` together for a specific term; omit both to use the student's
 * latest term with enrollments (server-side resolution).
 */
export async function fetchStudentAccount(
  studentId: string,
  options?: FetchStudentAccountOptions,
): Promise<unknown> {
  const { term, year, signal } = options ?? {}
  const params = new URLSearchParams()
  if (
    typeof term === 'string' &&
    term.trim() !== '' &&
    year != null &&
    Number.isFinite(year)
  ) {
    params.set('term', term.trim())
    params.set('year', String(year))
  }
  const qs = params.toString()
  const path = `/api/students/${encodeURIComponent(studentId)}/account${qs ? `?${qs}` : ''}`
  return fetchApiJson(path, { signal })
}

/**
 * Registered class schedule rows for one term — same payload shape as `scheduleRows` on the student
 * account endpoint (`GET /api/students/:id/account?term=&year=`).
 */
export async function fetchStudentRegisteredScheduleRowsForTerm(
  studentId: string,
  term: string,
  year: number,
  options?: { signal?: AbortSignal },
): Promise<ScheduleRow[]> {
  const t = term.trim()
  const y = Number(year)
  if (!t || !Number.isFinite(y)) return []
  const raw = await fetchStudentAccount(studentId, {
    term: t,
    year: y,
    signal: options?.signal,
  })
  return parseScheduleRowsFromStudentAccountJson(raw)
}

/** GET /api/students/:studentId/profile — legacy `students` demographics. */
export type StudentProfileResponse = {
  studentId: string
  fullName: string
  track: string | null
  gender: string | null
  age: number | null
  enrollmentDate: string | null
  background: string | null
  credits: number | null
  highestDegree: string | null
  race: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  email: string | null
}

/** GET /api/admin/students — legacy `students` roster (admin UI). */
export type AdminStudentListItem = {
  studentId: string
  division: 'Chinese' | 'English' | 'Unknown'
  name: string
  email: string | null
  requirementsId: string | null
  highestDegree: string | null
  backgroundSchool: string | null
  signedDate: string | null
  enrollStartDate: string | null
  resolvedEntryDate: string | null
  entryYear: number | null
  latestRegistrationTerm: string | null
  /** Present when the list is requested with `clinicalSummary=1`. */
  clinicalProgressSummary?: AdminStudentClinicalProgressSummary
}

/** GET /api/admin/students — paginated roster (`items` is one page). */
export type AdminStudentListPageResponse = {
  items: AdminStudentListItem[]
  total: number
  page: number
  pageSize: number
}

/** One line-item under a term bucket in admin registration history (optional API field). */
export type AdminStudentRegistrationHistoryItem = {
  courseCode?: string
  courseTitle?: string
  credits?: number | null
  instructor?: string | null
  status?: string | null
  grade?: string | null
  schedule?: string | null
}

/** Registration history grouped by quarter/term (optional API field). */
export type AdminStudentRegistrationHistoryTerm = {
  term: string
  items: AdminStudentRegistrationHistoryItem[]
}

/** Same contract as student account `clinicalProgress` (admin detail includes when available). */
export type ClinicalProgress = {
  level: number
  completedHours: number
  requiredHours: number
  completedCourses: string[]
  readiness: 'ready' | 'not_ready'
  missing: string[]
}

/** Subset of clinical progress on admin student list when `clinicalSummary=1`. */
export type AdminStudentClinicalProgressSummary = {
  level: number
  completedHours: number
  requiredHours: number
  readiness: ClinicalProgress['readiness']
  missingCount: number
  missingSummary: string | null
}

/** GET/PUT /api/admin/students/:studentId — admin student detail. */
export type AdminStudentDetail = {
  studentId: string
  division: 'Chinese' | 'English' | 'Unknown'
  name: string
  email: string | null
  requirementsId: string | null
  highestDegree: string | null
  backgroundSchool: string | null
  gender: string | null
  signedDate: string | null
  enrollStartDate: string | null
  resolvedEntryDate: string | null
  entryYear: number | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  latestRegistrationTerm: string | null
  clinicalProgress?: ClinicalProgress
  /** When present, drives quarter-based registration history on the admin detail page. */
  registrationHistory?: AdminStudentRegistrationHistoryTerm[]
}

export type AdminStudentUpdatePayload = {
  name: string
  email: string | null
  gender: string | null
  backgroundSchool: string | null
  highestDegree: string | null
  requirementsId: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  signedDate: string | null
  enrollStartDate: string | null
}

function parseAdminDivision(
  v: unknown,
): 'Chinese' | 'English' | 'Unknown' {
  if (v === 'Chinese' || v === 'English' || v === 'Unknown') return v
  throw new Error('Unexpected admin students response')
}

function parseNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  throw new Error('Unexpected admin students response')
}

function parseNullableRequirementsId(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  throw new Error('Unexpected admin students response')
}

function parseNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  throw new Error('Unexpected admin students response')
}

function parseOptionalFiniteNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function parseOptionalRegistrationHistoryItem(
  raw: Record<string, unknown>,
): AdminStudentRegistrationHistoryItem {
  const courseCodeRaw = raw.courseCode ?? raw.course_code
  const courseTitleRaw = raw.courseTitle ?? raw.course_title
  const instructorRaw = raw.instructor
  const statusRaw = raw.status
  const gradeRaw = raw.grade
  const scheduleRaw = raw.schedule
  return {
    courseCode:
      typeof courseCodeRaw === 'string' && courseCodeRaw.trim() !== ''
        ? courseCodeRaw
        : undefined,
    courseTitle:
      typeof courseTitleRaw === 'string' && courseTitleRaw.trim() !== ''
        ? courseTitleRaw
        : undefined,
    credits: parseOptionalFiniteNumber(raw.credits),
    instructor:
      typeof instructorRaw === 'string' && instructorRaw.trim() !== ''
        ? instructorRaw
        : typeof instructorRaw === 'number' && Number.isFinite(instructorRaw)
          ? String(instructorRaw)
          : null,
    status:
      typeof statusRaw === 'string' && statusRaw.trim() !== ''
        ? statusRaw
        : null,
    grade:
      typeof gradeRaw === 'string' && gradeRaw.trim() !== ''
        ? gradeRaw
        : null,
    schedule:
      typeof scheduleRaw === 'string' && scheduleRaw.trim() !== ''
        ? scheduleRaw
        : null,
  }
}

function parseClinicalProgressSummary(
  v: unknown,
): AdminStudentClinicalProgressSummary | undefined {
  if (v == null || typeof v !== 'object') return undefined
  const p = v as Record<string, unknown>
  const level = Number(p.level)
  const completedHours = Number(p.completedHours)
  const requiredHours = Number(p.requiredHours)
  const readinessRaw = String(p.readiness ?? '')
  const readiness: ClinicalProgress['readiness'] =
    readinessRaw === 'ready' || readinessRaw === 'not_ready'
      ? readinessRaw
      : 'not_ready'
  const missingCount = Number(p.missingCount)
  const missingSummaryRaw = p.missingSummary
  const missingSummary =
    missingSummaryRaw == null
      ? null
      : typeof missingSummaryRaw === 'string'
        ? missingSummaryRaw
        : null
  return {
    level: Number.isFinite(level) ? level : 0,
    completedHours: Number.isFinite(completedHours) ? completedHours : 0,
    requiredHours: Number.isFinite(requiredHours) ? requiredHours : 0,
    readiness,
    missingCount: Number.isFinite(missingCount) ? missingCount : 0,
    missingSummary,
  }
}

function parseOptionalClinicalProgress(
  v: unknown,
): ClinicalProgress | undefined {
  if (v == null || typeof v !== 'object') return undefined
  const p = v as Record<string, unknown>
  const level = Number(p.level)
  const completedHours = Number(p.completedHours)
  const requiredHours = Number(p.requiredHours)
  const readinessRaw = String(p.readiness ?? '')
  const readiness: ClinicalProgress['readiness'] =
    readinessRaw === 'ready' || readinessRaw === 'not_ready'
      ? readinessRaw
      : 'not_ready'
  const completedCourses = Array.isArray(p.completedCourses)
    ? p.completedCourses.map((x) => String(x))
    : []
  const missing = Array.isArray(p.missing) ? p.missing.map((x) => String(x)) : []
  return {
    level: Number.isFinite(level) ? level : 0,
    completedHours: Number.isFinite(completedHours) ? completedHours : 0,
    requiredHours: Number.isFinite(requiredHours) ? requiredHours : 0,
    completedCourses,
    readiness,
    missing,
  }
}

function parseOptionalRegistrationHistory(
  v: unknown,
): AdminStudentRegistrationHistoryTerm[] | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) return undefined
  const out: AdminStudentRegistrationHistoryTerm[] = []
  for (const el of v) {
    if (el == null || typeof el !== 'object') continue
    const r = el as Record<string, unknown>
    const termRaw = r.term
    if (typeof termRaw !== 'string' || termRaw.trim() === '') continue
    const term = termRaw.trim()
    const itemsRaw = r.items
    const items: AdminStudentRegistrationHistoryItem[] = []
    if (Array.isArray(itemsRaw)) {
      for (const it of itemsRaw) {
        if (it == null || typeof it !== 'object') continue
        items.push(
          parseOptionalRegistrationHistoryItem(it as Record<string, unknown>),
        )
      }
    }
    out.push({ term, items })
  }
  return out.length > 0 ? out : undefined
}

function parseAdminStudentListRow(o: Record<string, unknown>): AdminStudentListItem {
  if (typeof o.studentId !== 'string' || typeof o.name !== 'string') {
    throw new Error('Unexpected admin students response')
  }
  const clinicalProgressSummary = parseClinicalProgressSummary(
    o.clinicalProgressSummary ?? o.clinical_progress_summary,
  )
  return {
    studentId: o.studentId,
    division: parseAdminDivision(o.division),
    name: o.name,
    email: parseNullableString(o.email),
    requirementsId: parseNullableRequirementsId(o.requirementsId),
    highestDegree: parseNullableString(o.highestDegree),
    backgroundSchool: parseNullableString(o.backgroundSchool),
    signedDate: parseNullableString(o.signedDate),
    enrollStartDate: parseNullableString(o.enrollStartDate),
    resolvedEntryDate: parseNullableString(o.resolvedEntryDate),
    entryYear: parseNullableNumber(o.entryYear),
    latestRegistrationTerm: parseNullableString(o.latestRegistrationTerm),
    ...(clinicalProgressSummary != null
      ? { clinicalProgressSummary }
      : {}),
  }
}

function parseAdminStudentDetailPayload(data: unknown): AdminStudentDetail {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected admin student detail response')
  }
  const o = data as Record<string, unknown>
  if (typeof o.studentId !== 'string' || typeof o.name !== 'string') {
    throw new Error('Unexpected admin student detail response')
  }
  const registrationHistory = parseOptionalRegistrationHistory(
    o.registrationHistory ?? o.registration_history,
  )
  const clinicalProgress = parseOptionalClinicalProgress(
    o.clinicalProgress ?? o.clinical_progress,
  )
  return {
    studentId: o.studentId,
    division: parseAdminDivision(o.division),
    name: o.name,
    email: parseNullableString(o.email),
    requirementsId: parseNullableRequirementsId(o.requirementsId),
    highestDegree: parseNullableString(o.highestDegree),
    backgroundSchool: parseNullableString(o.backgroundSchool),
    gender: parseNullableString(o.gender),
    signedDate: parseNullableString(o.signedDate),
    enrollStartDate: parseNullableString(o.enrollStartDate),
    resolvedEntryDate: parseNullableString(o.resolvedEntryDate),
    entryYear: parseNullableNumber(o.entryYear),
    address: parseNullableString(o.address),
    city: parseNullableString(o.city),
    state: parseNullableString(o.state),
    zip: parseNullableString(o.zip),
    latestRegistrationTerm: parseNullableString(o.latestRegistrationTerm),
    ...(clinicalProgress != null ? { clinicalProgress } : {}),
    ...(registrationHistory != null ? { registrationHistory } : {}),
  }
}

function parseAdminStudentListPageResponse(
  data: unknown,
): AdminStudentListPageResponse {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected admin students response')
  }
  const o = data as Record<string, unknown>
  const rawItems = o.items
  if (!Array.isArray(rawItems)) {
    throw new Error('Unexpected admin students response')
  }
  const total = Number(o.total)
  const page = Number(o.page)
  const pageSize = Number(o.pageSize)
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(page) ||
    !Number.isFinite(pageSize)
  ) {
    throw new Error('Unexpected admin students response')
  }
  const items: AdminStudentListItem[] = []
  for (const row of rawItems) {
    if (row == null || typeof row !== 'object') {
      throw new Error('Unexpected admin students response')
    }
    items.push(parseAdminStudentListRow(row as Record<string, unknown>))
  }
  return {
    items,
    total: Math.trunc(total),
    page: Math.trunc(page),
    pageSize: Math.trunc(pageSize),
  }
}

export async function fetchAdminStudents(options?: {
  signal?: AbortSignal
  /** 1-based page index. Default 1. */
  page?: number
  /** Rows per page. Default 25. */
  pageSize?: number
  /** Server-side filter (student id, name, email, program). */
  search?: string
  /** When true, each row may include `clinicalProgressSummary` (same source as admin detail). */
  clinicalSummary?: boolean
}): Promise<AdminStudentListPageResponse> {
  const params = new URLSearchParams()
  const page = options?.page ?? 1
  const pageSize = options?.pageSize ?? 25
  params.set('page', String(Math.max(1, Math.trunc(page))))
  params.set('pageSize', String(Math.max(1, Math.trunc(pageSize))))
  const search = (options?.search ?? '').trim()
  if (search !== '') {
    params.set('search', search.slice(0, 200))
  }
  if (options?.clinicalSummary) {
    params.set('clinicalSummary', '1')
  }
  const path = `/api/admin/students?${params.toString()}`
  const data = (await fetchApiJson(path, {
    signal: options?.signal,
  })) as unknown
  return parseAdminStudentListPageResponse(data)
}

export async function fetchAdminStudentDetail(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<AdminStudentDetail> {
  const path = `/api/admin/students/${encodeURIComponent(studentId)}`
  const data = await fetchApiJson(path, { signal: options?.signal })
  return parseAdminStudentDetailPayload(data)
}

export async function updateAdminStudent(
  studentId: string,
  body: AdminStudentUpdatePayload,
  options?: { signal?: AbortSignal },
): Promise<AdminStudentDetail> {
  const path = `/api/admin/students/${encodeURIComponent(studentId)}`
  const data = await fetchApiJson(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  return parseAdminStudentDetailPayload(data)
}

export type AdminDivision = 'Chinese' | 'English'

export type PreviewNextStudentIdResponse = {
  studentId: string
}

export type CreateAdminStudentBody = {
  division: AdminDivision
  /** ISO `YYYY-MM-DD`; id bucket uses calendar year + month from this date. */
  entryDate: string
  name: string
  email?: string | null
  gender?: string | null
  requirementsId?: number | null
  highestDegree?: string | null
  backgroundSchool?: string | null
  signedDate?: string | null
  enrollStartDate?: string | null
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  initialPassword: string
}

export async function fetchNextAdminStudentId(
  division: AdminDivision,
  entryDate: string,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const params = new URLSearchParams()
  params.set('division', division)
  params.set('entryDate', entryDate.trim())
  const path = `/api/admin/students/next-id?${params.toString()}`
  const data = (await fetchApiJson(path, {
    signal: options?.signal,
  })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { studentId?: unknown }).studentId === 'string'
  ) {
    return (data as PreviewNextStudentIdResponse).studentId
  }
  throw new Error('Unexpected next student id response')
}

export type CreateAdminStudentResponse = {
  ok: boolean
  studentId: string
}

export async function createAdminStudent(
  body: CreateAdminStudentBody,
  options?: { signal?: AbortSignal },
): Promise<CreateAdminStudentResponse> {
  const data = (await fetchApiJson('/api/admin/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true &&
    typeof (data as { studentId?: unknown }).studentId === 'string'
  ) {
    return data as CreateAdminStudentResponse
  }
  throw new Error('Unexpected create student response')
}

export type DeleteSelectedAdminStudentsResponse = {
  ok: true
  deletedStudentIds: string[]
  blocked: Array<{
    studentId: string
    reason: string
  }>
}

export async function deleteSelectedAdminStudents(
  studentIds: string[],
  options?: { signal?: AbortSignal },
): Promise<DeleteSelectedAdminStudentsResponse> {
  const data = (await fetchApiJson('/api/admin/students/delete-selected', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentIds }),
    signal: options?.signal,
  })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true &&
    Array.isArray((data as { deletedStudentIds?: unknown }).deletedStudentIds) &&
    Array.isArray((data as { blocked?: unknown }).blocked)
  ) {
    const deletedStudentIds = (data as { deletedStudentIds: unknown[] })
      .deletedStudentIds
    const blockedRaw = (data as { blocked: unknown[] }).blocked
    for (const id of deletedStudentIds) {
      if (typeof id !== 'string') {
        throw new Error('Unexpected delete-selected response')
      }
    }
    for (const b of blockedRaw) {
      if (
        b == null ||
        typeof b !== 'object' ||
        typeof (b as { studentId?: unknown }).studentId !== 'string' ||
        typeof (b as { reason?: unknown }).reason !== 'string'
      ) {
        throw new Error('Unexpected delete-selected response')
      }
    }
    return data as DeleteSelectedAdminStudentsResponse
  }
  throw new Error('Unexpected delete-selected response')
}

export async function fetchStudentProfile(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<StudentProfileResponse> {
  const path = `/api/students/${encodeURIComponent(studentId)}/profile`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { studentId?: unknown }).studentId === 'string' &&
    typeof (data as { fullName?: unknown }).fullName === 'string'
  ) {
    return data as StudentProfileResponse
  }
  throw new Error('Unexpected student profile response')
}

export type LoginStudentSuccess = {
  studentId: string
  displayName: string
}

/**
 * POST /api/auth/login — legacy students table password check.
 * On success returns { studentId, displayName }; throws on 4xx/5xx (see fetchApiJson).
 */
export async function loginStudent(
  studentId: string,
  password: string,
  options?: { signal?: AbortSignal },
): Promise<LoginStudentSuccess> {
  const data = (await fetchApiJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: studentId.trim(),
      password,
    }),
    signal: options?.signal,
  })) as unknown

  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { studentId?: unknown }).studentId === 'string' &&
    typeof (data as { displayName?: unknown }).displayName === 'string'
  ) {
    const o = data as LoginStudentSuccess
    return { studentId: o.studentId, displayName: o.displayName }
  }

  throw new Error('Unexpected login response shape')
}

export type AccountingQuarterOption = {
  term: string
  year: number
  label: string
}

export type AccountingQuartersResponse = {
  studentId: string
  quarters: AccountingQuarterOption[]
}

export type LedgerRowSourceType =
  | 'system'
  | 'manual_charge'
  | 'manual_payment'
  | 'auto_late_fee'

export type AccountingLedgerRow = {
  date: string
  type: string
  code: string
  memo: string
  debit: number
  credit: number
  sourceType?: LedgerRowSourceType
  sourceId?: string | number | null
  isEditable?: boolean
  isDeletable?: boolean
}

export type AccountingLedgerResponse = {
  studentId: string
  term: string
  year: number
  rows: AccountingLedgerRow[]
  summary: {
    totalCharges: number
    totalPayments: number
    balance: number
  }
}

/** GET /api/students/:studentId/accounting/quarters — legacy `accounting` term/year list (real students). */
export async function fetchAccountingQuarters(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<AccountingQuartersResponse> {
  const path = `/api/students/${encodeURIComponent(studentId)}/accounting/quarters`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { studentId?: unknown }).studentId === 'string' &&
    Array.isArray((data as { quarters?: unknown }).quarters)
  ) {
    return data as AccountingQuartersResponse
  }
  throw new Error('Unexpected accounting quarters response')
}

/** GET /api/students/:studentId/accounting/ledger?term=&year= — legacy ledger rows for one quarter. */
export async function fetchAccountingLedger(
  studentId: string,
  term: string,
  year: number,
  options?: { signal?: AbortSignal },
): Promise<AccountingLedgerResponse> {
  const params = new URLSearchParams()
  params.set('term', term.trim())
  params.set('year', String(year))
  const path = `/api/students/${encodeURIComponent(studentId)}/accounting/ledger?${params.toString()}`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { studentId?: unknown }).studentId === 'string' &&
    typeof (data as { term?: unknown }).term === 'string' &&
    typeof (data as { year?: unknown }).year === 'number' &&
    Array.isArray((data as { rows?: unknown }).rows) &&
    (data as { summary?: unknown }).summary != null &&
    typeof (data as { summary: unknown }).summary === 'object'
  ) {
    return data as AccountingLedgerResponse
  }
  throw new Error('Unexpected accounting ledger response')
}

/** GET /api/admin/finance/students — paginated roster with quarter balance. */
export type AdminFinanceStudentListItem = {
  studentId: string
  name: string
  balance: number
}

/** @deprecated Use {@link AdminFinanceStudentListItem} */
export type AdminFinanceStudentRow = AdminFinanceStudentListItem

export type AdminFinanceStudentsListResponse = {
  items: AdminFinanceStudentListItem[]
  total: number
  page: number
  pageSize: number
}

function parseAdminFinanceStudentListItem(
  o: Record<string, unknown>,
): AdminFinanceStudentListItem {
  if (typeof o.studentId !== 'string' || typeof o.name !== 'string') {
    throw new Error('Unexpected admin finance students response')
  }
  const bal = o.balance
  let balance = 0
  if (typeof bal === 'number' && Number.isFinite(bal)) {
    balance = bal
  } else if (typeof bal === 'string') {
    const t = bal.trim()
    if (t !== '') {
      const n = Number(t)
      if (Number.isFinite(n)) balance = n
    }
  }
  return { studentId: o.studentId, name: o.name, balance }
}

export type AdminFinanceStudentsQuery = {
  page?: number
  pageSize?: number
  search?: string
  balance?: 'all' | 'positive' | 'negative' | 'zero'
}

/** GET /api/admin/finance/students?term=&year=&page=&pageSize=&search=&balance= */
export async function fetchAdminFinanceStudents(
  term: string,
  year: number,
  options?: {
    signal?: AbortSignal
    query?: AdminFinanceStudentsQuery
  },
): Promise<AdminFinanceStudentsListResponse> {
  const params = new URLSearchParams()
  params.set('term', term.trim())
  params.set('year', String(year))
  const q = options?.query
  if (q?.page != null && Number.isFinite(q.page) && q.page > 0) {
    params.set('page', String(Math.trunc(q.page)))
  }
  if (q?.pageSize != null && Number.isFinite(q.pageSize) && q.pageSize > 0) {
    params.set('pageSize', String(Math.trunc(q.pageSize)))
  }
  if (q?.search != null && q.search.trim() !== '') {
    params.set('search', q.search.trim())
  }
  if (q?.balance != null && q.balance !== 'all') {
    params.set('balance', q.balance)
  }
  const data = (await fetchApiJson(
    `/api/admin/finance/students?${params.toString()}`,
    {
      signal: options?.signal,
    },
  )) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected admin finance students response')
  }
  const d = data as Record<string, unknown>
  const rawItems = d.items
  if (!Array.isArray(rawItems)) {
    throw new Error('Unexpected admin finance students response')
  }
  const items: AdminFinanceStudentListItem[] = []
  for (const row of rawItems) {
    if (row == null || typeof row !== 'object') {
      throw new Error('Unexpected admin finance students response')
    }
    items.push(parseAdminFinanceStudentListItem(row as Record<string, unknown>))
  }
  const total = d.total
  const page = d.page
  const pageSize = d.pageSize
  if (typeof total !== 'number' || !Number.isFinite(total)) {
    throw new Error('Unexpected admin finance students response')
  }
  if (typeof page !== 'number' || !Number.isFinite(page)) {
    throw new Error('Unexpected admin finance students response')
  }
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) {
    throw new Error('Unexpected admin finance students response')
  }
  return { items, total, page, pageSize }
}

/** GET /api/admin/finance/:studentId/quarters — same shape as student accounting quarters. */
export async function fetchAdminFinanceQuarters(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<AccountingQuartersResponse> {
  const path = `/api/admin/finance/${encodeURIComponent(studentId)}/quarters`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { studentId?: unknown }).studentId === 'string' &&
    Array.isArray((data as { quarters?: unknown }).quarters)
  ) {
    return data as AccountingQuartersResponse
  }
  throw new Error('Unexpected admin finance quarters response')
}

/** GET /api/admin/finance/:studentId/ledger?term=&year= */
export async function fetchAdminFinanceLedger(
  studentId: string,
  term: string,
  year: number,
  options?: { signal?: AbortSignal },
): Promise<AccountingLedgerResponse> {
  const params = new URLSearchParams()
  params.set('term', term.trim())
  params.set('year', String(year))
  const path = `/api/admin/finance/${encodeURIComponent(studentId)}/ledger?${params.toString()}`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { studentId?: unknown }).studentId === 'string' &&
    typeof (data as { term?: unknown }).term === 'string' &&
    typeof (data as { year?: unknown }).year === 'number' &&
    Array.isArray((data as { rows?: unknown }).rows) &&
    (data as { summary?: unknown }).summary != null &&
    typeof (data as { summary: unknown }).summary === 'object'
  ) {
    return data as AccountingLedgerResponse
  }
  throw new Error('Unexpected admin finance ledger response')
}

export type PostAdminFinanceChargeBody = {
  studentId: string
  term: string
  year: number
  description: string
  amount: number
  category?: 'fees' | 'other' | 'tuition' | 'clinical'
}

export type PostAdminFinancePaymentBody = {
  studentId: string
  term: string
  year: number
  amount: number
  paidAt?: string
  method?: string
  description?: string
}

/** POST /api/admin/finance/charge — inserts `portal_billing_adjustments`. */
export async function postAdminFinanceCharge(
  body: PostAdminFinanceChargeBody,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean }> {
  const data = (await fetchApiJson('/api/admin/finance/charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true
  ) {
    return { ok: true }
  }
  throw new Error('Unexpected admin finance charge response')
}

/** POST /api/admin/finance/payment — inserts `portal_payments`. */
export async function postAdminFinancePayment(
  body: PostAdminFinancePaymentBody,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean }> {
  const data = (await fetchApiJson('/api/admin/finance/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true
  ) {
    return { ok: true }
  }
  throw new Error('Unexpected admin finance payment response')
}

export type AdminFinanceGlobalQuarter = {
  term: string
  year: number
  label: string
}

/** GET /api/admin/finance/quarters */
export async function fetchGlobalFinanceQuarters(options?: {
  signal?: AbortSignal
}): Promise<AdminFinanceGlobalQuarter[]> {
  const data = (await fetchApiJson('/api/admin/finance/quarters', {
    signal: options?.signal,
  })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    Array.isArray((data as { quarters?: unknown }).quarters)
  ) {
    const q = (data as { quarters: unknown[] }).quarters
    const out: AdminFinanceGlobalQuarter[] = []
    for (const row of q) {
      if (row == null || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      if (
        typeof o.term === 'string' &&
        typeof o.year === 'number' &&
        typeof o.label === 'string'
      ) {
        out.push({ term: o.term, year: o.year, label: o.label })
      }
    }
    return out
  }
  throw new Error('Unexpected global finance quarters response')
}

function financeLedgerContextQuery(
  studentId: string,
  term: string,
  year: number,
): string {
  const p = new URLSearchParams()
  p.set('studentId', studentId.trim())
  p.set('term', term.trim())
  p.set('year', String(year))
  return p.toString()
}

export type PutAdminFinanceChargeBody = {
  description: string
  amount: number
  category: 'fees' | 'other' | 'tuition' | 'clinical'
}

/** PUT /api/admin/finance/charge/:id */
export async function putAdminFinanceCharge(
  id: number,
  studentId: string,
  term: string,
  year: number,
  body: PutAdminFinanceChargeBody,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean }> {
  const qs = financeLedgerContextQuery(studentId, term, year)
  const data = (await fetchApiJson(
    `/api/admin/finance/charge/${encodeURIComponent(String(id))}?${qs}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    },
  )) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true
  ) {
    return { ok: true }
  }
  throw new Error('Unexpected admin finance charge update response')
}

/** DELETE /api/admin/finance/charge/:id */
export async function deleteAdminFinanceCharge(
  id: number,
  studentId: string,
  term: string,
  year: number,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean }> {
  const qs = financeLedgerContextQuery(studentId, term, year)
  const data = (await fetchApiJson(
    `/api/admin/finance/charge/${encodeURIComponent(String(id))}?${qs}`,
    { method: 'DELETE', signal: options?.signal },
  )) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true
  ) {
    return { ok: true }
  }
  throw new Error('Unexpected admin finance charge delete response')
}

export type PutAdminFinancePaymentBody = {
  amount: number
  paidAt: string
  method: string
  description: string | null
}

/** PUT /api/admin/finance/payment/:id */
export async function putAdminFinancePayment(
  id: number,
  studentId: string,
  term: string,
  year: number,
  body: PutAdminFinancePaymentBody,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean }> {
  const qs = financeLedgerContextQuery(studentId, term, year)
  const data = (await fetchApiJson(
    `/api/admin/finance/payment/${encodeURIComponent(String(id))}?${qs}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    },
  )) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true
  ) {
    return { ok: true }
  }
  throw new Error('Unexpected admin finance payment update response')
}

/** DELETE /api/admin/finance/payment/:id */
export async function deleteAdminFinancePayment(
  id: number,
  studentId: string,
  term: string,
  year: number,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean }> {
  const qs = financeLedgerContextQuery(studentId, term, year)
  const data = (await fetchApiJson(
    `/api/admin/finance/payment/${encodeURIComponent(String(id))}?${qs}`,
    { method: 'DELETE', signal: options?.signal },
  )) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    (data as { ok?: unknown }).ok === true
  ) {
    return { ok: true }
  }
  throw new Error('Unexpected admin finance payment delete response')
}

/** Shared status for normalized academic rows (matches backend `StudentAcademicCourseStatus`). */
export type StudentAcademicCourseStatus =
  | 'active'
  | 'completed'
  | 'withdrawn'
  | 'dropped'
  | 'unknown'

/** One normalized course row from GET /academics (`courseRecords`) — use for schedule, history, feedback eligibility. */
export type StudentAcademicCourseRecord = {
  studentId: string
  courseCode: string
  courseTitle: string
  term: string
  year: number
  credits: number | null
  instructor: string | null
  days: string | null
  timeFrom: string | null
  timeTo: string | null
  grade: string | null
  numericGrade: number | null
  status: StudentAcademicCourseStatus
  source: 'marks' | 'clinic' | 'portal'
}

/** GET /api/students/:studentId/academics — schedule, transcript, and term metadata. */
export type StudentAcademicsResponse = {
  studentId: string
  studentName: string
  currentTerm: { term: string; year: number } | null
  availableTerms: Array<{
    term: string
    year: number
    label: string
  }>
  currentSchedule: Array<{
    courseCode: string
    courseTitle: string
    days: string | null
    timeFrom: string | null
    timeTo: string | null
    instructor: string | null
    term: string
    year: number
    credits: number | null
    status: StudentAcademicCourseStatus
  }>
  transcript: Array<{
    courseCode: string
    courseTitle: string
    term: string
    year: number
    grade: string | null
    numericGrade: number | null
    credits?: number | null
    titleEn?: string | null
    titleZh?: string | null
    courseTitleEn?: string | null
    courseTitleZh?: string | null
    course_title_en?: string | null
    course_title_zh?: string | null
  }>
  enrollmentHistory: Array<{
    courseCode: string
    courseTitle: string
    term: string
    year: number
    credits: number | null
    grade: string | null
    status: StudentAcademicCourseStatus
    instructor: string | null
    feedbackEligible: boolean
    /** Omitted on older API versions; treat as false when missing. */
    feedbackSubmitted?: boolean
    feedbackSubmittedAt?: string | null
  }>
  /** Normalized marks rows; `currentSchedule`, `transcript`, and `enrollmentHistory` are views of this list. */
  courseRecords: StudentAcademicCourseRecord[]
}

export async function fetchStudentAcademics(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<StudentAcademicsResponse> {
  const path = `/api/students/${encodeURIComponent(studentId)}/academics`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected student academics response')
  }
  const o = data as Record<string, unknown>
  if (typeof o.studentId !== 'string' || typeof o.studentName !== 'string') {
    throw new Error('Unexpected student academics response')
  }
  if (
    o.currentTerm != null &&
    (typeof o.currentTerm !== 'object' ||
      typeof (o.currentTerm as { term?: unknown }).term !== 'string' ||
      typeof (o.currentTerm as { year?: unknown }).year !== 'number')
  ) {
    throw new Error('Unexpected student academics response')
  }
  if (!Array.isArray(o.availableTerms) || !Array.isArray(o.currentSchedule)) {
    throw new Error('Unexpected student academics response')
  }
  if (!Array.isArray(o.transcript) || !Array.isArray(o.enrollmentHistory)) {
    throw new Error('Unexpected student academics response')
  }
  if (!Array.isArray(o.courseRecords)) {
    throw new Error('Unexpected student academics response')
  }
  return data as StudentAcademicsResponse
}

/** GET /api/students/:studentId/clinical-schedule — JSON array of assignment rows. */
export type ClinicalScheduleSession = {
  id: number
  studentId: string
  courseCode: string
  sessionDate: string
  sessionName: string | null
  site: string | null
  faculty: string | null
  status: string
}

function isClinicalScheduleSessionRow(x: unknown): x is ClinicalScheduleSession {
  if (x == null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'number' &&
    typeof o.studentId === 'string' &&
    typeof o.courseCode === 'string' &&
    typeof o.sessionDate === 'string' &&
    (o.sessionName === null || typeof o.sessionName === 'string') &&
    (o.site === null || typeof o.site === 'string') &&
    (o.faculty === null || typeof o.faculty === 'string') &&
    typeof o.status === 'string'
  )
}

export async function fetchStudentClinicalSchedule(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<ClinicalScheduleSession[]> {
  const path = `/api/students/${encodeURIComponent(studentId)}/clinical-schedule`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected clinical schedule response')
  }
  for (const row of data) {
    if (!isClinicalScheduleSessionRow(row)) {
      throw new Error('Unexpected clinical schedule response')
    }
  }
  return data
}

/** GET /api/students/:studentId/clinical-enrollments/open */
export type StudentOpenClinicalEnrollmentSlot = {
  timetableId: number
  term: string
  year: number
  slotLabel: string
  faculty: string | null
  site: string | null
  capacity: number | null
  enrolledCount: number
  remainingSeats: number | null
  alreadyEnrolled: boolean
}

function isStudentOpenClinicalEnrollmentSlot(
  x: unknown,
): x is StudentOpenClinicalEnrollmentSlot {
  if (x == null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.timetableId === 'number' &&
    typeof o.term === 'string' &&
    typeof o.year === 'number' &&
    typeof o.slotLabel === 'string' &&
    (o.faculty === null || typeof o.faculty === 'string') &&
    (o.site === null || typeof o.site === 'string') &&
    (o.capacity === null || typeof o.capacity === 'number') &&
    typeof o.enrolledCount === 'number' &&
    (o.remainingSeats === null || typeof o.remainingSeats === 'number') &&
    typeof o.alreadyEnrolled === 'boolean'
  )
}

export async function fetchStudentOpenClinicalEnrollmentSlots(
  studentId: string,
  options?: { term?: string; year?: number; signal?: AbortSignal },
): Promise<StudentOpenClinicalEnrollmentSlot[]> {
  const params = new URLSearchParams()
  if (options?.term != null && options.term.trim() !== '') {
    params.set('term', options.term.trim())
  }
  if (options?.year != null && Number.isFinite(options.year)) {
    params.set('year', String(options.year))
  }
  const q = params.toString()
  const path =
    q.length > 0
      ? `/api/students/${encodeURIComponent(studentId)}/clinical-enrollments/open?${q}`
      : `/api/students/${encodeURIComponent(studentId)}/clinical-enrollments/open`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected open clinical enrollment slots response')
  }
  for (const row of data) {
    if (!isStudentOpenClinicalEnrollmentSlot(row)) {
      throw new Error('Unexpected open clinical enrollment slots response')
    }
  }
  return data
}

/** GET /api/students/:studentId/clinical-enrollments */
export type StudentClinicalEnrollmentRow = {
  id: number
  studentId: string
  timetableId: number
  term: string
  year: number
  status: string
  slotLabel: string
  faculty: string | null
  site: string | null
  createdAt: string
}

function isStudentClinicalEnrollmentRow(x: unknown): x is StudentClinicalEnrollmentRow {
  if (x == null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'number' &&
    typeof o.studentId === 'string' &&
    typeof o.timetableId === 'number' &&
    typeof o.term === 'string' &&
    typeof o.year === 'number' &&
    typeof o.status === 'string' &&
    typeof o.slotLabel === 'string' &&
    (o.faculty === null || typeof o.faculty === 'string') &&
    (o.site === null || typeof o.site === 'string') &&
    typeof o.createdAt === 'string'
  )
}

export async function fetchStudentClinicalEnrollments(
  studentId: string,
  options?: { term?: string; year?: number; signal?: AbortSignal },
): Promise<StudentClinicalEnrollmentRow[]> {
  const params = new URLSearchParams()
  if (options?.term != null && options.term.trim() !== '') {
    params.set('term', options.term.trim())
  }
  if (options?.year != null && Number.isFinite(options.year)) {
    params.set('year', String(options.year))
  }
  const q = params.toString()
  const path =
    q.length > 0
      ? `/api/students/${encodeURIComponent(studentId)}/clinical-enrollments?${q}`
      : `/api/students/${encodeURIComponent(studentId)}/clinical-enrollments`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected student clinical enrollments response')
  }
  for (const row of data) {
    if (!isStudentClinicalEnrollmentRow(row)) {
      throw new Error('Unexpected student clinical enrollments response')
    }
  }
  return data
}

/** POST /api/students/:studentId/clinical-enrollments — 201 { ok, enrollmentId, assignmentId } */
export async function postStudentClinicalEnrollment(
  studentId: string,
  body: { timetableId: number },
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean; enrollmentId: number; assignmentId: number }> {
  const path = `/api/students/${encodeURIComponent(studentId)}/clinical-enrollments`
  const data = (await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected clinical enrollment create response')
  }
  const o = data as Record<string, unknown>
  if (
    o.ok !== true ||
    typeof o.enrollmentId !== 'number' ||
    typeof o.assignmentId !== 'number'
  ) {
    throw new Error('Unexpected clinical enrollment create response')
  }
  return {
    ok: true,
    enrollmentId: o.enrollmentId,
    assignmentId: o.assignmentId,
  }
}

/** DELETE /api/students/:studentId/clinical-enrollments/:enrollmentId */
export async function deleteStudentClinicalEnrollment(
  studentId: string,
  enrollmentId: number,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean }> {
  const path = `/api/students/${encodeURIComponent(studentId)}/clinical-enrollments/${encodeURIComponent(String(enrollmentId))}`
  const data = (await fetchApiJson(path, {
    method: 'DELETE',
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected clinical enrollment delete response')
  }
  const o = data as Record<string, unknown>
  if (o.ok !== true) {
    throw new Error('Unexpected clinical enrollment delete response')
  }
  return { ok: true }
}

/** GET /api/admin/clinical/timetable — legacy `clinic_timetable` rows for slot assignment. */
export type AdminClinicalTimetableSlot = {
  id: number
  term: string
  year: number
  weekday: string
  startTime: string | null
  endTime: string | null
  instructor: string | null
  site: string | null
  courseCode: string | null
  slotLabel: string
}

function isAdminClinicalTimetableSlot(x: unknown): x is AdminClinicalTimetableSlot {
  if (x == null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'number' &&
    typeof o.term === 'string' &&
    typeof o.year === 'number' &&
    typeof o.weekday === 'string' &&
    (o.startTime === null || typeof o.startTime === 'string') &&
    (o.endTime === null || typeof o.endTime === 'string') &&
    (o.instructor === null || typeof o.instructor === 'string') &&
    (o.site === null || typeof o.site === 'string') &&
    (o.courseCode === null || typeof o.courseCode === 'string') &&
    typeof o.slotLabel === 'string'
  )
}

export async function fetchAdminClinicalTimetable(
  options?: { term?: string; year?: number; signal?: AbortSignal },
): Promise<AdminClinicalTimetableSlot[]> {
  const params = new URLSearchParams()
  if (options?.term != null && options.term.trim() !== '') {
    params.set('term', options.term.trim())
  }
  if (options?.year != null && Number.isFinite(options.year)) {
    params.set('year', String(options.year))
  }
  const q = params.toString()
  const path =
    q.length > 0
      ? `/api/admin/clinical/timetable?${q}`
      : '/api/admin/clinical/timetable'
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected admin clinical timetable response')
  }
  for (const row of data) {
    if (!isAdminClinicalTimetableSlot(row)) {
      throw new Error('Unexpected admin clinical timetable response')
    }
  }
  return data
}

/** Timetable-driven (preferred) or legacy manual assignment body. */
export type AdminClinicalAssignPayload =
  | { studentId: string; timetableId: number; status?: string | null }
  | {
      studentId: string
      courseCode: string
      sessionDate: string
      sessionName?: string | null
      site?: string | null
      faculty?: string | null
      status?: string | null
    }

/** POST /api/admin/clinical/assign — creates a `clinical_assignments` row. */
export async function postAdminClinicalAssign(
  body: AdminClinicalAssignPayload,
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean; id: number }> {
  const data = (await fetchApiJson('/api/admin/clinical/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected admin clinical assign response')
  }
  const o = data as Record<string, unknown>
  if (
    o.ok !== true ||
    typeof o.id !== 'number' ||
    !Number.isFinite(o.id)
  ) {
    throw new Error('Unexpected admin clinical assign response')
  }
  return { ok: true, id: o.id }
}

/** GET/POST/PATCH `/api/admin/clinical/slots` — legacy `clinic_timetable` CRUD (term via `academicTermId`). */
export type AdminClinicalSlot = {
  id: number
  academicTermId: string | null
  year: number
  term: string
  weekday: string
  timeFrom: string
  timeTo: string
  slot: string
  instructorId: string
  instructor: string
  cap100: number
  cap200: number
  cap300: number
  cap123: number
}

export type CreateAdminClinicalSlotBody = {
  academicTermId: string
  weekday: string
  timeFrom: string
  timeTo: string
  slot: string
  instructor: string
  instructorId?: string | null
  cap100?: number
  cap200?: number
  cap300?: number
  cap123?: number
}

export type UpdateAdminClinicalSlotBody = Partial<CreateAdminClinicalSlotBody>

function isAdminClinicalSlot(x: unknown): x is AdminClinicalSlot {
  if (x == null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'number' &&
    (o.academicTermId === null || typeof o.academicTermId === 'string') &&
    typeof o.year === 'number' &&
    typeof o.term === 'string' &&
    typeof o.weekday === 'string' &&
    typeof o.timeFrom === 'string' &&
    typeof o.timeTo === 'string' &&
    typeof o.slot === 'string' &&
    typeof o.instructorId === 'string' &&
    typeof o.instructor === 'string' &&
    typeof o.cap100 === 'number' &&
    typeof o.cap200 === 'number' &&
    typeof o.cap300 === 'number' &&
    typeof o.cap123 === 'number'
  )
}

export async function fetchAdminClinicalSlots(options?: {
  academicTermId?: string | null
  signal?: AbortSignal
}): Promise<AdminClinicalSlot[]> {
  const params = new URLSearchParams()
  if (
    options?.academicTermId != null &&
    String(options.academicTermId).trim() !== ''
  ) {
    params.set('academicTermId', String(options.academicTermId).trim())
  }
  const q = params.toString()
  const path =
    q.length > 0
      ? `/api/admin/clinical/slots?${q}`
      : '/api/admin/clinical/slots'
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected admin clinical slots response')
  }
  for (const row of data) {
    if (!isAdminClinicalSlot(row)) {
      throw new Error('Unexpected admin clinical slots response')
    }
  }
  return data
}

export async function createAdminClinicalSlot(
  body: CreateAdminClinicalSlotBody,
  options?: { signal?: AbortSignal },
): Promise<AdminClinicalSlot> {
  const data = (await fetchApiJson('/api/admin/clinical/slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (!isAdminClinicalSlot(data)) {
    throw new Error('Unexpected admin clinical slot create response')
  }
  return data
}

export async function updateAdminClinicalSlot(
  id: number,
  body: UpdateAdminClinicalSlotBody,
  options?: { signal?: AbortSignal },
): Promise<AdminClinicalSlot> {
  const path = `/api/admin/clinical/slots/${encodeURIComponent(String(id))}`
  const data = (await fetchApiJson(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (!isAdminClinicalSlot(data)) {
    throw new Error('Unexpected admin clinical slot update response')
  }
  return data
}

export async function deleteAdminClinicalSlot(
  id: number,
  options?: { signal?: AbortSignal },
): Promise<{ ok: true }> {
  const path = `/api/admin/clinical/slots/${encodeURIComponent(String(id))}`
  const data = (await fetchApiJson(path, {
    method: 'DELETE',
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected admin clinical slot delete response')
  }
  const o = data as Record<string, unknown>
  if (o.ok !== true) {
    throw new Error('Unexpected admin clinical slot delete response')
  }
  return { ok: true }
}

/** GET /api/students/:studentId/clinical-requests */
export type StudentClinicalRequestItem = {
  id: number
  studentId: string
  timetableId: number
  term: string
  year: number
  status: string
  slotLabel: string
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
}

function isStudentClinicalRequestItem(
  x: unknown,
): x is StudentClinicalRequestItem {
  if (x == null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'number' &&
    typeof o.studentId === 'string' &&
    typeof o.timetableId === 'number' &&
    typeof o.term === 'string' &&
    typeof o.year === 'number' &&
    typeof o.status === 'string' &&
    typeof o.slotLabel === 'string' &&
    typeof o.createdAt === 'string' &&
    (o.decidedAt === null || typeof o.decidedAt === 'string') &&
    (o.decidedBy === null || typeof o.decidedBy === 'string')
  )
}

export async function fetchStudentClinicalRequests(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<StudentClinicalRequestItem[]> {
  const path = `/api/students/${encodeURIComponent(studentId)}/clinical-requests`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected student clinical requests response')
  }
  for (const row of data) {
    if (!isStudentClinicalRequestItem(row)) {
      throw new Error('Unexpected student clinical requests response')
    }
  }
  return data
}

/** POST /api/students/:studentId/clinical-requests — 201 { ok: true, id } */
export async function postStudentClinicalRequest(
  studentId: string,
  body: { timetableId: number },
  options?: { signal?: AbortSignal },
): Promise<{ ok: boolean; id: number }> {
  const path = `/api/students/${encodeURIComponent(studentId)}/clinical-requests`
  const data = (await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected student clinical request response')
  }
  const o = data as Record<string, unknown>
  if (o.ok !== true || typeof o.id !== 'number' || !Number.isFinite(o.id)) {
    throw new Error('Unexpected student clinical request response')
  }
  return { ok: true, id: o.id }
}

/** GET /api/admin/clinical/requests — pending queue only */
export type AdminPendingClinicalRequestItem = {
  id: number
  studentId: string
  timetableId: number
  term: string
  year: number
  slotLabel: string
  createdAt: string
}

function isAdminPendingClinicalRequestItem(
  x: unknown,
): x is AdminPendingClinicalRequestItem {
  if (x == null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'number' &&
    typeof o.studentId === 'string' &&
    typeof o.timetableId === 'number' &&
    typeof o.term === 'string' &&
    typeof o.year === 'number' &&
    typeof o.slotLabel === 'string' &&
    typeof o.createdAt === 'string'
  )
}

export async function fetchAdminClinicalRequests(
  options?: { signal?: AbortSignal },
): Promise<AdminPendingClinicalRequestItem[]> {
  const data = (await fetchApiJson('/api/admin/clinical/requests', {
    signal: options?.signal,
  })) as unknown
  if (!Array.isArray(data)) {
    throw new Error('Unexpected admin clinical requests response')
  }
  for (const row of data) {
    if (!isAdminPendingClinicalRequestItem(row)) {
      throw new Error('Unexpected admin clinical requests response')
    }
  }
  return data
}

/** POST /api/admin/clinical/requests/:id/approve */
export async function postApproveClinicalRequest(
  requestId: number,
  options?: { signal?: AbortSignal; decidedBy?: string | null },
): Promise<{ ok: boolean; id: number }> {
  const path = `/api/admin/clinical/requests/${encodeURIComponent(String(requestId))}/approve`
  const body: Record<string, unknown> = {}
  if (options?.decidedBy !== undefined) {
    body.decidedBy = options.decidedBy
  }
  const data = (await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected approve clinical request response')
  }
  const o = data as Record<string, unknown>
  if (
    o.ok !== true ||
    typeof o.id !== 'number' ||
    !Number.isFinite(o.id)
  ) {
    throw new Error('Unexpected approve clinical request response')
  }
  return { ok: true, id: o.id }
}

/** POST /api/admin/clinical/requests/:id/reject */
export async function postRejectClinicalRequest(
  requestId: number,
  options?: { signal?: AbortSignal; decidedBy?: string | null },
): Promise<{ ok: boolean }> {
  const path = `/api/admin/clinical/requests/${encodeURIComponent(String(requestId))}/reject`
  const body: Record<string, unknown> = {}
  if (options?.decidedBy !== undefined) {
    body.decidedBy = options.decidedBy
  }
  const data = (await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected reject clinical request response')
  }
  const o = data as Record<string, unknown>
  if (o.ok !== true) {
    throw new Error('Unexpected reject clinical request response')
  }
  return { ok: true }
}

export type CourseFeedbackApiItem = {
  id: number
  courseCode: string
  term: string
  year: number
  q1Rating: number
  q2Rating: number
  q3Rating: number
  q4Rating: number
  q5Rating: number
  overallRating: number
  comment: string | null
  submittedAt: string
  /** Legacy responses only; optional for older API payloads. */
  rating?: number
  workloadRating?: number
  difficultyRating?: number
  comments?: string | null
}

/** GET /api/students/:studentId/course-feedback?courseCode=&term=&year= */
export async function fetchStudentCourseFeedback(
  params: {
    studentId: string
    courseCode: string
    term: string
    year: number
  },
  options?: { signal?: AbortSignal },
): Promise<CourseFeedbackApiItem | null> {
  const qs = new URLSearchParams()
  qs.set('courseCode', params.courseCode.trim())
  qs.set('term', params.term.trim())
  qs.set('year', String(params.year))

  const path = `/api/students/${encodeURIComponent(params.studentId)}/course-feedback?${qs.toString()}`
  const data = await fetchApiJson(path, { signal: options?.signal })

  if (data == null) return null
  if (typeof data !== 'object') {
    throw new Error('Unexpected student course feedback response')
  }

  const o = data as Record<string, unknown>
  if (
    typeof o.id !== 'number' ||
    typeof o.courseCode !== 'string' ||
    typeof o.term !== 'string' ||
    typeof o.year !== 'number'
  ) {
    throw new Error('Unexpected student course feedback response')
  }

  return data as CourseFeedbackApiItem
}

/** GET /api/admin/students/:studentId/course-feedback?courseCode=&term=&year= */
export async function fetchAdminCourseFeedback(
  params: {
    studentId: string
    courseCode: string
    term: string
    year: number
  },
  options?: { signal?: AbortSignal },
): Promise<CourseFeedbackApiItem | null> {
  const qs = new URLSearchParams()
  qs.set('courseCode', params.courseCode.trim())
  qs.set('term', params.term.trim())
  qs.set('year', String(params.year))

  const path = `/api/admin/students/${encodeURIComponent(params.studentId)}/course-feedback?${qs.toString()}`

  const data = await fetchApiJson(path, { signal: options?.signal })
  if (data == null) return null
  if (typeof data !== 'object') {
    throw new Error('Unexpected admin course feedback response')
  }
  const o = data as Record<string, unknown>
  if (
    typeof o.id !== 'number' ||
    typeof o.courseCode !== 'string' ||
    typeof o.term !== 'string' ||
    typeof o.year !== 'number'
  ) {
    throw new Error('Unexpected admin course feedback response')
  }
  return data as CourseFeedbackApiItem
}

export type PostCourseFeedbackBody = {
  courseCode: string
  term: string
  year: number
  q1Rating: number
  q2Rating: number
  q3Rating: number
  q4Rating: number
  q5Rating: number
  overallRating: number
  comment?: string | null
}

/** POST /api/students/:studentId/course-feedback — { ok: true } (optional id) */
export async function postStudentCourseFeedback(
  studentId: string,
  body: PostCourseFeedbackBody,
  options?: { signal?: AbortSignal },
): Promise<{ ok: true; id?: number }> {
  const path = `/api/students/${encodeURIComponent(studentId)}/course-feedback`
  const data = (await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data != null && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
    return data as { ok: true; id?: number }
  }
  throw new Error('Unexpected course feedback submit response')
}

/** GET /api/students/:studentId/transcript-preview — merged marks + clinic, English titles from courses. */
export type StudentTranscriptPreviewResponse = {
  studentId: string
  studentName: string
  availableTerms: Array<{
    term: string
    year: number
    label: string
  }>
  transcript: Array<{
    courseCode: string
    courseTitle: string
    term: string
    year: number
    grade: string | null
    numericGrade: number | null
    credits: number | null
    source: 'marks' | 'clinic'
    status?: StudentAcademicCourseStatus
    feedbackEligible?: boolean
  }>
}

export async function fetchStudentTranscriptPreview(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<StudentTranscriptPreviewResponse> {
  const path = `/api/students/${encodeURIComponent(studentId)}/transcript-preview`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected transcript preview response')
  }
  const o = data as Record<string, unknown>
  if (typeof o.studentId !== 'string' || typeof o.studentName !== 'string') {
    throw new Error('Unexpected transcript preview response')
  }
  if (!Array.isArray(o.availableTerms) || !Array.isArray(o.transcript)) {
    throw new Error('Unexpected transcript preview response')
  }
  return data as StudentTranscriptPreviewResponse
}

/** GET /api/students/:studentId/documents — portal document requirements for a term. */
export const DOCUMENT_REQUIREMENT_TYPES = [
  'ferpa',
  'titleix',
  'campus',
  'copyright_release_agreement',
] as const

export type DocumentRequirementType = (typeof DOCUMENT_REQUIREMENT_TYPES)[number]

export type DocumentRequirementStatus = 'assigned' | 'completed'

export type DocumentQuizRequirementType = Extract<
  DocumentRequirementType,
  'ferpa' | 'titleix' | 'campus'
>

export type StudentDocumentRequirement = {
  requirementType: DocumentRequirementType
  status: DocumentRequirementStatus
  isPassed: boolean
  scoreCorrect: number | null
  totalQuestions: number | null
  submittedAt: string | null
  lastReassignedAt: string | null
}

export type StudentDocumentsResponse = {
  studentId: string
  academicTermId: string
  requirements: StudentDocumentRequirement[]
}

export type SubmitDocumentAgreementResponse = {
  requirementType: 'copyright_release_agreement'
  status: 'completed'
  submittedAt: string
}

export type SubmitDocumentQuizResponse = {
  requirementType: DocumentQuizRequirementType
  scoreCorrect: number
  totalQuestions: number
  isPassed: boolean
  status: DocumentRequirementStatus
  submittedAt: string | null
  incorrectQuestionIds: string[]
}

function isDocumentRequirementType(v: string): v is DocumentRequirementType {
  return (DOCUMENT_REQUIREMENT_TYPES as readonly string[]).includes(v)
}

function parseDocumentRequirementStatus(
  v: unknown,
): DocumentRequirementStatus | null {
  if (v === 'assigned' || v === 'completed') return v
  return null
}

function parseNullableIntField(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return null
}

function parseNullableIsoTimestamp(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function parseStudentDocumentRequirement(row: unknown): StudentDocumentRequirement | null {
  if (row == null || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const rt = o.requirementType
  if (typeof rt !== 'string' || !isDocumentRequirementType(rt)) return null
  const status = parseDocumentRequirementStatus(o.status)
  if (!status) return null
  const isPassed = o.isPassed === true
  return {
    requirementType: rt,
    status,
    isPassed,
    scoreCorrect: parseNullableIntField(o.scoreCorrect),
    totalQuestions: parseNullableIntField(o.totalQuestions),
    submittedAt: parseNullableIsoTimestamp(o.submittedAt),
    lastReassignedAt: parseNullableIsoTimestamp(o.lastReassignedAt),
  }
}

function parseStudentDocumentsResponse(data: unknown): StudentDocumentsResponse {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected student documents response')
  }
  const o = data as Record<string, unknown>
  if (typeof o.studentId !== 'string' || typeof o.academicTermId !== 'string') {
    throw new Error('Unexpected student documents response')
  }
  if (!Array.isArray(o.requirements)) {
    throw new Error('Unexpected student documents response')
  }
  const requirements: StudentDocumentRequirement[] = []
  for (const row of o.requirements) {
    const req = parseStudentDocumentRequirement(row)
    if (!req) {
      throw new Error('Unexpected student documents response')
    }
    requirements.push(req)
  }
  return {
    studentId: o.studentId.trim(),
    academicTermId: o.academicTermId.trim(),
    requirements,
  }
}

function parseSubmitDocumentAgreementResponse(
  data: unknown,
): SubmitDocumentAgreementResponse {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected agreement submit response')
  }
  const o = data as Record<string, unknown>
  if (o.requirementType !== 'copyright_release_agreement') {
    throw new Error('Unexpected agreement submit response')
  }
  if (o.status !== 'completed') {
    throw new Error('Unexpected agreement submit response')
  }
  if (typeof o.submittedAt !== 'string' || o.submittedAt.trim() === '') {
    throw new Error('Unexpected agreement submit response')
  }
  return {
    requirementType: 'copyright_release_agreement',
    status: 'completed',
    submittedAt: o.submittedAt.trim(),
  }
}

function parseStringArrayField(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    if (typeof item === 'string' && item.trim() !== '') out.push(item.trim())
  }
  return out
}

function parseSubmitDocumentQuizResponse(data: unknown): SubmitDocumentQuizResponse {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected quiz submit response')
  }
  const o = data as Record<string, unknown>
  const rt = o.requirementType
  if (rt !== 'ferpa' && rt !== 'titleix' && rt !== 'campus') {
    throw new Error('Unexpected quiz submit response')
  }
  const status = parseDocumentRequirementStatus(o.status)
  if (!status) {
    throw new Error('Unexpected quiz submit response')
  }
  const scoreCorrect = parseNullableIntField(o.scoreCorrect)
  const totalQuestions = parseNullableIntField(o.totalQuestions)
  if (scoreCorrect === null || totalQuestions === null) {
    throw new Error('Unexpected quiz submit response')
  }
  if (o.isPassed !== true && o.isPassed !== false) {
    throw new Error('Unexpected quiz submit response')
  }
  const incorrectQuestionIds =
    o.isPassed === true ? [] : parseStringArrayField(o.incorrectQuestionIds)
  return {
    requirementType: rt,
    scoreCorrect,
    totalQuestions,
    isPassed: o.isPassed,
    status,
    submittedAt: parseNullableIsoTimestamp(o.submittedAt),
    incorrectQuestionIds,
  }
}

export async function fetchStudentDocuments(
  studentId: string,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<StudentDocumentsResponse> {
  const tid = academicTermId.trim()
  const qs = new URLSearchParams()
  qs.set('academicTermId', tid)
  const path = `/api/students/${encodeURIComponent(studentId.trim())}/documents?${qs.toString()}`
  const data = await fetchApiJson(path, { signal: options?.signal })
  return parseStudentDocumentsResponse(data)
}

/** POST /api/admin/students/:studentId/documents/:requirementType/reset */
export type AdminStudentDocumentRequirementResetResponse = {
  ok: true
  requirementType: DocumentRequirementType
  status: 'assigned'
}

/** POST /api/admin/students/:studentId/documents/reset-all */
export type AdminStudentDocumentsResetAllResponse = {
  ok: true
}

function parseAdminStudentDocumentRequirementResetResponse(
  data: unknown,
): AdminStudentDocumentRequirementResetResponse {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected document requirement reset response')
  }
  const o = data as Record<string, unknown>
  if (o.ok !== true || o.status !== 'assigned') {
    throw new Error('Unexpected document requirement reset response')
  }
  const rt = o.requirementType
  if (typeof rt !== 'string' || !isDocumentRequirementType(rt)) {
    throw new Error('Unexpected document requirement reset response')
  }
  return { ok: true, requirementType: rt, status: 'assigned' }
}

function parseAdminStudentDocumentsResetAllResponse(
  data: unknown,
): AdminStudentDocumentsResetAllResponse {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected document requirements reset-all response')
  }
  const o = data as Record<string, unknown>
  if (o.ok !== true) {
    throw new Error('Unexpected document requirements reset-all response')
  }
  return { ok: true }
}

/** GET /api/admin/students/:studentId/documents — same payload shape as the student-facing list. */
export async function fetchAdminStudentDocuments(
  studentId: string,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<StudentDocumentsResponse> {
  const tid = academicTermId.trim()
  const qs = new URLSearchParams()
  qs.set('academicTermId', tid)
  const path = `/api/admin/students/${encodeURIComponent(studentId.trim())}/documents?${qs.toString()}`
  const data = await fetchApiJson(path, { signal: options?.signal })
  return parseStudentDocumentsResponse(data)
}

export async function resetAdminStudentDocumentRequirement(
  studentId: string,
  requirementType: DocumentRequirementType,
  body: { academicTermId: string; reassignedBy?: string },
  options?: { signal?: AbortSignal },
): Promise<AdminStudentDocumentRequirementResetResponse> {
  const payload: { academicTermId: string; reassignedBy?: string } = {
    academicTermId: body.academicTermId.trim(),
  }
  if (body.reassignedBy != null && String(body.reassignedBy).trim() !== '') {
    payload.reassignedBy = String(body.reassignedBy).trim()
  }
  const path = `/api/admin/students/${encodeURIComponent(studentId.trim())}/documents/${encodeURIComponent(requirementType)}/reset`
  const data = await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  })
  return parseAdminStudentDocumentRequirementResetResponse(data)
}

export async function resetAllAdminStudentDocuments(
  studentId: string,
  body: { academicTermId: string; reassignedBy?: string },
  options?: { signal?: AbortSignal },
): Promise<AdminStudentDocumentsResetAllResponse> {
  const payload: { academicTermId: string; reassignedBy?: string } = {
    academicTermId: body.academicTermId.trim(),
  }
  if (body.reassignedBy != null && String(body.reassignedBy).trim() !== '') {
    payload.reassignedBy = String(body.reassignedBy).trim()
  }
  const path = `/api/admin/students/${encodeURIComponent(studentId.trim())}/documents/reset-all`
  const data = await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  })
  return parseAdminStudentDocumentsResetAllResponse(data)
}

export async function submitStudentDocumentAgreement(
  studentId: string,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<SubmitDocumentAgreementResponse> {
  const data = await fetchApiJson(
    `/api/students/${encodeURIComponent(studentId.trim())}/documents/agreement/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ academicTermId: academicTermId.trim() }),
      signal: options?.signal,
    },
  )
  return parseSubmitDocumentAgreementResponse(data)
}

export async function submitStudentDocumentQuiz(
  studentId: string,
  quizId: DocumentQuizRequirementType,
  body: { academicTermId: string; answers: Record<string, string> },
  options?: { signal?: AbortSignal },
): Promise<SubmitDocumentQuizResponse> {
  const data = await fetchApiJson(
    `/api/students/${encodeURIComponent(studentId.trim())}/documents/quizzes/${encodeURIComponent(quizId)}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        academicTermId: body.academicTermId.trim(),
        answers: body.answers,
      }),
      signal: options?.signal,
    },
  )
  return parseSubmitDocumentQuizResponse(data)
}

/** GET /api/academic-terms — full list (intended for registrar/admin tooling). */
export type AcademicTermName = 'Winter' | 'Spring' | 'Summer' | 'Fall'

export type AcademicTermStatus =
  | 'planned'
  | 'registration_open'
  | 'in_progress'
  | 'completed'

export type AcademicTerm = {
  id: string
  term_label: string
  year: number
  term_name: AcademicTermName
  quarter_index: number
  sequence_no: number
  start_date: string | null
  end_date: string | null
  registration_open: string | null
  registration_close: string | null
  /** YYYY-MM-DD when set; controls student withdraw eligibility on Add/Drop. */
  withdraw_deadline: string | null
  payment_due_date: string | null
  lock_registration_if_overdue: boolean
  status: AcademicTermStatus
  is_visible: boolean
}

const ACADEMIC_TERM_NAMES: AcademicTermName[] = [
  'Winter',
  'Spring',
  'Summer',
  'Fall',
]

const ACADEMIC_TERM_STATUSES: AcademicTermStatus[] = [
  'planned',
  'registration_open',
  'in_progress',
  'completed',
]

function parseAcademicTermBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (v === 0 || v === 1) return v === 1
  if (typeof v === 'bigint') return v !== 0n
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  }
  return false
}

function parseNullableIsoDate(v: unknown): string | null {
  if (v == null) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s === '') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

function parseAcademicTermId(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const s = v.trim()
    return s === '' ? null : s
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return String(Math.trunc(v))
  }
  if (typeof v === 'bigint') return String(v)
  return null
}

function parseAcademicTermRow(row: Record<string, unknown>): AcademicTerm | null {
  const id = parseAcademicTermId(row.id)
  if (id == null || typeof row.term_label !== 'string') return null
  const term_name = row.term_name
  if (
    typeof term_name !== 'string' ||
    !ACADEMIC_TERM_NAMES.includes(term_name as AcademicTermName)
  ) {
    return null
  }
  const status = row.status
  if (
    typeof status !== 'string' ||
    !ACADEMIC_TERM_STATUSES.includes(status as AcademicTermStatus)
  ) {
    return null
  }
  const year = typeof row.year === 'number' ? row.year : Number(row.year)
  const quarter_index =
    typeof row.quarter_index === 'number'
      ? row.quarter_index
      : Number(row.quarter_index)
  const sequence_no =
    typeof row.sequence_no === 'number'
      ? row.sequence_no
      : Number(row.sequence_no)
  if (!Number.isFinite(year) || !Number.isFinite(quarter_index) || !Number.isFinite(sequence_no)) {
    return null
  }
  return {
    id,
    term_label: row.term_label.trim(),
    year: Math.trunc(year),
    term_name: term_name as AcademicTermName,
    quarter_index: Math.trunc(quarter_index),
    sequence_no: Math.trunc(sequence_no),
    start_date: parseNullableIsoDate(row.start_date),
    end_date: parseNullableIsoDate(row.end_date),
    registration_open: parseNullableIsoDate(row.registration_open),
    registration_close: parseNullableIsoDate(row.registration_close),
    withdraw_deadline: parseNullableIsoDate(
      row.withdraw_deadline !== undefined ? row.withdraw_deadline : null,
    ),
    payment_due_date: parseNullableIsoDate(
      row.payment_due_date !== undefined ? row.payment_due_date : null,
    ),
    lock_registration_if_overdue:
      row.lock_registration_if_overdue !== undefined
        ? parseAcademicTermBool(row.lock_registration_if_overdue)
        : false,
    status: status as AcademicTermStatus,
    is_visible: parseAcademicTermBool(row.is_visible),
  }
}

function parseAcademicTermList(data: unknown): AcademicTerm[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected academic terms response')
  }
  const out: AcademicTerm[] = []
  for (const row of data) {
    if (row == null || typeof row !== 'object') {
      throw new Error('Unexpected academic terms response')
    }
    const term = parseAcademicTermRow(row as Record<string, unknown>)
    if (!term) {
      throw new Error('Unexpected academic terms response')
    }
    out.push(term)
  }
  return out
}

export async function fetchAcademicTerms(options?: {
  signal?: AbortSignal
}): Promise<AcademicTerm[]> {
  const data = (await fetchApiJson('/api/academic-terms', {
    signal: options?.signal,
  })) as unknown
  return parseAcademicTermList(data)
}

export async function fetchRecentAcademicTerms(
  limit = 3,
  options?: { signal?: AbortSignal },
): Promise<AcademicTerm[]> {
  const n = Math.trunc(limit)
  const qs =
    Number.isInteger(n) && n > 0 ? `?limit=${encodeURIComponent(String(n))}` : ''
  const data = (await fetchApiJson(`/api/academic-terms/recent${qs}`, {
    signal: options?.signal,
  })) as unknown
  return parseAcademicTermList(data)
}

/** GET /api/academic-terms/current — `null` when no term has status `registration_open`. */
export async function fetchCurrentAcademicTerm(options?: {
  signal?: AbortSignal
}): Promise<AcademicTerm | null> {
  const data = (await fetchApiJson('/api/academic-terms/current', {
    signal: options?.signal,
  })) as unknown
  if (data === null) return null
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected current academic term response')
  }
  const term = parseAcademicTermRow(data as Record<string, unknown>)
  if (!term) {
    throw new Error('Unexpected current academic term response')
  }
  return term
}

/** Registration module URL query key for academic term id (see `RegistrationLayout`). */
export const REGISTRATION_TERM_QUERY_KEY = 'term'

/** Read trimmed academic term id from router search params, or `null` if absent. */
export function readRegistrationTermIdFromSearch(
  searchParams: URLSearchParams,
): string | null {
  const v = searchParams.get(REGISTRATION_TERM_QUERY_KEY)
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export type CreateAcademicTermBody = {
  year: number
  term_name: AcademicTermName
  sequence_no: number
  term_label?: string
  start_date?: string | null
  end_date?: string | null
  registration_open?: string | null
  registration_close?: string | null
  withdraw_deadline?: string | null
  payment_due_date?: string | null
  lock_registration_if_overdue?: boolean
  status: AcademicTermStatus
  is_visible?: boolean
}

export type UpdateAcademicTermBody = Partial<CreateAcademicTermBody>

export async function createAcademicTerm(
  body: CreateAcademicTermBody,
  options?: { signal?: AbortSignal },
): Promise<AcademicTerm> {
  const data = (await fetchApiJson('/api/admin/academic-terms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected create academic term response')
  }
  const term = parseAcademicTermRow(data as Record<string, unknown>)
  if (!term) {
    throw new Error('Unexpected create academic term response')
  }
  return term
}

export async function updateAcademicTerm(
  id: string,
  body: UpdateAcademicTermBody,
  options?: { signal?: AbortSignal },
): Promise<AcademicTerm> {
  const path = `/api/admin/academic-terms/${encodeURIComponent(id)}`
  const data = (await fetchApiJson(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected update academic term response')
  }
  const term = parseAcademicTermRow(data as Record<string, unknown>)
  if (!term) {
    throw new Error('Unexpected update academic term response')
  }
  return term
}

/** GET /api/courses — catalog rows for admin scheduling pickers. */
export type CourseCatalogItem = {
  code: string
  eng_name: string | null
  chi_name: string | null
  units: number | string | null
  /** Present when the `courses` table exposes a category column. */
  category?: string | null
}

function parseCourseCatalogList(data: unknown): CourseCatalogItem[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected courses response')
  }
  const out: CourseCatalogItem[] = []
  for (const row of data) {
    if (row == null || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    if (typeof o.code !== 'string' || o.code.trim() === '') continue
    const eng = o.eng_name
    const chi = o.chi_name
    const cat = o.category
    const item: CourseCatalogItem = {
      code: o.code.trim(),
      eng_name: typeof eng === 'string' ? eng : null,
      chi_name: typeof chi === 'string' ? chi : null,
      units: o.units as number | string | null,
    }
    if (typeof cat === 'string' && cat.trim() !== '') {
      item.category = cat.trim()
    } else if (cat != null && String(cat).trim() !== '') {
      item.category = String(cat).trim()
    }
    out.push(item)
  }
  return out
}

/** GET /api/admin/courses/open-for-registration?termId= — course-level rows for a term. */
export type OpenRegistrationCourseRow = {
  courseCode: string
  courseTitle: string
  credits: number
  category: string
  termId: string
  termLabel: string
  openSections: number
  enrolledCount: number
  enrolledStudents?: Array<{
    student_external_id: string
    full_name: string | null
  }>
  registrationStatus: 'Open' | 'Closed'
}

function parseOpenRegistrationCourseRow(
  row: Record<string, unknown>,
): OpenRegistrationCourseRow | null {
  const courseCode = row.courseCode ?? row.course_code
  const courseTitle = row.courseTitle ?? row.course_title
  const termId = row.termId ?? row.term_id
  const termLabel = row.termLabel ?? row.term_label
  const openSections = row.openSections ?? row.open_sections
  const registrationStatus = row.registrationStatus ?? row.registration_status
  if (typeof courseCode !== 'string' || courseCode.trim() === '') return null
  if (typeof courseTitle !== 'string') return null
  if (typeof termId !== 'string' || termId.trim() === '') return null
  if (typeof termLabel !== 'string') return null
  const creditsRaw = row.credits
  const credits =
    typeof creditsRaw === 'number'
      ? creditsRaw
      : typeof creditsRaw === 'string'
        ? Number(creditsRaw)
        : NaN
  if (!Number.isFinite(credits)) return null
  const category =
    typeof row.category === 'string' && row.category.trim() !== ''
      ? row.category.trim()
      : '—'
  const os =
    typeof openSections === 'number'
      ? openSections
      : typeof openSections === 'string'
        ? Number(openSections)
        : NaN
  if (!Number.isInteger(os) || os < 0) return null
  if (registrationStatus !== 'Open' && registrationStatus !== 'Closed') return null
  const enrolledCountRaw = row.enrolledCount ?? row.enrolled_count
  let enrolledCount = 0
  if (typeof enrolledCountRaw === 'number' && Number.isFinite(enrolledCountRaw)) {
    enrolledCount = Math.max(0, Math.trunc(enrolledCountRaw))
  } else if (typeof enrolledCountRaw === 'string') {
    const n = Number(enrolledCountRaw.trim())
    if (Number.isFinite(n)) enrolledCount = Math.max(0, Math.trunc(n))
  }
  const esRaw = row.enrolledStudents ?? row.enrolled_students
  let enrolledStudents: OpenRegistrationCourseRow['enrolledStudents']
  if (Array.isArray(esRaw)) {
    const list: NonNullable<OpenRegistrationCourseRow['enrolledStudents']> = []
    for (const el of esRaw) {
      if (el == null || typeof el !== 'object') continue
      const o = el as Record<string, unknown>
      const sid = o.student_external_id ?? o.studentExternalId
      if (typeof sid !== 'string' || sid.trim() === '') continue
      const fn = o.full_name ?? o.fullName
      list.push({
        student_external_id: sid.trim(),
        full_name:
          fn == null || String(fn).trim() === '' ? null : String(fn).trim(),
      })
    }
    list.sort((a, b) =>
      a.student_external_id.localeCompare(b.student_external_id, undefined, {
        sensitivity: 'base',
      }),
    )
    if (list.length > 0) enrolledStudents = list
  }
  return {
    courseCode: courseCode.trim(),
    courseTitle: courseTitle.trim(),
    credits,
    category,
    termId: termId.trim(),
    termLabel: termLabel.trim(),
    openSections: os,
    enrolledCount,
    ...(enrolledStudents != null ? { enrolledStudents } : {}),
    registrationStatus,
  }
}

function parseOpenRegistrationCourseList(data: unknown): OpenRegistrationCourseRow[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected open-registration courses response')
  }
  const out: OpenRegistrationCourseRow[] = []
  for (const el of data) {
    if (el == null || typeof el !== 'object') {
      throw new Error('Unexpected open-registration courses response')
    }
    const row = parseOpenRegistrationCourseRow(el as Record<string, unknown>)
    if (!row) {
      throw new Error('Unexpected open-registration courses response')
    }
    out.push(row)
  }
  return out
}

export async function fetchAdminCoursesOpenForRegistration(params: {
  termId: string
  signal?: AbortSignal
}): Promise<OpenRegistrationCourseRow[]> {
  const id = params.termId.trim()
  const qs = new URLSearchParams()
  qs.set('termId', id)
  const data = (await fetchApiJson(
    `/api/admin/courses/open-for-registration?${qs.toString()}`,
    { signal: params.signal },
  )) as unknown
  return parseOpenRegistrationCourseList(data)
}

export async function fetchCourses(options?: {
  signal?: AbortSignal
}): Promise<CourseCatalogItem[]> {
  const data = (await fetchApiJson('/api/courses', {
    signal: options?.signal,
  })) as unknown
  return parseCourseCatalogList(data)
}

/** One row from `course_sections` (admin + student section APIs). */
export type AdminCourseSection = {
  id: number
  course_code: string
  /** `portal_courses.title` when returned by enrolled-sections; otherwise null. */
  course_title: string | null
  term: string
  year: number
  section_code: string
  /** Offered timetable group (English vs Chinese scheduling), not student identity. */
  schedule_track: 'EN' | 'CN'
  weekday: string
  start_time: string | null
  end_time: string | null
  delivery_mode: string | null
  room: string | null
  instructor: string | null
  notes: string | null
  /** Distinct students in `portal_enrollments` for this course + term/year. */
  enrolled_count: number
  enrolled_students?: Array<{
    student_external_id: string
    full_name: string | null
  }>
}

function parseNullableStringField(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  return String(v)
}

function parseAdminCourseSectionRow(
  row: Record<string, unknown>,
): AdminCourseSection | null {
  const idRaw = row.id
  const id =
    typeof idRaw === 'number'
      ? idRaw
      : typeof idRaw === 'string'
        ? Number(idRaw)
        : NaN
  if (!Number.isInteger(id) || id <= 0) return null
  const course_code = row.course_code
  const term = row.term
  const yearRaw = row.year
  const section_code = row.section_code
  const weekday = row.weekday
  if (
    typeof course_code !== 'string' ||
    typeof term !== 'string' ||
    typeof section_code !== 'string' ||
    typeof weekday !== 'string'
  ) {
    return null
  }
  const year =
    typeof yearRaw === 'number' ? yearRaw : Number(yearRaw)
  if (!Number.isFinite(year)) return null
  const stRaw = row.schedule_track ?? row.scheduleTrack
  const schedule_track = normalizeScheduleTrackValue(stRaw)
  const ecRaw = row.enrolled_count ?? row.enrolledCount
  let enrolled_count = 0
  if (typeof ecRaw === 'number' && Number.isFinite(ecRaw)) {
    enrolled_count = Math.trunc(ecRaw)
  } else if (typeof ecRaw === 'string' && ecRaw.trim() !== '') {
    const n = Number(ecRaw)
    if (Number.isFinite(n)) enrolled_count = Math.trunc(n)
  }
  const esRaw = row.enrolled_students ?? row.enrolledStudents
  let enrolled_students: AdminCourseSection['enrolled_students']
  if (Array.isArray(esRaw)) {
    const list: NonNullable<AdminCourseSection['enrolled_students']> = []
    for (const el of esRaw) {
      if (el == null || typeof el !== 'object') continue
      const r = el as Record<string, unknown>
      const sid = r.student_external_id ?? r.studentExternalId
      if (typeof sid !== 'string' || sid.trim() === '') continue
      const fn = r.full_name ?? r.fullName
      list.push({
        student_external_id: sid.trim(),
        full_name:
          fn == null || String(fn).trim() === '' ? null : String(fn).trim(),
      })
    }
    if (list.length > 0) enrolled_students = list
  }
  const ctRaw = row.course_title ?? row.courseTitle
  const course_title =
    ctRaw == null || String(ctRaw).trim() === ''
      ? null
      : String(ctRaw).trim()
  return {
    id,
    course_code: course_code.trim(),
    course_title,
    term: term.trim(),
    year: Math.trunc(year),
    section_code: section_code.trim(),
    schedule_track,
    weekday: weekday.trim(),
    start_time: parseNullableStringField(row.start_time),
    end_time: parseNullableStringField(row.end_time),
    delivery_mode: parseNullableStringField(row.delivery_mode),
    room: parseNullableStringField(row.room),
    instructor: parseNullableStringField(row.instructor),
    notes: parseNullableStringField(row.notes),
    enrolled_count,
    ...(enrolled_students != null ? { enrolled_students } : {}),
  }
}

function parseAdminCourseSectionList(data: unknown): AdminCourseSection[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected course sections response')
  }
  const out: AdminCourseSection[] = []
  for (const el of data) {
    if (el == null || typeof el !== 'object') {
      throw new Error('Unexpected course sections response')
    }
    const row = parseAdminCourseSectionRow(el as Record<string, unknown>)
    if (!row) {
      throw new Error('Unexpected course sections response')
    }
    out.push(row)
  }
  return out
}

export type StudentEnrolledSectionsScheduleMeta = {
  activePortalEnrollmentCount: number
  matchedSectionCount: number
  scheduleQueryFailed?: boolean
}

function parseStudentEnrolledSectionsScheduleMeta(
  raw: unknown,
): StudentEnrolledSectionsScheduleMeta {
  if (raw == null || typeof raw !== 'object') {
    return {
      activePortalEnrollmentCount: 0,
      matchedSectionCount: 0,
      scheduleQueryFailed: false,
    }
  }
  const o = raw as Record<string, unknown>
  const activePortalEnrollmentCount = Math.trunc(
    Number(o.activePortalEnrollmentCount ?? 0),
  )
  const matchedSectionCount = Math.trunc(Number(o.matchedSectionCount ?? 0))
  const scheduleQueryFailed = o.scheduleQueryFailed === true
  return {
    activePortalEnrollmentCount: Number.isFinite(activePortalEnrollmentCount)
      ? activePortalEnrollmentCount
      : 0,
    matchedSectionCount: Number.isFinite(matchedSectionCount)
      ? matchedSectionCount
      : 0,
    ...(scheduleQueryFailed ? { scheduleQueryFailed: true } : {}),
  }
}

/** Normalizes GET /api/student/enrolled-sections (object with `sections` + `scheduleMeta`) or legacy array-only body. */
function parseStudentEnrolledSectionsResponse(data: unknown): {
  sections: AdminCourseSection[]
  scheduleMeta: StudentEnrolledSectionsScheduleMeta
} {
  if (Array.isArray(data)) {
    const sections = parseAdminCourseSectionList(data)
    return {
      sections,
      scheduleMeta: {
        activePortalEnrollmentCount: sections.length,
        matchedSectionCount: sections.length,
      },
    }
  }
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected enrolled-sections response')
  }
  const o = data as Record<string, unknown>
  const sectionsRaw = o.sections
  if (!Array.isArray(sectionsRaw)) {
    throw new Error('Unexpected enrolled-sections response')
  }
  return {
    sections: parseAdminCourseSectionList(sectionsRaw),
    scheduleMeta: parseStudentEnrolledSectionsScheduleMeta(o.scheduleMeta),
  }
}

export type PostStudentEnrollBody = {
  studentId: string
  academic_term_id: string
  sections: Array<{
    course_code: string
    section_code: string
    /** Required when the same section_code exists on both EN and CN timetables. */
    schedule_track?: 'EN' | 'CN'
  }>
}

export type PostStudentEnrollResponse = {
  success: true
  insertedCount: number
}

/** POST /api/student/enroll — inserts `portal_enrollments` for the term (course-level; deduped). */
export async function postStudentEnroll(
  body: PostStudentEnrollBody,
  options?: { signal?: AbortSignal },
): Promise<PostStudentEnrollResponse> {
  try {
    const data = (await fetchApiJson('/api/student/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    })) as unknown
    if (
      data != null &&
      typeof data === 'object' &&
      (data as { success?: unknown }).success === true &&
      typeof (data as { insertedCount?: unknown }).insertedCount === 'number'
    ) {
      return data as PostStudentEnrollResponse
    }
    throw new Error('Unexpected enroll response')
  } catch (e) {
    if (e instanceof Error) {
      const cleaned = e.message.replace(/\s*\(HTTP \d+\)\s*$/, '').trim()
      if (cleaned !== e.message) {
        throw new Error(cleaned)
      }
    }
    throw e
  }
}

/** GET /api/student/enrolled-sections — section rows + meta (active portal enrollment count vs matched timetable rows). */
export async function fetchStudentEnrolledSections(
  studentId: string,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<{
  sections: AdminCourseSection[]
  scheduleMeta: StudentEnrolledSectionsScheduleMeta
}> {
  const qs = new URLSearchParams()
  qs.set('studentId', studentId.trim())
  qs.set('academic_term_id', academicTermId.trim())
  const data = (await fetchApiJson(
    `/api/student/enrolled-sections?${qs.toString()}`,
    { signal: options?.signal },
  )) as unknown
  return parseStudentEnrolledSectionsResponse(data)
}

/** POST /api/student/withdraw — soft-withdraws one didactic portal enrollment for the term. */
export async function postStudentWithdraw(
  body: {
    studentId: string
    academic_term_id: string
    course_code: string
  },
  options?: { signal?: AbortSignal },
): Promise<{ success: boolean; removedCount: number }> {
  try {
    const data = (await fetchApiJson('/api/student/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: body.studentId.trim(),
        academic_term_id: body.academic_term_id.trim(),
        course_code: body.course_code.trim(),
      }),
      signal: options?.signal,
    })) as unknown
    if (
      data != null &&
      typeof data === 'object' &&
      typeof (data as { success?: unknown }).success === 'boolean' &&
      typeof (data as { removedCount?: unknown }).removedCount === 'number'
    ) {
      return data as { success: boolean; removedCount: number }
    }
    throw new Error('Unexpected withdraw response')
  } catch (e) {
    if (e instanceof Error) {
      const cleaned = e.message.replace(/\s*\(HTTP \d+\)\s*$/, '').trim()
      if (cleaned !== e.message) {
        throw new Error(cleaned)
      }
    }
    throw e
  }
}

export async function fetchAdminCourseSections(params: {
  academicTermId: string
  /** When omitted, returns all sections for the term (e.g. timetable). */
  courseCode?: string
  signal?: AbortSignal
}): Promise<AdminCourseSection[]> {
  const qs = new URLSearchParams()
  qs.set('academic_term_id', params.academicTermId.trim())
  const code = params.courseCode?.trim() ?? ''
  if (code !== '') qs.set('course_code', code)
  const data = (await fetchApiJson(
    `/api/admin/course-sections?${qs.toString()}`,
    { signal: params.signal },
  )) as unknown
  return parseAdminCourseSectionList(data)
}

/** GET /api/admin/course-sections/enrollments — portal roster (all statuses) for View students modal. */
export type AdminCourseSectionEnrollmentRow = {
  studentId: string
  name: string | null
  status: string
  grade: string | null
}

function parseAdminCourseSectionEnrollmentList(
  data: unknown,
): AdminCourseSectionEnrollmentRow[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected section enrollments response')
  }
  const out: AdminCourseSectionEnrollmentRow[] = []
  for (const el of data) {
    if (el == null || typeof el !== 'object') continue
    const r = el as Record<string, unknown>
    const sid = r.studentId ?? r.student_id
    if (typeof sid !== 'string' || sid.trim() === '') continue
    const nameRaw = r.name
    const statusRaw = r.status
    const gradeRaw = r.grade
    out.push({
      studentId: sid.trim(),
      name:
        nameRaw == null || String(nameRaw).trim() === ''
          ? null
          : String(nameRaw).trim(),
      status:
        typeof statusRaw === 'string' && statusRaw.trim() !== ''
          ? statusRaw.trim()
          : 'unknown',
      grade:
        gradeRaw == null || String(gradeRaw).trim() === ''
          ? null
          : String(gradeRaw).trim(),
    })
  }
  return out
}

export async function fetchAdminCourseSectionEnrollments(params: {
  academicTermId: string
  courseCode: string
  signal?: AbortSignal
}): Promise<AdminCourseSectionEnrollmentRow[]> {
  const qs = new URLSearchParams()
  qs.set('academic_term_id', params.academicTermId.trim())
  qs.set('course_code', params.courseCode.trim())
  const data = (await fetchApiJson(
    `/api/admin/course-sections/enrollments?${qs.toString()}`,
    { signal: params.signal },
  )) as unknown
  return parseAdminCourseSectionEnrollmentList(data)
}

export type AdminCourseSectionCreatePayload = {
  academic_term_id: string
  course_code: string
  section_code: string
  schedule_track?: 'EN' | 'CN'
  weekday: string
  start_time?: string | null
  end_time?: string | null
  delivery_mode?: string | null
  room?: string | null
  instructor?: string | null
  notes?: string | null
}

export type AdminCourseSectionUpdatePayload = {
  academic_term_id: string
} & Partial<
  Omit<AdminCourseSectionCreatePayload, 'academic_term_id'>
>

function parseAdminCourseSectionPayload(data: unknown): AdminCourseSection {
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected course section response')
  }
  const row = parseAdminCourseSectionRow(data as Record<string, unknown>)
  if (!row) {
    throw new Error('Unexpected course section response')
  }
  return row
}

export async function createAdminCourseSection(
  body: AdminCourseSectionCreatePayload,
  options?: { signal?: AbortSignal },
): Promise<AdminCourseSection> {
  const data = (await fetchApiJson('/api/admin/course-sections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  return parseAdminCourseSectionPayload(data)
}

export async function updateAdminCourseSection(
  sectionId: number,
  body: AdminCourseSectionUpdatePayload,
  options?: { signal?: AbortSignal },
): Promise<AdminCourseSection> {
  const path = `/api/admin/course-sections/${encodeURIComponent(String(sectionId))}`
  const data = (await fetchApiJson(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  return parseAdminCourseSectionPayload(data)
}

/**
 * DELETE /api/admin/course-sections/:id — 204 No Content (not JSON).
 */
export async function deleteAdminCourseSection(
  sectionId: number,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const path = `/api/admin/course-sections/${encodeURIComponent(String(sectionId))}`
  const res = await apiFetch(path, {
    method: 'DELETE',
    signal: options?.signal,
  })
  if (res.ok && res.status === 204) return

  const text = await res.text()
  const ct = (res.headers.get('content-type') ?? '').toLowerCase()
  if (ct.includes('application/json') && text.trim() !== '') {
    try {
      const body = JSON.parse(text) as {
        error?: string
        message?: string
      }
      const msg =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.error === 'string' && body.error) ||
        `Request failed (HTTP ${res.status})`
      throw new Error(msg)
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`Request failed (HTTP ${res.status})`)
      }
      throw e
    }
  }
  throw new Error(`Request failed (HTTP ${res.status})`)
}

export type AdminPortalEnrollmentDeleteResponse = {
  success: boolean
  removedCount: number
}

/**
 * POST /api/admin/marks/set-grade — writes legacy `marks` only (grade / grade2); never portal_enrollments.
 */
export async function postAdminMarksSetGrade(params: {
  studentId: string
  courseCode: string
  /** Portal `academic_terms.id` (same as roster URL `term` query). */
  term: string
  grade: string
  numeric: number | null
  signal?: AbortSignal
}): Promise<{ ok: boolean }> {
  const data = (await fetchApiJson('/api/admin/marks/set-grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: params.studentId.trim(),
      courseCode: params.courseCode.trim(),
      term: params.term.trim(),
      grade: params.grade.trim(),
      numeric: params.numeric,
    }),
    signal: params.signal,
  })) as unknown
  if (
    data == null ||
    typeof data !== 'object' ||
    typeof (data as { ok?: unknown }).ok !== 'boolean'
  ) {
    throw new Error('Unexpected admin marks set-grade response')
  }
  return data as { ok: boolean }
}

/**
 * DELETE /api/admin/enrollments — removes one `portal_enrollments` row (course-level; not legacy marks).
 */
export async function deleteAdminPortalEnrollment(params: {
  studentId: string
  academic_term_id: string
  course_code: string
  signal?: AbortSignal
}): Promise<AdminPortalEnrollmentDeleteResponse> {
  const data = (await fetchApiJson('/api/admin/enrollments', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: params.studentId.trim(),
      academic_term_id: params.academic_term_id.trim(),
      course_code: params.course_code.trim(),
    }),
    signal: params.signal,
  })) as unknown
  if (
    data == null ||
    typeof data !== 'object' ||
    typeof (data as { success?: unknown }).success !== 'boolean' ||
    typeof (data as { removedCount?: unknown }).removedCount !== 'number'
  ) {
    throw new Error('Unexpected admin enrollment delete response')
  }
  return data as AdminPortalEnrollmentDeleteResponse
}

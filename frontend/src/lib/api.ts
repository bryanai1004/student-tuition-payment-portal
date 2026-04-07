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
  console.debug('[account-debug] fetchStudentAccount', buildApiUrl(path))
  return fetchApiJson(path, { signal })
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
    ...(registrationHistory != null ? { registrationHistory } : {}),
  }
}

export async function fetchAdminStudents(options?: {
  signal?: AbortSignal
}): Promise<AdminStudentListItem[]> {
  const data = (await fetchApiJson('/api/admin/students', {
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected admin students response')
  }
  const raw = (data as { students?: unknown }).students
  if (!Array.isArray(raw)) {
    throw new Error('Unexpected admin students response')
  }
  const students: AdminStudentListItem[] = []
  for (const row of raw) {
    if (row == null || typeof row !== 'object') {
      throw new Error('Unexpected admin students response')
    }
    students.push(parseAdminStudentListRow(row as Record<string, unknown>))
  }
  return students
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

export type AccountingLedgerRow = {
  date: string
  type: string
  code: string
  memo: string
  debit: number
  credit: number
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

/** GET /api/admin/finance/students — lightweight roster; balance filled when ledger is opened. */
export type AdminFinanceStudentRow = {
  studentId: string
  name: string
  balance: number | null
}

function parseAdminFinanceStudentRow(
  o: Record<string, unknown>,
): AdminFinanceStudentRow {
  if (typeof o.studentId !== 'string' || typeof o.name !== 'string') {
    throw new Error('Unexpected admin finance students response')
  }
  const bal = o.balance
  let balance: number | null
  if (bal === null || bal === undefined) {
    balance = null
  } else if (typeof bal === 'number' && Number.isFinite(bal)) {
    balance = bal
  } else if (typeof bal === 'string') {
    const n = Number(bal)
    balance = Number.isFinite(n) ? n : null
  } else {
    balance = null
  }
  return { studentId: o.studentId, name: o.name, balance }
}

export async function fetchAdminFinanceStudents(options?: {
  signal?: AbortSignal
}): Promise<AdminFinanceStudentRow[]> {
  const data = (await fetchApiJson('/api/admin/finance/students', {
    signal: options?.signal,
  })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected admin finance students response')
  }
  const raw = (data as { students?: unknown }).students
  if (!Array.isArray(raw)) {
    throw new Error('Unexpected admin finance students response')
  }
  const students: AdminFinanceStudentRow[] = []
  for (const row of raw) {
    if (row == null || typeof row !== 'object') {
      throw new Error('Unexpected admin finance students response')
    }
    students.push(parseAdminFinanceStudentRow(row as Record<string, unknown>))
  }
  return students
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

export type CourseFeedbackApiItem = {
  id: number
  courseCode: string
  term: string
  year: number
  rating: number
  workloadRating: number
  difficultyRating: number
  comments: string | null
  submittedAt: string
}

export type CourseFeedbackListResponse = {
  studentId: string
  items: CourseFeedbackApiItem[]
}

/** GET /api/students/:studentId/course-feedback */
export async function fetchStudentCourseFeedback(
  studentId: string,
  options?: { signal?: AbortSignal },
): Promise<CourseFeedbackListResponse> {
  const path = `/api/students/${encodeURIComponent(studentId)}/course-feedback`
  const data = (await fetchApiJson(path, { signal: options?.signal })) as unknown
  if (data == null || typeof data !== 'object') {
    throw new Error('Unexpected course feedback response')
  }
  const o = data as Record<string, unknown>
  if (typeof o.studentId !== 'string' || !Array.isArray(o.items)) {
    throw new Error('Unexpected course feedback response')
  }
  return data as CourseFeedbackListResponse
}

export type PostCourseFeedbackBody = {
  courseCode: string
  term: string
  year: number
  rating: number
  workloadRating: number
  difficultyRating: number
  comments?: string | null
}

/** POST /api/students/:studentId/course-feedback — 201 { id, ok: true } */
export async function postStudentCourseFeedback(
  studentId: string,
  body: PostCourseFeedbackBody,
  options?: { signal?: AbortSignal },
): Promise<{ id: number; ok: boolean }> {
  const path = `/api/students/${encodeURIComponent(studentId)}/course-feedback`
  const data = (await fetchApiJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  })) as unknown
  if (
    data != null &&
    typeof data === 'object' &&
    typeof (data as { id?: unknown }).id === 'number' &&
    (data as { ok?: unknown }).ok === true
  ) {
    return data as { id: number; ok: boolean }
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

function parseAcademicTermRow(row: Record<string, unknown>): AcademicTerm | null {
  if (typeof row.id !== 'string' || typeof row.term_label !== 'string') return null
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
    id: row.id.trim(),
    term_label: row.term_label.trim(),
    year: Math.trunc(year),
    term_name: term_name as AcademicTermName,
    quarter_index: Math.trunc(quarter_index),
    sequence_no: Math.trunc(sequence_no),
    start_date: parseNullableIsoDate(row.start_date),
    end_date: parseNullableIsoDate(row.end_date),
    registration_open: parseNullableIsoDate(row.registration_open),
    registration_close: parseNullableIsoDate(row.registration_close),
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
  term: string
  year: number
  section_code: string
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
  return {
    id,
    course_code: course_code.trim(),
    term: term.trim(),
    year: Math.trunc(year),
    section_code: section_code.trim(),
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

export type PostStudentEnrollBody = {
  studentId: string
  academic_term_id: string
  sections: Array<{ course_code: string; section_code: string }>
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
}

/** GET /api/student/enrolled-sections — section rows derived from portal enrollments for the term. */
export async function fetchStudentEnrolledSections(
  studentId: string,
  academicTermId: string,
  options?: { signal?: AbortSignal },
): Promise<AdminCourseSection[]> {
  const qs = new URLSearchParams()
  qs.set('studentId', studentId.trim())
  qs.set('academic_term_id', academicTermId.trim())
  const data = (await fetchApiJson(
    `/api/student/enrolled-sections?${qs.toString()}`,
    { signal: options?.signal },
  )) as unknown
  return parseAdminCourseSectionList(data)
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

export type AdminCourseSectionCreatePayload = {
  academic_term_id: string
  course_code: string
  section_code: string
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

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
  source: 'marks' | 'clinic'
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

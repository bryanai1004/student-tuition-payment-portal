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

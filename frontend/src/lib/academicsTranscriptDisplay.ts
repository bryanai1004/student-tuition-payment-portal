import type { StudentAcademicsResponse } from './api'

export type TranscriptRow = StudentAcademicsResponse['transcript'][number]

const MIN_MEANINGFUL_YEAR = 1900
const MAX_MEANINGFUL_YEAR = 2100

function strOpt(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

/** Safe key for select value: tab cannot appear in normalized academic terms from DB. */
export function termYearKey(term: string, year: number): string {
  return `${term.trim().replace(/\t/g, ' ')}\t${year}`
}

export function isValidTranscriptTermYear(term: string, year: number): boolean {
  const t = term.trim().replace(/\t/g, ' ')
  if (t.length === 0) return false
  if (t === '0') return false
  if (!Number.isFinite(year) || Math.floor(year) !== year) return false
  if (year < MIN_MEANINGFUL_YEAR || year > MAX_MEANINGFUL_YEAR) return false
  const label = `${t} ${year}`.trim()
  if (label === '0' || /^0+$/.test(label.replace(/\s/g, ''))) return false
  return true
}

function termsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function termRank(term: string): number {
  const t = term.trim().toLowerCase()
  if (t === 'fall') return 4
  if (t === 'summer') return 3
  if (t === 'spring') return 2
  if (t === 'winter') return 1
  return 0
}

export function compareTermGroups(
  a: { year: number; term: string },
  b: { year: number; term: string },
): number {
  if (a.year !== b.year) return b.year - a.year
  return termRank(b.term) - termRank(a.term)
}

/**
 * Groups transcript rows by term/year using only rows with valid term/year.
 * Canonical term string is the first seen trimmed term for that bucket (stable casing).
 */
export function groupTranscriptByTermYear(
  transcript: TranscriptRow[],
): Array<{ year: number; term: string; rows: TranscriptRow[] }> {
  type Bucket = { year: number; term: string; rows: TranscriptRow[] }
  const map = new Map<string, Bucket>()
  const order: string[] = []

  for (const row of transcript) {
    const trimmed = row.term.trim().replace(/\t/g, ' ')
    const year = row.year
    if (!isValidTranscriptTermYear(trimmed, year)) continue

    const matchKey = `${trimmed.toLowerCase()}\t${year}`
    let bucket = map.get(matchKey)
    if (!bucket) {
      bucket = { year, term: trimmed, rows: [] }
      map.set(matchKey, bucket)
      order.push(matchKey)
    }
    bucket.rows.push(row)
  }

  const meta = order.map((k) => {
    const b = map.get(k)!
    return { year: b.year, term: b.term, key: k }
  })
  meta.sort(compareTermGroups)

  return meta.map(({ key }) => {
    const b = map.get(key)!
    return { year: b.year, term: b.term, rows: b.rows }
  })
}

export type TranscriptTermOption = {
  term: string
  year: number
  label: string
  key: string
}

/** Dropdown options derived only from transcript rows with valid term/year (aligned with preview). */
export function buildTranscriptTermOptions(
  transcript: TranscriptRow[],
): TranscriptTermOption[] {
  return groupTranscriptByTermYear(transcript).map((g) => ({
    term: g.term,
    year: g.year,
    label: `${g.term} ${g.year}`,
    key: termYearKey(g.term, g.year),
  }))
}

export function rowsForSelectedTerm(
  transcript: TranscriptRow[],
  selectedTerm: string,
  selectedYear: number,
): TranscriptRow[] {
  if (!isValidTranscriptTermYear(selectedTerm, selectedYear)) return []
  return transcript.filter(
    (r) =>
      isValidTranscriptTermYear(r.term, r.year) &&
      r.year === selectedYear &&
      termsMatch(r.term, selectedTerm),
  )
}

export function defaultTermKeyFromTranscript(
  data: StudentAcademicsResponse,
  options: TranscriptTermOption[],
): string | null {
  if (options.length === 0) return null
  const ct = data.currentTerm
  if (ct && isValidTranscriptTermYear(ct.term, ct.year)) {
    const hit = options.find(
      (o) => o.year === ct.year && termsMatch(o.term, ct.term),
    )
    if (hit) return hit.key
  }
  return options[0]!.key
}

function rowRecord(row: TranscriptRow): Record<string, unknown> {
  return row as TranscriptRow & Record<string, unknown>
}

/**
 * Prefers explicit EN/ZH fields when present; otherwise single courseTitle (and legacy course_title).
 */
export function bilingualCourseTitleParts(row: TranscriptRow): {
  primary: string
  secondary: string | null
} {
  const ex = rowRecord(row)
  const en =
    strOpt(ex.titleEn) ??
    strOpt(ex.courseTitleEn) ??
    strOpt(ex.course_title_en)
  const zh =
    strOpt(ex.titleZh) ??
    strOpt(ex.courseTitleZh) ??
    strOpt(ex.course_title_zh)
  const legacy = strOpt(row.courseTitle) ?? strOpt(ex.course_title) ?? ''

  if (en && zh && en !== zh) return { primary: en, secondary: zh }
  if (en) return { primary: en, secondary: zh && zh !== en ? zh : null }
  if (zh) return { primary: zh, secondary: null }
  return { primary: legacy || '—', secondary: null }
}

export function formatCreditCell(row: TranscriptRow): string {
  const ex = rowRecord(row)
  const keys = [
    'credits',
    'credit',
    'units',
    'creditHours',
    'credit_hours',
    'unit',
  ] as const
  for (const k of keys) {
    const v = ex[k]
    if (v == null || v === '') continue
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v === Math.floor(v)) return String(v)
      return String(v)
    }
    const n = Number(v)
    if (Number.isFinite(n)) {
      if (n === Math.floor(n)) return String(n)
      return String(n)
    }
    const s = String(v).trim()
    if (s.length > 0) return s
  }
  return '—'
}

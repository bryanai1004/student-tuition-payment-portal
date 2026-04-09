/**
 * Google Calendar “quick add” deep links (action=TEMPLATE) — no OAuth, no API, no backend.
 * Google opens a prefilled event editor; the student confirms/saves in their own account.
 *
 * Weekday mapping: dashboard timetable uses `WeekdayKey` (monday…sunday). RRULE BYDAY uses
 * two-letter ICS codes (MO, TU, …). We map 1:1 from `WeekdayKey` → BYDAY token.
 *
 * Date resolution: `academicTermStartDate` / `academicTermEndDate` are YYYY-MM-DD civil dates
 * (Gregorian) from the academic term record — interpreted as the school’s term boundaries.
 * The first instance is the earliest calendar date on or after the term start whose weekday
 * matches one of the class meeting days (weekday is a property of the civil date globally).
 *
 * Recurrence: one link per course meeting pattern (same times + aggregated weekdays from the
 * schedule string). RRULE FREQ=WEEKLY with BYDAY listing every meeting weekday, UNTIL set to
 * the last moment of the term end date in UTC (computed from America/Los_Angeles via Intl) so
 * the series stops after the term.
 *
 * Timezone: event wall times use `timezone` (default America/Los_Angeles), passed to Google as
 * `ctz`. `dates` uses local YYYYMMDDTHHmmss pairs without Z so Google pairs them with `ctz`.
 */

import type { WeekdayKey } from '../lib/dashboardWeekTimetable'

export const DEFAULT_GOOGLE_CALENDAR_TIMEZONE = 'America/Los_Angeles'

/** ICS RRULE BYDAY tokens (Monday = MO, …). */
const WEEKDAY_KEY_TO_RRULE: Record<WeekdayKey, string> = {
  sunday: 'SU',
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
}

export type GoogleCalendarDeepLinkEventInput = {
  courseCode: string
  courseTitle: string
  /** Class meeting weekdays; combined into one RRULE BYDAY list. */
  weekdays: WeekdayKey[]
  /** Minutes since local midnight in `timezone` (same as dashboard timetable). */
  startMinutes: number
  endMinutes: number
  room?: string | null
  instructor?: string | null
  term: string
  year: number
  /** Inclusive term start YYYY-MM-DD (Gregorian). */
  academicTermStartDate: string
  /** Inclusive term end YYYY-MM-DD (Gregorian). */
  academicTermEndDate: string
  /** IANA timezone for wall times and Google `ctz`. */
  timezone?: string
}

export type GoogleCalendarBatchLinkItem = {
  href: string
  /** Short label for UI lists (e.g. modal). */
  label: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** True if string is YYYY-MM-DD. */
function isIsoYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

/** Add `deltaDays` to a YYYY-MM-DD using UTC calendar arithmetic (valid for Gregorian civil dates). */
export function addCalendarDaysIso(isoYmd: string, deltaDays: number): string {
  const [ys, ms, ds] = isoYmd.split('-').map((x) => Number(x))
  const t = Date.UTC(ys, ms - 1, ds + deltaDays)
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** WeekdayKey for civil date `isoYmd` (uses UTC noon so getUTCDay matches global weekday for that date). */
export function weekdayKeyFromIsoYmd(isoYmd: string): WeekdayKey {
  const [y, m, d] = isoYmd.split('-').map((x) => Number(x))
  const w = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
  const keys: WeekdayKey[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  return keys[w] ?? 'sunday'
}

/**
 * First YYYY-MM-DD on or after `termStartYmd` whose weekday is in `weekdays`, or null if none in range.
 */
export function firstOccurrenceYmd(
  termStartYmd: string,
  weekdays: WeekdayKey[],
  maxScanDays = 370,
): string | null {
  const want = new Set(weekdays)
  for (let k = 0; k < maxScanDays; k++) {
    const ymd = addCalendarDaysIso(termStartYmd, k)
    if (want.has(weekdayKeyFromIsoYmd(ymd))) return ymd
  }
  return null
}

function compareIsoYmd(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function civilDateKeyAtUtcMs(ms: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date(ms))
  const g = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN)
  return g('year') * 10000 + g('month') * 100 + g('day')
}

/**
 * Smallest UTC ms instant where `timeZone`’s civil calendar reads `isoYmd` (YYYY-MM-DD).
 * Used to bracket “end of term” for RRULE UNTIL.
 */
function firstUtcMsWhenZoneShowsYmd(isoYmd: string, timeZone: string): number | null {
  if (!isIsoYmd(isoYmd)) return null
  const [y0, m0, d0] = isoYmd.split('-').map((x) => Number(x))
  if (!Number.isFinite(y0) || !Number.isFinite(m0) || !Number.isFinite(d0)) return null
  const target = y0 * 10000 + m0 * 100 + d0

  let lo = Date.UTC(y0, m0 - 1, d0) - 40 * 3600 * 1000
  let hi = Date.UTC(y0, m0 - 1, d0 + 1) + 40 * 3600 * 1000

  for (let i = 0; i < 56 && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2)
    if (civilDateKeyAtUtcMs(mid, timeZone) < target) lo = mid
    else hi = mid
  }

  let tLo = lo
  let tHi = hi
  for (let i = 0; i < 40 && tHi - tLo > 1; i++) {
    const mid = Math.floor((tLo + tHi) / 2)
    if (civilDateKeyAtUtcMs(mid, timeZone) >= target) tHi = mid
    else tLo = mid
  }

  return civilDateKeyAtUtcMs(tHi, timeZone) === target ? tHi : null
}

/** Last second of civil `isoYmd` in `timeZone`, as UTC Zulu, for RRULE UNTIL. */
function rruleUntilUtcZuluFromCivilDateInZone(isoYmd: string, timeZone: string): string | null {
  const next = addCalendarDaysIso(isoYmd, 1)
  const startNext = firstUtcMsWhenZoneShowsYmd(next, timeZone)
  if (startNext == null) return null
  const lastMs = startNext - 1000
  const end = new Date(lastMs)
  return `${end.getUTCFullYear()}${pad2(end.getUTCMonth() + 1)}${pad2(end.getUTCDate())}T${pad2(end.getUTCHours())}${pad2(end.getUTCMinutes())}${pad2(end.getUTCSeconds())}Z`
}

function formatGoogleDatesSegment(ymd: string, startMinutes: number, endMinutes: number): string | null {
  if (!isIsoYmd(ymd)) return null
  const [y, m, d] = ymd.split('-')
  const sh = Math.floor(startMinutes / 60)
  const sm = startMinutes % 60
  const eh = Math.floor(endMinutes / 60)
  const em = endMinutes % 60
  if (
    sh < 0 ||
    sh > 23 ||
    sm < 0 ||
    sm > 59 ||
    eh < 0 ||
    eh > 23 ||
    em < 0 ||
    em > 59 ||
    endMinutes <= startMinutes
  ) {
    return null
  }
  const a = `${y}${m}${d}T${pad2(sh)}${pad2(sm)}00`
  const b = `${y}${m}${d}T${pad2(eh)}${pad2(em)}00`
  return `${a}/${b}`
}

function buildDescription(input: GoogleCalendarDeepLinkEventInput): string {
  const code = input.courseCode.trim()
  const title = input.courseTitle.trim()
  const room = (input.room ?? '').trim()
  const inst = (input.instructor ?? '').trim()
  const term = input.term.trim()
  const year = input.year
  return [
    `Course: ${code} ${title}`,
    `Instructor: ${inst}`,
    `Room: ${room}`,
    `Term: ${term} ${year}`,
  ].join('\n')
}

/**
 * Returns a single `https://calendar.google.com/calendar/render?...` URL or null if the event
 * cannot be represented (missing dates, no weekdays, bad times, first meeting after term end, etc.).
 */
export function buildGoogleCalendarEventLink(input: GoogleCalendarDeepLinkEventInput): string | null {
  const tz = (input.timezone ?? DEFAULT_GOOGLE_CALENDAR_TIMEZONE).trim() || DEFAULT_GOOGLE_CALENDAR_TIMEZONE
  const startYmd = input.academicTermStartDate.trim()
  const endYmd = input.academicTermEndDate.trim()
  if (!isIsoYmd(startYmd) || !isIsoYmd(endYmd)) return null
  if (compareIsoYmd(endYmd, startYmd) < 0) return null

  const uniqDays = [...new Set(input.weekdays)]
  if (uniqDays.length === 0) return null

  const byDayTokens = uniqDays
    .map((d) => WEEKDAY_KEY_TO_RRULE[d])
    .filter(Boolean)
    .sort()
  if (byDayTokens.length === 0) return null

  const firstYmd = firstOccurrenceYmd(startYmd, uniqDays)
  if (firstYmd == null || compareIsoYmd(firstYmd, endYmd) > 0) return null

  const datesSeg = formatGoogleDatesSegment(firstYmd, input.startMinutes, input.endMinutes)
  if (datesSeg == null) return null

  const untilZ = rruleUntilUtcZuluFromCivilDateInZone(endYmd, tz)
  if (untilZ == null) return null

  const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${byDayTokens.join(',')};UNTIL=${untilZ}`

  const title = `${input.courseCode.trim()} ${input.courseTitle.trim()}`.replace(/\s+/g, ' ').trim()
  const location = (input.room ?? '').trim()
  const details = buildDescription(input)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: datesSeg,
    details,
    location,
    ctz: tz,
    recur: rrule,
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** One link per input; invalid rows are skipped (same rules as `buildGoogleCalendarEventLink`). */
export function buildGoogleCalendarBatchLinks(
  events: GoogleCalendarDeepLinkEventInput[],
): GoogleCalendarBatchLinkItem[] {
  const out: GoogleCalendarBatchLinkItem[] = []
  for (const ev of events) {
    const href = buildGoogleCalendarEventLink(ev)
    if (href == null) continue
    const label = `${ev.courseCode.trim()}${ev.courseTitle.trim() ? ` — ${ev.courseTitle.trim()}` : ''}`
    out.push({ href, label })
  }
  return out
}

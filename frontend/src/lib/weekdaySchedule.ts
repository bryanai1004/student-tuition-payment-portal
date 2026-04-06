/** Canonical full names, Mon–Sun order (stable storage serialization). */
export const WEEKDAYS_FULL_ORDERED = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export type WeekdayFull = (typeof WEEKDAYS_FULL_ORDERED)[number]

const FULL_LOWER_TO_CANONICAL: Record<string, WeekdayFull> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** Abbrev / alternate tokens → canonical full name */
const TOKEN_TO_FULL: Record<string, WeekdayFull> = {
  ...FULL_LOWER_TO_CANONICAL,
  mon: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

const FULL_TO_SHORT: Record<WeekdayFull, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
}

const ORDER_INDEX: Record<WeekdayFull, number> = WEEKDAYS_FULL_ORDERED.reduce(
  (acc, d, i) => {
    acc[d] = i
    return acc
  },
  {} as Record<WeekdayFull, number>,
)

function normalizeDayToken(raw: string): WeekdayFull | null {
  const t = raw.trim().replace(/\.$/, '')
  if (t === '') return null
  const key = t.toLowerCase()
  return TOKEN_TO_FULL[key] ?? FULL_LOWER_TO_CANONICAL[key] ?? null
}

/**
 * Parse DB/API `weekday` (e.g. `Monday`, `Monday,Wednesday`) into ordered unique full names.
 */
export function parseStoredWeekdaysToFullNames(stored: string | null | undefined): WeekdayFull[] {
  if (stored == null || String(stored).trim() === '') return []
  const parts = String(stored)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  const seen = new Set<WeekdayFull>()
  const out: WeekdayFull[] = []
  for (const p of parts) {
    const d = normalizeDayToken(p)
    if (d && !seen.has(d)) {
      seen.add(d)
      out.push(d)
    }
  }
  out.sort((a, b) => ORDER_INDEX[a] - ORDER_INDEX[b])
  return out
}

/** Form multi-select → stable comma-separated storage (no spaces). */
export function selectedWeekdaysToStorage(selected: readonly string[]): string {
  const full = selected
    .map((s) => normalizeDayToken(s))
    .filter((x): x is WeekdayFull => x != null)
  const seen = new Set<WeekdayFull>()
  const uniq: WeekdayFull[] = []
  for (const d of full) {
    if (!seen.has(d)) {
      seen.add(d)
      uniq.push(d)
    }
  }
  uniq.sort((a, b) => ORDER_INDEX[a] - ORDER_INDEX[b])
  return uniq.join(',')
}

/** Table display: `Mon, Wed` */
export function formatWeekdaysShortFromStored(stored: string | null | undefined): string {
  const days = parseStoredWeekdaysToFullNames(stored)
  if (days.length === 0) return '—'
  return days.map((d) => FULL_TO_SHORT[d]).join(', ')
}

/** Timetable column index 0 = Monday … 6 = Sunday */
export function weekdayFullToGridIndex(day: WeekdayFull): number {
  return ORDER_INDEX[day]
}

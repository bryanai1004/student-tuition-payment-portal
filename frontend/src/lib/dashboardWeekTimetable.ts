import type { ScheduleRow } from '../types/billing'

export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type WeekTimetableBlock = {
  courseCode: string
  /** Display range (original or normalized). */
  timeLabel: string
  startMinutes: number
  endMinutes: number
  subtitle: string
}

const WEEK_ORDER: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

const DAY_TOKEN_TO_KEY: Record<string, WeekdayKey> = {
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
  saturday: 'saturday',
  sat: 'saturday',
  sunday: 'sunday',
  sun: 'sunday',
}

/** Parse "9:00 AM", "18:00", "18:00:00" → minutes since midnight. */
export function parseTimeToMinutes(input: string): number | null {
  const s = input.trim()
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s*$/i)
  if (ampm) {
    let h = Number(ampm[1])
    const m = Number(ampm[2])
    const ap = ampm[4]!.toUpperCase()
    if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59) return null
    if (ap === 'PM' && h !== 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    if (h > 23) return null
    return h * 60 + m
  }
  const hms = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (hms) {
    const h = Number(hms[1])
    const m = Number(hms[2])
    if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null
    return h * 60 + m
  }
  return null
}

function parseTimeRange(range: string): { start: number; end: number } | null {
  const normalized = range.replace(/\s+/g, ' ').trim()
  const m = normalized.match(/^(.+?)\s*[–-]\s*(.+)$/)
  if (!m) return null
  const start = parseTimeToMinutes(m[1]!.trim())
  const end = parseTimeToMinutes(m[2]!.trim())
  if (start == null || end == null || end <= start) return null
  return { start, end }
}

function dayTokenToKey(token: string): WeekdayKey | null {
  const k = token
    .toLowerCase()
    .replace(/\.$/, '')
    .trim()
  return DAY_TOKEN_TO_KEY[k] ?? null
}

/** Split "Mon & Wed", "Tue/Thu", "Tuesday" into weekday keys. */
export function expandDayTokens(dayLine: string): WeekdayKey[] {
  const parts = dayLine
    .split(/\s*(?:,|\/|&|\band\b)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
  const keys: WeekdayKey[] = []
  for (const p of parts) {
    const key = dayTokenToKey(p)
    if (key) keys.push(key)
  }
  return keys
}

export type ParsedMeeting = {
  day: WeekdayKey
  startMinutes: number
  endMinutes: number
  timeLabel: string
}

/**
 * Parse one schedule string (same source as Courses tab) into concrete meeting slots.
 * Supports e.g. "Tuesday, 18:00:00–21:00:00; Saturday, 10:00:00–13:00:00"
 * and "Mon & Wed, 9:00 AM – 10:50 AM".
 */
export function parseScheduleStringToMeetings(schedule: string): ParsedMeeting[] {
  const raw = String(schedule).trim()
  if (!raw) return []

  const segments = raw
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)

  const meetings: ParsedMeeting[] = []

  for (const segment of segments) {
    const comma = segment.indexOf(',')
    if (comma < 0) continue
    const dayPart = segment.slice(0, comma).trim()
    const timePart = segment.slice(comma + 1).trim()
    if (!dayPart || !timePart) continue

    const range = parseTimeRange(timePart)
    if (!range) continue

    const days = expandDayTokens(dayPart)
    if (days.length === 0) continue

    const timeLabel = timePart.replace(/\s+/g, ' ').trim()

    for (const day of days) {
      meetings.push({
        day,
        startMinutes: range.start,
        endMinutes: range.end,
        timeLabel,
      })
    }
  }

  return meetings
}

export function scheduleRowHasParsableMeetings(row: ScheduleRow): boolean {
  if (row.schedule == null || String(row.schedule).trim() === '') return false
  return parseScheduleStringToMeetings(String(row.schedule)).length > 0
}

export function accountScheduleRowsHaveWeekGridData(rows: ScheduleRow[]): boolean {
  return rows.some(scheduleRowHasParsableMeetings)
}

export type WeekTimetableModel = {
  /** Days shown left-to-right (Mon–Sun). */
  visibleDays: WeekdayKey[]
  /** Minutes since midnight — grid top (inclusive). */
  gridStartMinutes: number
  /** Minutes since midnight — grid bottom (exclusive), same convention as `timetableBlockLayout`. */
  gridEndMinutes: number
  blocksByDay: Record<WeekdayKey, WeekTimetableBlock[]>
}

/** Fixed academic-day window for the dashboard week grid: 8:00 AM through end of 9:00 PM. */
export const DASHBOARD_WEEK_GRID_START_MINUTES = 8 * 60
export const DASHBOARD_WEEK_GRID_END_MINUTES = (21 + 1) * 60

function mergeBlocksForDay(blocks: WeekTimetableBlock[]): WeekTimetableBlock[] {
  return [...blocks].sort((a, b) => a.startMinutes - b.startMinutes)
}

/**
 * Build week grid data from account schedule rows (structured string only; same as list view).
 * Always returns Mon–Sun columns; days without meetings stay empty.
 */
export function buildWeekTimetableFromScheduleRows(rows: ScheduleRow[]): WeekTimetableModel {
  const blocksByDay: Record<WeekdayKey, WeekTimetableBlock[]> = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }

  for (const row of rows) {
    const meetings = parseScheduleStringToMeetings(String(row.schedule ?? ''))
    const subtitle = row.title?.trim() ? row.title.trim() : ''
    for (const m of meetings) {
      blocksByDay[m.day].push({
        courseCode: row.courseCode?.trim() || '—',
        timeLabel: m.timeLabel,
        startMinutes: m.startMinutes,
        endMinutes: m.endMinutes,
        subtitle,
      })
    }
  }

  const visibleDays: WeekdayKey[] = [...WEEK_ORDER]

  for (const d of WEEK_ORDER) {
    blocksByDay[d] = mergeBlocksForDay(blocksByDay[d])
  }

  return {
    visibleDays,
    gridStartMinutes: DASHBOARD_WEEK_GRID_START_MINUTES,
    gridEndMinutes: DASHBOARD_WEEK_GRID_END_MINUTES,
    blocksByDay,
  }
}

export function formatHourLabel(minutesSinceMidnight: number): string {
  const h24 = Math.floor(minutesSinceMidnight / 60)
  const m = minutesSinceMidnight % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const ap = h24 < 12 ? 'AM' : 'PM'
  if (m === 0) return `${h12} ${ap}`
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

export const WEEKDAY_SHORT_LABEL: Record<WeekdayKey, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

export const WEEKDAY_LONG_LABEL: Record<WeekdayKey, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** Compact 24h range for list-style timetables, e.g. `10:00–13:00`. */
export function formatBlockTimeRange24(block: WeekTimetableBlock): string {
  const fmt = (total: number) => {
    const h = Math.floor(total / 60)
    const m = total % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return `${fmt(block.startMinutes)}–${fmt(block.endMinutes)}`
}

/** Hour labels from grid start through the range (exclusive of end boundary). */
export function hourTickMinutes(gridStartMinutes: number, gridEndMinutes: number): number[] {
  const ticks: number[] = []
  const first = Math.floor(gridStartMinutes / 60) * 60
  for (let t = first; t < gridEndMinutes; t += 60) {
    ticks.push(t)
  }
  return ticks
}

export function blockVerticalStyle(
  block: WeekTimetableBlock,
  gridStartMinutes: number,
  gridEndMinutes: number,
): { top: string; height: string } {
  const span = gridEndMinutes - gridStartMinutes
  if (span <= 0) return { top: '0%', height: '0%' }
  const clipStart = Math.max(block.startMinutes, gridStartMinutes)
  const clipEnd = Math.min(block.endMinutes, gridEndMinutes)
  if (clipEnd <= clipStart) return { top: '0%', height: '0%' }
  const top = ((clipStart - gridStartMinutes) / span) * 100
  const height = ((clipEnd - clipStart) / span) * 100
  return {
    top: `${top}%`,
    height: `${height}%`,
  }
}

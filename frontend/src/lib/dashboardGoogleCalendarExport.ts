import type { WeekTimetableBlock } from './dashboardWeekTimetable'
import { parseScheduleStringToMeetings, type WeekdayKey } from './dashboardWeekTimetable'
import type { ScheduleRow } from '../types/billing'
import {
  buildGoogleCalendarBatchLinks,
  buildGoogleCalendarEventLink,
  DEFAULT_GOOGLE_CALENDAR_TIMEZONE,
  type GoogleCalendarBatchLinkItem,
  type GoogleCalendarDeepLinkEventInput,
} from '../utils/googleCalendar'

export type DashboardGoogleCalendarTermBounds = {
  term: string
  year: number
  start: string | null
  end: string | null
}

function blockPatternKeyFromParts(
  courseCode: string,
  subtitle: string,
  startMinutes: number,
  endMinutes: number,
): string {
  return `${courseCode.trim()}|${subtitle.trim()}|${startMinutes}|${endMinutes}`
}

export function dashboardBlockGoogleCalendarPatternKey(block: WeekTimetableBlock): string {
  return blockPatternKeyFromParts(block.courseCode, block.subtitle, block.startMinutes, block.endMinutes)
}

function collectDeepLinkInputs(
  rows: ScheduleRow[],
  bounds: DashboardGoogleCalendarTermBounds,
): GoogleCalendarDeepLinkEventInput[] {
  if (bounds.start == null || bounds.end == null) return []

  type Group = {
    days: Set<WeekdayKey>
    startMinutes: number
    endMinutes: number
    courseCode: string
    courseTitle: string
    room: string | null
    instructor: string | null
  }

  const groups = new Map<string, Group>()

  for (const row of rows) {
    const meetings = parseScheduleStringToMeetings(String(row.schedule ?? ''))
    for (const m of meetings) {
      const key = [
        row.courseCode?.trim() ?? '',
        row.title?.trim() ?? '',
        row.location ?? '',
        row.instructor ?? '',
        m.startMinutes,
        m.endMinutes,
      ].join('|')

      let g = groups.get(key)
      if (!g) {
        g = {
          days: new Set(),
          startMinutes: m.startMinutes,
          endMinutes: m.endMinutes,
          courseCode: row.courseCode?.trim() ?? '',
          courseTitle: row.title?.trim() ?? '',
          room: row.location ?? null,
          instructor: row.instructor ?? null,
        }
        groups.set(key, g)
      }
      g.days.add(m.day)
    }
  }

  const inputs: GoogleCalendarDeepLinkEventInput[] = []
  for (const g of groups.values()) {
    if (g.days.size === 0) continue
    inputs.push({
      courseCode: g.courseCode,
      courseTitle: g.courseTitle,
      weekdays: [...g.days],
      startMinutes: g.startMinutes,
      endMinutes: g.endMinutes,
      room: g.room,
      instructor: g.instructor,
      term: bounds.term.trim(),
      year: bounds.year,
      academicTermStartDate: bounds.start,
      academicTermEndDate: bounds.end,
      timezone: DEFAULT_GOOGLE_CALENDAR_TIMEZONE,
    })
  }

  inputs.sort((a, b) => {
    const c = a.courseCode.localeCompare(b.courseCode)
    if (c !== 0) return c
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes
    return a.endMinutes - b.endMinutes
  })

  return inputs
}

/**
 * Builds batch links for the modal and a lookup from timetable block pattern → href
 * (one recurring event per distinct meeting time + course row metadata).
 */
export function buildDashboardGoogleCalendarExportModel(
  rows: ScheduleRow[],
  bounds: DashboardGoogleCalendarTermBounds,
): {
  batchItems: GoogleCalendarBatchLinkItem[]
  hrefByBlockPatternKey: Map<string, string>
} {
  if (bounds.start == null || bounds.end == null) {
    return { batchItems: [], hrefByBlockPatternKey: new Map() }
  }

  const inputs = collectDeepLinkInputs(rows, bounds)
  const hrefByBlockPatternKey = new Map<string, string>()
  for (const input of inputs) {
    const href = buildGoogleCalendarEventLink(input)
    if (href == null) continue
    hrefByBlockPatternKey.set(
      blockPatternKeyFromParts(
        input.courseCode,
        input.courseTitle,
        input.startMinutes,
        input.endMinutes,
      ),
      href,
    )
  }

  return {
    batchItems: buildGoogleCalendarBatchLinks(inputs),
    hrefByBlockPatternKey,
  }
}

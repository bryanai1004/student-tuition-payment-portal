import type { AdminCourseSection } from '../../lib/api'
import { parseDisplayTimeRangeToHhMmSs } from '../../lib/formatScheduleTime'
import { shortWeekdayDisplayToStorage } from '../../lib/weekdaySchedule'
import type { CourseBinItem } from './CourseBinContext'

function unitsFromCourseBinItemDisplay(raw: string): number | null {
  const t = raw.trim()
  if (t === '' || t === '—') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function courseBinItemToSyntheticSection(
  item: CourseBinItem,
  index: number,
): AdminCourseSection | null {
  const code = item.course_code.trim()
  if (code === '') return null

  let weekday = item.schedule_weekday?.trim() ?? ''
  if (weekday === '') {
    weekday = shortWeekdayDisplayToStorage(item.days)
  }
  if (weekday === '') return null

  let start = item.schedule_start_time?.trim() ?? ''
  let end = item.schedule_end_time?.trim() ?? ''
  if (start === '' || end === '') {
    const parsed = parseDisplayTimeRangeToHhMmSs(item.time)
    if (!parsed) return null
    start = parsed.start
    end = parsed.end
  }

  const sec = item.section.trim()
  const withTitle = item as CourseBinItem & { course_title?: string | null }
  return {
    id: -1000 - index,
    course_code: code,
    prerequisite_course_id: null,
    course_title: withTitle.course_title?.trim() || code,
    term: '',
    year: 0,
    section_code: sec === '' ? '—' : sec,
    schedule_track: item.schedule_track === 'CN' ? 'CN' : 'EN',
    weekday,
    start_time: start,
    end_time: end,
    delivery_mode: null,
    room: item.location === 'TBA' ? null : item.location.trim() || null,
    instructor: item.instructor === 'TBA' ? null : item.instructor.trim() || null,
    notes: null,
    units: unitsFromCourseBinItemDisplay(item.units),
    enrolled_count: 0,
  }
}

export function partitionCourseBinItemsForTimetable(items: readonly CourseBinItem[]): {
  sections: AdminCourseSection[]
  unplaced: CourseBinItem[]
} {
  const sections: AdminCourseSection[] = []
  const unplaced: CourseBinItem[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const syn = courseBinItemToSyntheticSection(item, i)
    if (syn) {
      sections.push(syn)
    } else {
      unplaced.push(item)
    }
  }
  return { sections, unplaced }
}

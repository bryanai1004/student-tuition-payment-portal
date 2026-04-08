import type { AdminCourseSection } from './api'
import { formatTimeRangeHmsForDisplay } from './formatScheduleTime'
import { formatWeekdaysShortFromStored } from './weekdaySchedule'
import type { ScheduleRow } from '../types/billing'

/**
 * Build dashboard/list-style `schedule` strings from portal enrolled sections so
 * `parseScheduleStringToMeetings` (week grid) matches Registration › My Timetable row semantics.
 */
export function enrolledSectionsToScheduleRows(
  sections: AdminCourseSection[],
): ScheduleRow[] {
  return sections.map((sec) => {
    const daysShort = formatWeekdaysShortFromStored(sec.weekday)
    const timeRange = formatTimeRangeHmsForDisplay(sec.start_time, sec.end_time)
    let schedule: string | null = null
    if (
      daysShort !== '—' &&
      timeRange !== '—' &&
      !/^TBA$/i.test(daysShort) &&
      !/^TBA$/i.test(timeRange)
    ) {
      schedule = `${daysShort}, ${timeRange}`
    }
    const room = sec.room?.trim() ?? ''
    const inst = sec.instructor?.trim() ?? ''
    const title =
      sec.course_title != null && String(sec.course_title).trim() !== ''
        ? String(sec.course_title).trim()
        : ''
    return {
      courseCode: sec.course_code?.trim() || '',
      title,
      type: sec.delivery_mode?.trim() ? String(sec.delivery_mode).trim() : '',
      units: null,
      hours: null,
      charge: 0,
      schedule,
      location: room === '' ? null : room,
      instructor: inst === '' ? null : inst,
    }
  })
}

import type { ScheduleRow } from '../types/billing'

/**
 * Maps `scheduleRows` from GET /api/students/:id/account JSON into `ScheduleRow` view models.
 * Shared by account normalization and term-scoped schedule fetches for the dashboard week grid.
 */
export function parseScheduleRowsFromStudentAccountJson(raw: unknown): ScheduleRow[] {
  if (raw == null || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  const scheduleRowsRaw = Array.isArray(o.scheduleRows) ? o.scheduleRows : []
  return scheduleRowsRaw.map((row) => {
    const r = row as Record<string, unknown>
    const instructorRaw = r.instructor
    const titleRaw = r.title ?? r.courseTitle ?? r.course_title
    return {
      courseCode: String(r.courseCode ?? ''),
      title: titleRaw == null ? '' : String(titleRaw),
      type: String(r.type ?? ''),
      units: r.units == null ? null : Number(r.units),
      hours: r.hours == null ? null : Number(r.hours),
      charge: Number(r.charge ?? 0) || 0,
      schedule:
        r.schedule == null || String(r.schedule).trim() === ''
          ? null
          : String(r.schedule),
      location:
        r.location == null || String(r.location).trim() === ''
          ? null
          : String(r.location),
      instructor:
        instructorRaw == null || String(instructorRaw).trim() === ''
          ? null
          : String(instructorRaw),
    }
  })
}

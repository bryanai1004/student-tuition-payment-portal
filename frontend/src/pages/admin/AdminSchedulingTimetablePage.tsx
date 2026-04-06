import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAcademicTerms,
  fetchAdminCourseSections,
  type AcademicTerm,
  type AdminCourseSection,
} from '../../lib/api'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  parseStoredWeekdaysToFullNames,
  weekdayFullToGridIndex,
  type WeekdayFull,
} from '../../lib/weekdaySchedule'

/** Row = hour block [H, H+1) in 24h local interpretation of stored TIME. */
const TIMETABLE_START_HOUR = 8
const TIMETABLE_END_HOUR = 21

function hourRowLabel(hour: number): string {
  return formatTimeHmsForDisplay(`${hour}:00:00`)
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (t == null || String(t).trim() === '') return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(t).trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null
  }
  return h * 60 + min
}

function sectionOverlapsHourSlot(
  section: AdminCourseSection,
  slotStartMin: number,
  slotEndMin: number,
): boolean {
  const start = timeToMinutes(section.start_time)
  const end = timeToMinutes(section.end_time)
  if (start == null || end == null) return false
  if (end <= start) return false
  return start < slotEndMin && end > slotStartMin
}

const DAY_HEADERS: { full: WeekdayFull; label: string }[] = [
  { full: 'Monday', label: 'Monday' },
  { full: 'Tuesday', label: 'Tuesday' },
  { full: 'Wednesday', label: 'Wednesday' },
  { full: 'Thursday', label: 'Thursday' },
  { full: 'Friday', label: 'Friday' },
  { full: 'Saturday', label: 'Saturday' },
  { full: 'Sunday', label: 'Sunday' },
]

export function AdminSchedulingTimetablePage() {
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null)
  const [academicTermId, setAcademicTermId] = useState('')
  const [sections, setSections] = useState<AdminCourseSection[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const t = await fetchAcademicTerms({ signal: ac.signal })
        if (ac.signal.aborted) return
        setTerms(t)
        setAcademicTermId((prev) =>
          prev === '' && t.length > 0 ? t[0].id : prev,
        )
      } catch (e) {
        if (ac.signal.aborted) return
        setTerms([])
        setError(
          e instanceof Error ? e.message : 'Could not load academic terms.',
        )
      }
    })()
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const tid = academicTermId.trim()
    if (tid === '') {
      setSections([])
      setLoading(false)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const rows = await fetchAdminCourseSections({
          academicTermId: tid,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setSections(rows)
      } catch (e) {
        if (ac.signal.aborted) return
        setSections(null)
        setError(
          e instanceof Error ? e.message : 'Could not load sections.',
        )
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [academicTermId])

  const hourRows = useMemo(
    () =>
      Array.from(
        { length: TIMETABLE_END_HOUR - TIMETABLE_START_HOUR + 1 },
        (_, i) => TIMETABLE_START_HOUR + i,
      ),
    [],
  )

  const cells = useMemo(() => {
    const byHourAndDay: AdminCourseSection[][][] = hourRows.map(() =>
      Array.from({ length: 7 }, () => [] as AdminCourseSection[]),
    )
    const list = sections ?? []
    for (const rowH of hourRows) {
      const slotStart = rowH * 60
      const slotEnd = (rowH + 1) * 60
      const ri = rowH - TIMETABLE_START_HOUR
      for (const sec of list) {
        if (!sectionOverlapsHourSlot(sec, slotStart, slotEnd)) continue
        const days = parseStoredWeekdaysToFullNames(sec.weekday)
        for (const d of days) {
          const di = weekdayFullToGridIndex(d)
          const cell = byHourAndDay[ri]![di]!
          if (!cell.some((x) => x.id === sec.id)) cell.push(sec)
        }
      }
    }
    return byHourAndDay
  }, [sections, hourRows])

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">
          Scheduling Timetable
        </h1>
        <div className="admin-page__toolbar-actions admin-page__toolbar-actions--wrap">
          <Link
            to="/admin/course-sections"
            className="portal-btn portal-btn--secondary portal-btn--compact"
          >
            Back to Course Sections
          </Link>
          <label className="admin-field admin-field--inline">
            <span className="admin-field__label">Academic term</span>
            <select
              className="admin-input"
              value={academicTermId}
              onChange={(e) => setAcademicTermId(e.target.value)}
              disabled={terms == null || terms.length === 0}
              aria-label="Academic term"
            >
              {terms == null ? (
                <option value="">Loading…</option>
              ) : (
                terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.term_label} ({t.id})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </div>

      <p className="portal-text-muted admin-form-hint" style={{ marginTop: 0 }}>
        Read-only view of all sections for the selected term. Each row is a
        one-hour block; sections spanning multiple hours appear in each row they
        overlap. Times without a valid start/end are omitted from the grid.
      </p>

      {error != null && (
        <p className="portal-text-muted" role="alert">
          {error}
        </p>
      )}

      {loading && <p className="portal-text-muted">Loading timetable…</p>}

      <div className="admin-timetable-wrap">
        <table className="admin-timetable">
          <thead>
            <tr>
              <th scope="col" className="admin-timetable__time">
                Time
              </th>
              {DAY_HEADERS.map((d) => (
                <th key={d.full} scope="col">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hourRows.map((h, ri) => (
              <tr key={h}>
                <th scope="row" className="admin-timetable__time">
                  {hourRowLabel(h)}
                </th>
                {DAY_HEADERS.map((d, di) => {
                  const blocks = cells[ri]![di]!
                  return (
                    <td key={d.full} className="admin-timetable__cell">
                      <div className="admin-timetable__blocks">
                        {blocks.map((sec) => (
                          <div
                            key={`${sec.id}-${h}-${d.full}`}
                            className="admin-timetable__block"
                          >
                            <div className="admin-timetable__block-title">
                              {sec.course_code} {sec.section_code}
                            </div>
                            <div className="admin-timetable__block-meta">
                              {formatTimeHmsForDisplay(sec.start_time)} –{' '}
                              {formatTimeHmsForDisplay(sec.end_time)}
                            </div>
                            <div className="admin-timetable__block-meta">
                              {sec.room?.trim() ? sec.room : '—'}
                            </div>
                            <div className="admin-timetable__block-meta">
                              {sec.instructor?.trim()
                                ? sec.instructor
                                : '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}

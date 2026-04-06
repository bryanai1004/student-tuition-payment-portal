import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { AdminCourseSectionDetailModal } from '../../components/admin/AdminCourseSectionDetailModal'
import {
  fetchAcademicTerms,
  fetchAdminCourseSections,
  type AcademicTerm,
  type AdminCourseSection,
} from '../../lib/api'
import { formatDeliveryModeForDisplay } from '../../lib/deliveryMode'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  buildTimetablePlacedBlocksByDay,
  TIMETABLE_END_HOUR,
  TIMETABLE_ROW_HEIGHT_PX,
  TIMETABLE_START_HOUR,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import { type WeekdayFull } from '../../lib/weekdaySchedule'

function hourRowLabel(hour: number): string {
  return formatTimeHmsForDisplay(`${hour}:00:00`)
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
  const [detail, setDetail] = useState<{
    section: AdminCourseSection
    dayLabel: string
  } | null>(null)

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

  useEffect(() => {
    if (detail == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail])

  const hourRows = useMemo(
    () =>
      Array.from(
        { length: TIMETABLE_END_HOUR - TIMETABLE_START_HOUR + 1 },
        (_, i) => TIMETABLE_START_HOUR + i,
      ),
    [],
  )

  const placedByDay = useMemo(
    () => buildTimetablePlacedBlocksByDay(sections ?? []),
    [sections],
  )

  const bodyHeightPx = timetableBodyHeightPx()

  const termCatalogLabel =
    terms?.find((t) => t.id === academicTermId)?.term_label ?? null

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
        Read-only week view: each section is one continuous block by start/end
        time (sub-hour alignment). Click a block for full details. Sections
        without valid times or outside {hourRowLabel(TIMETABLE_START_HOUR)}–
        {hourRowLabel(TIMETABLE_END_HOUR + 1)} are omitted.
      </p>

      {error != null && (
        <p className="portal-text-muted" role="alert">
          {error}
        </p>
      )}

      {loading && <p className="portal-text-muted">Loading timetable…</p>}

      <div className="admin-timetable-wrap">
        <div
          className="admin-timetable-v2"
          style={
            {
              '--admin-tt-slot': `${TIMETABLE_ROW_HEIGHT_PX}px`,
            } as CSSProperties
          }
        >
          <div className="admin-timetable-v2__head">
            <div className="admin-timetable-v2__corner" aria-hidden />
            {DAY_HEADERS.map((d) => (
              <div key={d.full} className="admin-timetable-v2__day-head">
                {d.label}
              </div>
            ))}
          </div>
          <div className="admin-timetable-v2__main">
            <div
              className="admin-timetable-v2__times"
              style={{ height: bodyHeightPx }}
            >
              {hourRows.map((h) => (
                <div key={h} className="admin-timetable-v2__time-cell">
                  {hourRowLabel(h)}
                </div>
              ))}
            </div>
            {DAY_HEADERS.map((d, di) => (
              <div key={d.full} className="admin-timetable-v2__day-col">
                <div
                  className="admin-timetable-v2__day-track"
                  style={{ height: bodyHeightPx }}
                >
                  {placedByDay[di]!.map((b) => {
                    const colW = 100 / b.colCount
                    const insetPx = 3
                    return (
                      <button
                        key={`${b.section.id}-${d.full}-${b.startMin}-${b.colIndex}`}
                        type="button"
                        className="admin-timetable-v2__block"
                        style={{
                          top: b.topPx,
                          height: b.heightPx,
                          left: `calc(${colW * b.colIndex}% + ${insetPx}px)`,
                          width: `calc(${colW}% - ${insetPx * 2}px)`,
                        }}
                        onClick={() =>
                          setDetail({ section: b.section, dayLabel: d.label })
                        }
                      >
                        <span className="admin-timetable-v2__block-title">
                          {b.section.course_code} {b.section.section_code}
                        </span>
                        <span className="admin-timetable-v2__block-meta">
                          {formatTimeHmsForDisplay(b.section.start_time)} –{' '}
                          {formatTimeHmsForDisplay(b.section.end_time)}
                        </span>
                        <span className="admin-timetable-v2__block-meta">
                          {formatDeliveryModeForDisplay(b.section.delivery_mode)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {detail != null && (
        <AdminCourseSectionDetailModal
          section={detail.section}
          dayColumnLabel={detail.dayLabel}
          termCatalogLabel={termCatalogLabel}
          academicTermId={academicTermId.trim() || null}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  )
}

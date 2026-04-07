import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { applyAdminSchedulingToSearchParams } from '../../lib/adminSchedulingSearchParams'
import { AdminCourseSectionDetailModal } from '../../components/admin/AdminCourseSectionDetailModal'
import {
  fetchAcademicTerms,
  fetchAdminCourseSections,
  fetchCourses,
  type AcademicTerm,
  type AdminCourseSection,
  type CourseCatalogItem,
} from '../../lib/api'
import { getPreferredCourseTitle } from '../../lib/courseDisplayName'
import { formatDeliveryModeForDisplay } from '../../lib/deliveryMode'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  buildTimetablePlacedBlocksByDay,
  TIMETABLE_END_HOUR,
  TIMETABLE_ROW_HEIGHT_PX,
  TIMETABLE_START_HOUR,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import { adminTimetableHeading } from '../../lib/scheduleTrack'
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

type AdminTimetableGridProps = {
  placedByDay: ReturnType<typeof buildTimetablePlacedBlocksByDay>
  hourRows: number[]
  bodyHeightPx: number
  catalogByCode: Map<string, CourseCatalogItem>
  onBlockClick: (section: AdminCourseSection, dayLabel: string) => void
}

function AdminTimetableWeekGrid({
  placedByDay,
  hourRows,
  bodyHeightPx,
  catalogByCode,
  onBlockClick,
}: AdminTimetableGridProps) {
  return (
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
                const codeKey = b.section.course_code.trim().toUpperCase()
                const cat = catalogByCode.get(codeKey)
                const preferredTitle = getPreferredCourseTitle(
                  cat ?? {
                    code: b.section.course_code,
                    eng_name: null,
                    chi_name: null,
                  },
                  b.section.schedule_track,
                )
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
                    onClick={() => onBlockClick(b.section, d.label)}
                  >
                    <span className="admin-timetable-v2__block-title">
                      {b.section.course_code} {b.section.section_code}
                    </span>
                    <span className="admin-timetable-v2__block-subtitle">
                      {preferredTitle}
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
  )
}

export function AdminSchedulingTimetablePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null)
  const [academicTermId, setAcademicTermId] = useState('')
  const [sections, setSections] = useState<AdminCourseSection[] | null>(null)
  const [courseCatalog, setCourseCatalog] = useState<CourseCatalogItem[] | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    section: AdminCourseSection
    dayLabel: string
  } | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      const [termOutcome, courseOutcome] = await Promise.allSettled([
        fetchAcademicTerms({ signal: ac.signal }),
        fetchCourses({ signal: ac.signal }),
      ])
      if (ac.signal.aborted) return

      const t = termOutcome.status === 'fulfilled' ? termOutcome.value : []
      const cat =
        courseOutcome.status === 'fulfilled' ? courseOutcome.value : []
      setTerms(t)
      setCourseCatalog(cat)

      if (termOutcome.status === 'rejected') {
        setError(
          termOutcome.reason instanceof Error
            ? termOutcome.reason.message
            : 'Could not load academic terms.',
        )
      } else {
        setError(null)
      }

      const sp = new URLSearchParams(window.location.search)
      const urlTerm = sp.get('term')?.trim() ?? ''
      const urlCourse = sp.get('course')?.trim() ?? ''
      const urlQ = sp.get('q') ?? ''

      const nextTerm =
        urlTerm && t.some((x) => x.id === urlTerm)
          ? urlTerm
          : t.length > 0
            ? t[0].id
            : ''

      setAcademicTermId(nextTerm)

      setSearchParams(
        (prev) => {
          const merged = applyAdminSchedulingToSearchParams(
            prev,
            {
              term: nextTerm,
              course: urlCourse,
              q: urlQ,
            },
            { clearEdit: false },
          )
          return merged
        },
        { replace: true },
      )
    })()
    return () => ac.abort()
  }, [setSearchParams])

  useEffect(() => {
    if (terms == null || terms.length === 0) return
    const t = searchParams.get('term')?.trim() ?? ''
    const termOk = t && terms.some((x) => x.id === t) ? t : null
    if (termOk == null) return
    setAcademicTermId((prev) => (termOk !== prev.trim() ? termOk : prev))
  }, [searchParams, terms])

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

  const enSections = useMemo(
    () => (sections ?? []).filter((s) => s.schedule_track !== 'CN'),
    [sections],
  )
  const cnSections = useMemo(
    () => (sections ?? []).filter((s) => s.schedule_track === 'CN'),
    [sections],
  )

  const placedByDayEn = useMemo(
    () => buildTimetablePlacedBlocksByDay(enSections),
    [enSections],
  )
  const placedByDayCn = useMemo(
    () => buildTimetablePlacedBlocksByDay(cnSections),
    [cnSections],
  )

  const bodyHeightPx = timetableBodyHeightPx()

  const catalogByCode = useMemo(() => {
    const m = new Map<string, CourseCatalogItem>()
    for (const c of courseCatalog ?? []) {
      const k = c.code.trim().toUpperCase()
      if (k !== '') m.set(k, c)
    }
    return m
  }, [courseCatalog])

  const termCatalogLabel =
    terms?.find((t) => t.id === academicTermId)?.term_label ?? null

  const timetableReturnSearch = searchParams.toString()

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">
          Scheduling Timetable
        </h1>
        <div className="admin-page__toolbar-actions admin-page__toolbar-actions--wrap">
          <Link
            to={{
              pathname: '/admin/course-sections',
              search: timetableReturnSearch ? `?${timetableReturnSearch}` : '',
            }}
            className="portal-btn portal-btn--secondary portal-btn--compact"
          >
            Back to Course Sections
          </Link>
          <label className="admin-field admin-field--inline">
            <span className="admin-field__label">Academic term</span>
            <select
              className="admin-input"
              value={academicTermId}
              onChange={(e) => {
                const v = e.target.value
                setAcademicTermId(v)
                setSearchParams(
                  (prev) =>
                    applyAdminSchedulingToSearchParams(
                      prev,
                      {
                        term: v,
                        course: prev.get('course')?.trim() ?? '',
                        q: prev.get('q') ?? '',
                      },
                      { clearEdit: false },
                    ),
                  { replace: true },
                )
              }}
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

      {!loading && sections != null && sections.length === 0 && error == null && (
        <>
          <h2 className="admin-page__subtitle" style={{ marginTop: '1rem' }}>
            {adminTimetableHeading('EN')}
          </h2>
          <p className="portal-text-muted" role="status">
            No English timetable sections scheduled for this term.
          </p>
          <h2 className="admin-page__subtitle" style={{ marginTop: '1.25rem' }}>
            {adminTimetableHeading('CN')}
          </h2>
          <p className="portal-text-muted" role="status">
            No Chinese timetable sections scheduled for this term.
          </p>
        </>
      )}

      {!loading && sections != null && sections.length > 0 && (
        <div className="portal-stack" style={{ gap: '2rem' }}>
          <div>
            <h2 className="admin-page__subtitle" style={{ marginBottom: '0.5rem' }}>
              {adminTimetableHeading('EN')}
            </h2>
            {enSections.length === 0 ? (
              <p className="portal-text-muted" role="status">
                No English timetable sections scheduled for this term.
              </p>
            ) : (
              <div className="admin-timetable-wrap">
                <AdminTimetableWeekGrid
                  placedByDay={placedByDayEn}
                  hourRows={hourRows}
                  bodyHeightPx={bodyHeightPx}
                  catalogByCode={catalogByCode}
                  onBlockClick={(section, dayLabel) =>
                    setDetail({ section, dayLabel })
                  }
                />
              </div>
            )}
          </div>
          <div>
            <h2 className="admin-page__subtitle" style={{ marginBottom: '0.5rem' }}>
              {adminTimetableHeading('CN')}
            </h2>
            {cnSections.length === 0 ? (
              <p className="portal-text-muted" role="status">
                No Chinese timetable sections scheduled for this term.
              </p>
            ) : (
              <div className="admin-timetable-wrap">
                <AdminTimetableWeekGrid
                  placedByDay={placedByDayCn}
                  hourRows={hourRows}
                  bodyHeightPx={bodyHeightPx}
                  catalogByCode={catalogByCode}
                  onBlockClick={(section, dayLabel) =>
                    setDetail({ section, dayLabel })
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}

      {detail != null && (
        <AdminCourseSectionDetailModal
          section={detail.section}
          courseCatalog={
            catalogByCode.get(detail.section.course_code.trim().toUpperCase()) ??
            null
          }
          dayColumnLabel={detail.dayLabel}
          termCatalogLabel={termCatalogLabel}
          academicTermId={academicTermId.trim() || null}
          returnSearch={timetableReturnSearch}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  )
}

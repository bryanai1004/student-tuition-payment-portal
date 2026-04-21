import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TimetableWeekGrid } from '../../components/timetable/TimetableWeekGrid'
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
  TIMETABLE_START_HOUR,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
type TimetableLangTab = 'en' | 'cn'

function hourRowLabel(hour: number): string {
  return formatTimeHmsForDisplay(`${hour}:00:00`)
}

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
    <TimetableWeekGrid
      placedWeekdays={placedByDay}
      hourRows={hourRows}
      bodyHeightPx={bodyHeightPx}
      weekdayLabel={(d) => d}
      hourLabel={(h) => hourRowLabel(h)}
      renderBlock={(b, d) => {
        const sec = b.source
        const colW = 100 / b.colCount
        const insetPx = 3
        const codeKey = sec.course_code.trim().toUpperCase()
        const cat = catalogByCode.get(codeKey)
        const preferredTitle = getPreferredCourseTitle(
          cat ?? {
            code: sec.course_code,
            eng_name: null,
            chi_name: null,
          },
          sec.schedule_track,
        )
        return (
          <button
            key={`${sec.id}-${d}-${b.startMin}-${b.colIndex}`}
            type="button"
            className="admin-timetable-v2__block"
            style={{
              top: b.topPx,
              height: b.heightPx,
              left: `calc(${colW * b.colIndex}% + ${insetPx}px)`,
              width: `calc(${colW}% - ${insetPx * 2}px)`,
            }}
            onClick={() => onBlockClick(sec, d)}
          >
            <span className="admin-timetable-v2__block-title">
              {sec.course_code} {sec.section_code}
            </span>
            <span className="admin-timetable-v2__block-subtitle">{preferredTitle}</span>
            <span className="admin-timetable-v2__block-meta">
              {formatTimeHmsForDisplay(sec.start_time)} – {formatTimeHmsForDisplay(sec.end_time)}
            </span>
            <span className="admin-timetable-v2__block-meta">
              {formatDeliveryModeForDisplay(sec.delivery_mode)}
            </span>
          </button>
        )
      }}
    />
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
    academicTermId: string
  } | null>(null)
  const [langTab, setLangTab] = useState<TimetableLangTab>('en')

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

  const detailTermCatalogLabel =
    detail == null
      ? null
      : terms?.find((t) => t.id === detail.academicTermId)?.term_label ?? null

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

      {error != null && (
        <p className="portal-text-muted" role="alert">
          {error}
        </p>
      )}

      {loading && <p className="portal-text-muted">Loading timetable…</p>}

      {!loading && sections != null && error == null && (
        <>
          <div className="portal-timetable-lang-head">
            <div
              className="portal-timetable-lang-tabs"
              role="tablist"
              aria-label="Timetable language"
            >
              <button
                type="button"
                role="tab"
                id="admin-sched-tt-tab-en"
                className="portal-timetable-lang-tab"
                aria-selected={langTab === 'en'}
                aria-controls="admin-sched-tt-panel-en"
                onClick={() => setLangTab('en')}
              >
                English Timetable
              </button>
              <button
                type="button"
                role="tab"
                id="admin-sched-tt-tab-cn"
                className="portal-timetable-lang-tab"
                aria-selected={langTab === 'cn'}
                aria-controls="admin-sched-tt-panel-cn"
                onClick={() => setLangTab('cn')}
              >
                Chinese Timetable
              </button>
            </div>
          </div>

          {langTab === 'en' ? (
            <div
              role="tabpanel"
              id="admin-sched-tt-panel-en"
              aria-labelledby="admin-sched-tt-tab-en"
            >
              {sections.length === 0 || enSections.length === 0 ? (
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
                      setDetail({
                        section,
                        dayLabel,
                        academicTermId: academicTermId.trim(),
                      })
                    }
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              role="tabpanel"
              id="admin-sched-tt-panel-cn"
              aria-labelledby="admin-sched-tt-tab-cn"
            >
              {sections.length === 0 || cnSections.length === 0 ? (
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
                      setDetail({
                        section,
                        dayLabel,
                        academicTermId: academicTermId.trim(),
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {detail != null && (
        <AdminCourseSectionDetailModal
          section={detail.section}
          courseCatalog={
            catalogByCode.get(detail.section.course_code.trim().toUpperCase()) ??
            null
          }
          dayColumnLabel={detail.dayLabel}
          termCatalogLabel={detailTermCatalogLabel}
          academicTermId={detail.academicTermId.trim() || null}
          returnSearch={timetableReturnSearch}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  )
}

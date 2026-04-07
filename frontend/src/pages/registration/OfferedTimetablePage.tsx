import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  fetchAdminCourseSections,
  fetchApiJson,
  type AdminCourseSection,
} from '../../lib/api'
import { formatDeliveryModeForDisplay } from '../../lib/deliveryMode'
import { formatTimeHmsForDisplay, formatTimeRangeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  buildTimetablePlacedBlocksByDay,
  STUDENT_REGISTRATION_TIMETABLE_GRID,
  TIMETABLE_ROW_HEIGHT_PX,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import {
  formatWeekdaysLongFromStored,
  type WeekdayFull,
} from '../../lib/weekdaySchedule'
import {
  getPreferredCourseTitle,
  getSecondaryCourseTitle,
} from '../../lib/courseDisplayName'
import { offeredTimetableHeading, scheduleTrackDetailLabel } from '../../lib/scheduleTrack'
import {
  courseBinSectionKey,
  useCourseBin,
  type CourseBinItem,
} from './CourseBinContext'
import {
  adminSectionToCourseBinItem,
  type CatalogCourseLite,
} from './sectionToCourseBinItem'
import { useRegistrationTermSearchParam } from './registrationTermSearch'

const OFFERED_GRID = STUDENT_REGISTRATION_TIMETABLE_GRID

const DAY_HEADERS: { full: WeekdayFull; label: string }[] = [
  { full: 'Monday', label: 'Monday' },
  { full: 'Tuesday', label: 'Tuesday' },
  { full: 'Wednesday', label: 'Wednesday' },
  { full: 'Thursday', label: 'Thursday' },
  { full: 'Friday', label: 'Friday' },
]

function cellText(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value).trim()
}

function isSectionInBin(items: CourseBinItem[], sec: AdminCourseSection): boolean {
  const k = courseBinSectionKey(sec.course_code, sec.section_code, sec.schedule_track)
  return items.some(
    (x) => courseBinSectionKey(x.course_code, x.section, x.schedule_track) === k,
  )
}

type OfferedWeekGridProps = {
  placedWeekdays: ReturnType<typeof buildTimetablePlacedBlocksByDay>
  hourRows: number[]
  bodyHeightPx: number
  catalogByCode: Map<string, CatalogCourseLite>
  binItems: CourseBinItem[]
  onSelectSection: (sec: AdminCourseSection) => void
}

function OfferedTimetableWeekGrid({
  placedWeekdays,
  hourRows,
  bodyHeightPx,
  catalogByCode,
  binItems,
  onSelectSection,
}: OfferedWeekGridProps) {
  const placed = placedWeekdays.slice(0, DAY_HEADERS.length)
  return (
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
                {formatTimeHmsForDisplay(`${h}:00:00`)}
              </div>
            ))}
          </div>
          {DAY_HEADERS.map((d, di) => (
            <div key={d.full} className="admin-timetable-v2__day-col">
              <div
                className="admin-timetable-v2__day-track"
                style={{ height: bodyHeightPx }}
              >
                {placed[di]!.map((b) => {
                  const colW = 100 / b.colCount
                  const insetPx = 3
                  const inBin = isSectionInBin(binItems, b.section)
                  const cat = catalogByCode.get(
                    cellText(b.section.course_code).toUpperCase(),
                  )
                  const preferredTitle = getPreferredCourseTitle(
                    cat ?? {
                      code: b.section.course_code,
                      eng_name: null,
                      chi_name: null,
                    },
                    b.section.schedule_track,
                  )
                  const labelCore = `${b.section.course_code} ${b.section.section_code}. ${preferredTitle}`
                  return (
                    <button
                      key={`${b.section.id}-${d.full}-${b.startMin}-${b.colIndex}`}
                      type="button"
                      className={[
                        'admin-timetable-v2__block',
                        'portal-offered-timetable__block',
                        inBin ? 'portal-offered-timetable__block--in-bin' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        top: b.topPx,
                        height: b.heightPx,
                        left: `calc(${colW * b.colIndex}% + ${insetPx}px)`,
                        width: `calc(${colW}% - ${insetPx * 2}px)`,
                      }}
                      onClick={() => onSelectSection(b.section)}
                      aria-label={
                        inBin
                          ? `${labelCore}, in CourseBin — open details`
                          : `View details for ${labelCore}`
                      }
                    >
                      <span className="admin-timetable-v2__block-title">
                        {b.section.course_code} {b.section.section_code}
                        {inBin ? (
                          <span className="portal-offered-timetable__badge"> Added</span>
                        ) : null}
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
    </div>
  )
}

export function OfferedTimetablePage() {
  const registrationTermId = useRegistrationTermSearchParam()
  const { items: binItems, addToCourseBin, removeFromCourseBin } = useCourseBin()
  const [detailSection, setDetailSection] = useState<AdminCourseSection | null>(null)
  const [sections, setSections] = useState<AdminCourseSection[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogCourseLite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 2800)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      try {
        const data: unknown = await fetchApiJson('/api/courses', { signal: ac.signal })
        if (!Array.isArray(data)) {
          throw new Error('Unexpected course catalog response.')
        }
        if (!ac.signal.aborted) {
          setCatalog(data as CatalogCourseLite[])
        }
      } catch (e) {
        if (ac.signal.aborted) return
        console.error('[offered-timetable] catalog load failed', e)
        setCatalog([])
      }
    })()
    return () => ac.abort()
  }, [])

  const catalogByCode = useMemo(() => {
    const m = new Map<string, CatalogCourseLite>()
    for (const c of catalog) {
      const code = cellText(c.code)
      if (code !== '') m.set(code.toUpperCase(), c)
    }
    return m
  }, [catalog])

  useEffect(() => {
    const tid = registrationTermId?.trim() ?? ''
    if (tid === '') {
      setSections([])
      setLoading(false)
      setError(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void (async () => {
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
          e instanceof Error ? e.message : 'Could not load the offered timetable.',
        )
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [registrationTermId])

  const hourRows = useMemo(() => {
    const sh = OFFERED_GRID.startHour ?? 8
    const eh = OFFERED_GRID.endHour ?? 18
    return Array.from({ length: eh - sh + 1 }, (_, i) => sh + i)
  }, [])

  const enSections = useMemo(
    () => (sections ?? []).filter((s) => s.schedule_track !== 'CN'),
    [sections],
  )
  const cnSections = useMemo(
    () => (sections ?? []).filter((s) => s.schedule_track === 'CN'),
    [sections],
  )

  const placedEn = useMemo(
    () => buildTimetablePlacedBlocksByDay(enSections, OFFERED_GRID),
    [enSections],
  )
  const placedCn = useMemo(
    () => buildTimetablePlacedBlocksByDay(cnSections, OFFERED_GRID),
    [cnSections],
  )

  const bodyHeightPx = timetableBodyHeightPx(OFFERED_GRID)

  const handleConfirmAddFromModal = useCallback(() => {
    if (detailSection == null) return
    if (isSectionInBin(binItems, detailSection)) return
    const cat = catalogByCode.get(cellText(detailSection.course_code).toUpperCase())
    addToCourseBin(adminSectionToCourseBinItem(detailSection, cat))
    showToast('Added to CourseBin')
    setDetailSection(null)
  }, [addToCourseBin, binItems, catalogByCode, detailSection, showToast])

  const handleConfirmRemoveFromModal = useCallback(() => {
    if (detailSection == null) return
    removeFromCourseBin(
      detailSection.course_code,
      detailSection.section_code,
      detailSection.schedule_track,
    )
    showToast('Removed from CourseBin')
    setDetailSection(null)
  }, [detailSection, removeFromCourseBin, showToast])

  useEffect(() => {
    if (detailSection == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailSection(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailSection])

  const termMissing = registrationTermId == null || registrationTermId.trim() === ''

  const detailCatalog = detailSection
    ? catalogByCode.get(cellText(detailSection.course_code).toUpperCase())
    : undefined
  const detailTitleFields = {
    code: detailSection?.course_code,
    eng_name: detailCatalog ? cellText(detailCatalog.eng_name) : null,
    chi_name: detailCatalog ? cellText(detailCatalog.chi_name) : null,
  }
  const detailPrimaryTitle =
    detailSection != null
      ? getPreferredCourseTitle(detailTitleFields, detailSection.schedule_track)
      : ''
  const detailAlternateTitle =
    detailSection != null
      ? getSecondaryCourseTitle(detailTitleFields, detailSection.schedule_track)
      : ''
  const detailInBin =
    detailSection != null && isSectionInBin(binItems, detailSection)

  return (
    <main
      className="portal-page portal-offered-timetable"
      data-registration-term={registrationTermId ?? undefined}
    >
      {toast != null && (
        <div className="portal-offered-timetable__toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <section className="portal-card portal-stack" aria-labelledby="offered-timetable-heading">
        <h2 id="offered-timetable-heading" className="portal-section-heading">
          Offered Timetable
        </h2>
        <p className="portal-text-muted" style={{ marginTop: 0 }}>
          Registrar-scheduled sections for the selected term (Monday–Friday, 8:00 a.m.–9:00 p.m.).
          Click a block to view details, then add or remove the section from your CourseBin. Sections
          outside this window or without valid meeting times are hidden.
        </p>

        {termMissing && (
          <p className="portal-text-muted" role="status">
            Select an academic term above to view offerings.
          </p>
        )}

        {error != null && (
          <p className="portal-text-muted" role="alert">
            {error}
          </p>
        )}

        {!termMissing && loading && (
          <p className="portal-text-muted" role="status">
            Loading timetable…
          </p>
        )}

        {!termMissing && !loading && sections != null && sections.length === 0 && error == null && (
          <>
            <p className="portal-text-muted" role="status">
              No sections are scheduled for this term yet.
            </p>
            <h3 className="portal-section-heading" style={{ marginTop: '1.25rem' }}>
              {offeredTimetableHeading('EN')}
            </h3>
            <p className="portal-text-muted" role="status">
              No English timetable sections scheduled for this term.
            </p>
            <h3 className="portal-section-heading" style={{ marginTop: '1.25rem' }}>
              {offeredTimetableHeading('CN')}
            </h3>
            <p className="portal-text-muted" role="status">
              No Chinese timetable sections scheduled for this term.
            </p>
          </>
        )}

        {!termMissing && !loading && sections != null && sections.length > 0 && (
          <div className="portal-stack" style={{ gap: '2rem' }}>
            <div>
              <h3 className="portal-section-heading" style={{ marginBottom: '0.5rem' }}>
                {offeredTimetableHeading('EN')}
              </h3>
              {enSections.length === 0 ? (
                <p className="portal-text-muted" role="status">
                  No English timetable sections scheduled for this term.
                </p>
              ) : (
                <OfferedTimetableWeekGrid
                  placedWeekdays={placedEn}
                  hourRows={hourRows}
                  bodyHeightPx={bodyHeightPx}
                  catalogByCode={catalogByCode}
                  binItems={binItems}
                  onSelectSection={setDetailSection}
                />
              )}
            </div>
            <div>
              <h3 className="portal-section-heading" style={{ marginBottom: '0.5rem' }}>
                {offeredTimetableHeading('CN')}
              </h3>
              {cnSections.length === 0 ? (
                <p className="portal-text-muted" role="status">
                  No Chinese timetable sections scheduled for this term.
                </p>
              ) : (
                <OfferedTimetableWeekGrid
                  placedWeekdays={placedCn}
                  hourRows={hourRows}
                  bodyHeightPx={bodyHeightPx}
                  catalogByCode={catalogByCode}
                  binItems={binItems}
                  onSelectSection={setDetailSection}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {detailSection != null && (
        <div
          className="portal-offered-section-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailSection(null)
          }}
        >
          <div
            className="portal-offered-section-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offered-section-detail-title"
          >
            <h2 id="offered-section-detail-title" className="portal-offered-section-modal__title">
              {detailSection.course_code} · {detailSection.section_code}
            </h2>
            <dl className="portal-offered-section-modal__dl">
              <div>
                <dt>Course code</dt>
                <dd>{detailSection.course_code}</dd>
              </div>
              {detailPrimaryTitle !== '' && detailPrimaryTitle !== '—' ? (
                <div>
                  <dt>Course title</dt>
                  <dd>{detailPrimaryTitle}</dd>
                </div>
              ) : null}
              {detailAlternateTitle !== '' ? (
                <div>
                  <dt>Alternate title</dt>
                  <dd>{detailAlternateTitle}</dd>
                </div>
              ) : null}
              <div>
                <dt>Timetable track</dt>
                <dd>{scheduleTrackDetailLabel(detailSection.schedule_track)}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>{detailSection.section_code}</dd>
              </div>
              <div>
                <dt>Weekdays</dt>
                <dd>{formatWeekdaysLongFromStored(detailSection.weekday)}</dd>
              </div>
              <div>
                <dt>Time</dt>
                <dd>
                  {formatTimeRangeHmsForDisplay(detailSection.start_time, detailSection.end_time)}
                </dd>
              </div>
              <div>
                <dt>Delivery mode</dt>
                <dd>{formatDeliveryModeForDisplay(detailSection.delivery_mode)}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{detailSection.room?.trim() ? detailSection.room : '—'}</dd>
              </div>
              <div>
                <dt>Instructor</dt>
                <dd>{detailSection.instructor?.trim() ? detailSection.instructor : '—'}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{detailSection.notes?.trim() ? detailSection.notes : '—'}</dd>
              </div>
            </dl>
            <div className="portal-offered-section-modal__actions">
              {detailInBin ? (
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary portal-btn--compact"
                  onClick={handleConfirmRemoveFromModal}
                >
                  Remove from CourseBin
                </button>
              ) : (
                <button
                  type="button"
                  className="portal-btn portal-btn--primary portal-btn--compact"
                  onClick={handleConfirmAddFromModal}
                >
                  Add to CourseBin
                </button>
              )}
              <button
                type="button"
                className="portal-btn portal-btn--compact"
                onClick={() => setDetailSection(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

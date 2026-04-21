import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStudentPortalT } from '@/LanguageContext'
import type { StudentPortalKey } from '@/lib/i18n'
import { TimetableWeekGrid } from '../../components/timetable/TimetableWeekGrid'
import {
  fetchAdminCourseSections,
  fetchApiJson,
  type AdminCourseSection,
} from '../../lib/api'
import { formatDeliveryModeForDisplay } from '../../lib/deliveryMode'
import { formatTimeHmsForDisplay, formatTimeRangeHmsForDisplay } from '../../lib/formatScheduleTime'
import { formatPrerequisiteCourseDisplay } from '../../lib/prerequisiteCourse'
import {
  buildTimetablePlacedBlocksByDay,
  STUDENT_REGISTRATION_TIMETABLE_GRID,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import { formatWeekdaysLongFromStored, type WeekdayFull } from '../../lib/weekdaySchedule'
import {
  getPreferredCourseTitle,
  getSecondaryCourseTitle,
} from '../../lib/courseDisplayName'
import {
  normalizeScheduleTrackValue,
  scheduleTrackDetailLabel,
} from '../../lib/scheduleTrack'
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

type TimetableLangTab = 'en' | 'cn'

const WEEKDAY_FULL_TO_LABEL: Record<WeekdayFull, StudentPortalKey> = {
  Monday: 'weekdayMonday',
  Tuesday: 'weekdayTuesday',
  Wednesday: 'weekdayWednesday',
  Thursday: 'weekdayThursday',
  Friday: 'weekdayFriday',
  Saturday: 'weekdaySaturday',
  Sunday: 'weekdaySunday',
}

function weekdayColumnLabel(full: WeekdayFull, t: (key: StudentPortalKey) => string): string {
  return t(WEEKDAY_FULL_TO_LABEL[full])
}

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
  t: (key: StudentPortalKey) => string
}

function OfferedTimetableWeekGrid({
  placedWeekdays,
  hourRows,
  bodyHeightPx,
  catalogByCode,
  binItems,
  onSelectSection,
  t,
}: OfferedWeekGridProps) {
  return (
    <div className="admin-timetable-wrap">
      <TimetableWeekGrid
        placedWeekdays={placedWeekdays}
        hourRows={hourRows}
        bodyHeightPx={bodyHeightPx}
        weekdayLabel={(d) => weekdayColumnLabel(d, t)}
        hourLabel={(h) => formatTimeHmsForDisplay(`${h}:00:00`)}
        renderBlock={(b, d) => {
          const sec = b.source
          const colW = 100 / b.colCount
          const insetPx = 3
          const inBin = isSectionInBin(binItems, sec)
          const cat = catalogByCode.get(cellText(sec.course_code).toUpperCase())
          const preferredTitle = getPreferredCourseTitle(
            cat ?? {
              code: sec.course_code,
              eng_name: null,
              chi_name: null,
            },
            sec.schedule_track,
          )
          const labelCore = `${sec.course_code} ${sec.section_code}. ${preferredTitle}`
          const ariaInBin = t('offeredInCourseBinOpenDetails').replace('{label}', labelCore)
          const ariaDefault = t('offeredViewDetailsFor').replace('{label}', labelCore)
          return (
            <button
              key={`${sec.id}-${d}-${b.startMin}-${b.colIndex}`}
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
              onClick={() => onSelectSection(sec)}
              aria-label={inBin ? ariaInBin : ariaDefault}
            >
              <span className="admin-timetable-v2__block-title">
                {sec.course_code} {sec.section_code}
                {inBin ? (
                  <span className="portal-offered-timetable__badge">{t('offeredAddedBadge')}</span>
                ) : null}
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
    </div>
  )
}

export function OfferedTimetablePage() {
  const t = useStudentPortalT()
  const registrationTermId = useRegistrationTermSearchParam()
  const { items: binItems, addToCourseBin, removeFromCourseBin } = useCourseBin()
  const [detailSection, setDetailSection] = useState<AdminCourseSection | null>(null)
  const [sections, setSections] = useState<AdminCourseSection[] | null>(null)
  const [catalog, setCatalog] = useState<CatalogCourseLite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [langTab, setLangTab] = useState<TimetableLangTab>('en')
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
          throw new Error(t('unexpectedCatalogOffered'))
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
  }, [t])

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
          e instanceof Error ? e.message : t('couldNotLoadOfferedTimetable'),
        )
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [registrationTermId, t])

  const hourRows = useMemo(() => {
    const sh = OFFERED_GRID.startHour ?? 8
    const eh = OFFERED_GRID.endHour ?? 18
    return Array.from({ length: eh - sh + 1 }, (_, i) => sh + i)
  }, [])

  const englishSections = useMemo(
    () =>
      (sections ?? []).filter(
        (s) => normalizeScheduleTrackValue(s.schedule_track) !== 'CN',
      ),
    [sections],
  )
  const chineseSections = useMemo(
    () =>
      (sections ?? []).filter(
        (s) => normalizeScheduleTrackValue(s.schedule_track) === 'CN',
      ),
    [sections],
  )

  const placedEn = useMemo(
    () => buildTimetablePlacedBlocksByDay(englishSections, OFFERED_GRID),
    [englishSections],
  )
  const placedCn = useMemo(
    () => buildTimetablePlacedBlocksByDay(chineseSections, OFFERED_GRID),
    [chineseSections],
  )

  const bodyHeightPx = timetableBodyHeightPx(OFFERED_GRID)

  const handleConfirmAddFromModal = useCallback(() => {
    if (detailSection == null) return
    if (isSectionInBin(binItems, detailSection)) return
    const cat = catalogByCode.get(cellText(detailSection.course_code).toUpperCase())
    addToCourseBin(adminSectionToCourseBinItem(detailSection, cat))
    showToast(t('toastAddedToCourseBin'))
    setDetailSection(null)
  }, [addToCourseBin, binItems, catalogByCode, detailSection, showToast, t])

  const handleConfirmRemoveFromModal = useCallback(() => {
    if (detailSection == null) return
    removeFromCourseBin(
      detailSection.course_code,
      detailSection.section_code,
      detailSection.schedule_track,
    )
    showToast(t('toastRemovedFromCourseBin'))
    setDetailSection(null)
  }, [detailSection, removeFromCourseBin, showToast, t])

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
  const detailPrerequisiteDisplay = formatPrerequisiteCourseDisplay({
    courseCode: detailSection?.prerequisite_course_code,
    courseTitle: detailSection?.prerequisite_course_title,
  })

  const showTimetableTabs =
    !termMissing &&
    !loading &&
    sections != null &&
    error == null

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
        <div className="portal-offered-timetable__title-row">
          <h2 id="offered-timetable-heading" className="portal-section-heading">
            {t('offeredTimetableHeading')}
          </h2>
          {showTimetableTabs ? (
            <div
              className="portal-timetable-lang-tabs"
              role="tablist"
              aria-label={t('offeredTimetableLanguageAria')}
            >
              <button
                type="button"
                role="tab"
                id="offered-tt-tab-en"
                className="portal-timetable-lang-tab"
                aria-selected={langTab === 'en'}
                aria-controls="offered-tt-panel-en"
                onClick={() => setLangTab('en')}
              >
                {t('offeredTimetableTabEnglish')}
              </button>
              <button
                type="button"
                role="tab"
                id="offered-tt-tab-cn"
                className="portal-timetable-lang-tab"
                aria-selected={langTab === 'cn'}
                aria-controls="offered-tt-panel-cn"
                onClick={() => setLangTab('cn')}
              >
                {t('offeredTimetableTabChinese')}
              </button>
            </div>
          ) : null}
        </div>

        {termMissing && (
          <p className="portal-text-muted" role="status">
            {t('offeredSelectTermForOfferings')}
          </p>
        )}

        {error != null && (
          <p className="portal-text-muted" role="alert">
            {error}
          </p>
        )}

        {!termMissing && loading && (
          <p className="portal-text-muted" role="status">
            {t('offeredLoadingTimetable')}
          </p>
        )}

        {showTimetableTabs && langTab === 'en' ? (
          <div
            role="tabpanel"
            id="offered-tt-panel-en"
            aria-labelledby="offered-tt-tab-en"
          >
            {sections!.length === 0 || englishSections.length === 0 ? (
              <p className="portal-text-muted" role="status">
                {t('offeredNoEnglishSections')}
              </p>
            ) : (
              <OfferedTimetableWeekGrid
                placedWeekdays={placedEn}
                hourRows={hourRows}
                bodyHeightPx={bodyHeightPx}
                catalogByCode={catalogByCode}
                binItems={binItems}
                onSelectSection={setDetailSection}
                t={t}
              />
            )}
          </div>
        ) : null}

        {showTimetableTabs && langTab === 'cn' ? (
          <div
            role="tabpanel"
            id="offered-tt-panel-cn"
            aria-labelledby="offered-tt-tab-cn"
          >
            {sections!.length === 0 || chineseSections.length === 0 ? (
              <p className="portal-text-muted" role="status">
                {t('offeredNoChineseSections')}
              </p>
            ) : (
              <OfferedTimetableWeekGrid
                placedWeekdays={placedCn}
                hourRows={hourRows}
                bodyHeightPx={bodyHeightPx}
                catalogByCode={catalogByCode}
                binItems={binItems}
                onSelectSection={setDetailSection}
                t={t}
              />
            )}
          </div>
        ) : null}
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
                <dt>{t('offeredModalDtCourseCode')}</dt>
                <dd>{detailSection.course_code}</dd>
              </div>
              {detailPrimaryTitle !== '' && detailPrimaryTitle !== '—' ? (
                <div>
                  <dt>{t('offeredModalDtCourseTitle')}</dt>
                  <dd>{detailPrimaryTitle}</dd>
                </div>
              ) : null}
              {detailAlternateTitle !== '' ? (
                <div>
                  <dt>{t('offeredModalDtAlternateTitle')}</dt>
                  <dd>{detailAlternateTitle}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t('prerequisiteLabel')}</dt>
                <dd>{detailPrerequisiteDisplay ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtTimetableTrack')}</dt>
                <dd>{scheduleTrackDetailLabel(detailSection.schedule_track)}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtSection')}</dt>
                <dd>{detailSection.section_code}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtWeekdays')}</dt>
                <dd>{formatWeekdaysLongFromStored(detailSection.weekday)}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtTime')}</dt>
                <dd>
                  {formatTimeRangeHmsForDisplay(detailSection.start_time, detailSection.end_time)}
                </dd>
              </div>
              <div>
                <dt>{t('offeredModalDtDeliveryMode')}</dt>
                <dd>{formatDeliveryModeForDisplay(detailSection.delivery_mode)}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtRoom')}</dt>
                <dd>{detailSection.room?.trim() ? detailSection.room : '—'}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtInstructor')}</dt>
                <dd>{detailSection.instructor?.trim() ? detailSection.instructor : '—'}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtNotes')}</dt>
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
                  {t('removeFromCourseBin')}
                </button>
              ) : (
                <button
                  type="button"
                  className="portal-btn portal-btn--primary portal-btn--compact"
                  onClick={handleConfirmAddFromModal}
                >
                  {t('addToCourseBin')}
                </button>
              )}
              <button
                type="button"
                className="portal-btn portal-btn--compact"
                onClick={() => setDetailSection(null)}
              >
                {t('gcalModalClose')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

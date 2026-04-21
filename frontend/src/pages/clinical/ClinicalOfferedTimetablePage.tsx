import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import type { StudentPortalKey } from '@/lib/i18n'
import { TimetableWeekGrid } from '../../components/timetable/TimetableWeekGrid'
import {
  fetchClinicalOfferedTimetable,
  fetchCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  type AcademicTerm,
} from '../../lib/api'
import { clinicalOfferedSlotsToLayoutRows } from '../../lib/clinicalTimetableAdapter'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  buildPlacedBlocksByDayForLayout,
  STUDENT_REGISTRATION_TIMETABLE_GRID,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import { type WeekdayFull } from '../../lib/weekdaySchedule'
import {
  mergeTermOptions,
  readRegistrationTermIdFromSearch,
  resolveSelectedRegistrationTermId,
} from '../registration/registrationTermSearch'

const CLINICAL_OFFERED_GRID = STUDENT_REGISTRATION_TIMETABLE_GRID

const WEEKDAY_FULL_TO_LABEL: Record<WeekdayFull, StudentPortalKey> = {
  Monday: 'weekdayMonday',
  Tuesday: 'weekdayTuesday',
  Wednesday: 'weekdayWednesday',
  Thursday: 'weekdayThursday',
  Friday: 'weekdayFriday',
  Saturday: 'weekdaySaturday',
  Sunday: 'weekdaySunday',
}

function weekdayColumnLabel(
  full: WeekdayFull,
  t: (key: StudentPortalKey) => string,
): string {
  return t(WEEKDAY_FULL_TO_LABEL[full])
}

export function ClinicalOfferedTimetablePage() {
  const t = useStudentPortalT()
  const [searchParams] = useSearchParams()
  const [recentTerms, setRecentTerms] = useState<AcademicTerm[]>([])
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null)
  const [termsReady, setTermsReady] = useState(false)
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof fetchClinicalOfferedTimetable>>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = useMemo(
    () => mergeTermOptions(recentTerms, currentTerm),
    [recentTerms, currentTerm],
  )

  const urlTerm = readRegistrationTermIdFromSearch(searchParams)
  const selectedTermId = resolveSelectedRegistrationTermId(urlTerm, options, currentTerm)
  const selectedTerm = useMemo(
    () => options.find((x) => x.id === selectedTermId) ?? null,
    [options, selectedTermId],
  )

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      try {
        const [recentR, currentR] = await Promise.all([
          fetchRecentAcademicTerms(3, { signal: ac.signal }),
          fetchCurrentAcademicTerm({ signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setRecentTerms(recentR)
        setCurrentTerm(currentR)
      } catch {
        if (ac.signal.aborted) return
        setRecentTerms([])
        setCurrentTerm(null)
      } finally {
        if (!ac.signal.aborted) setTermsReady(true)
      }
    })()
    return () => ac.abort()
  }, [])

  useEffect(() => {
    if (!termsReady || selectedTerm == null) {
      setSlots([])
      setLoading(false)
      setError(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const rows = await fetchClinicalOfferedTimetable({
          term: selectedTerm.term_name,
          year: selectedTerm.year,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setSlots(rows)
      } catch (e) {
        if (ac.signal.aborted) return
        setSlots([])
        setError(
          e instanceof Error ? e.message : t('clinicalOfferedTimetableLoadError'),
        )
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [termsReady, selectedTerm, t])

  const layoutRows = useMemo(() => clinicalOfferedSlotsToLayoutRows(slots), [slots])

  const placedWeekdays = useMemo(
    () => buildPlacedBlocksByDayForLayout(layoutRows, CLINICAL_OFFERED_GRID),
    [layoutRows],
  )

  const hourRows = useMemo(() => {
    const sh = CLINICAL_OFFERED_GRID.startHour ?? 8
    const eh = CLINICAL_OFFERED_GRID.endHour ?? 21
    return Array.from({ length: eh - sh + 1 }, (_, i) => sh + i)
  }, [])

  const bodyHeightPx = timetableBodyHeightPx(CLINICAL_OFFERED_GRID)

  return (
    <main
      className="portal-page portal-clinical-offered-timetable"
      data-registration-term={selectedTermId.trim() || undefined}
    >
      <section className="portal-card portal-stack" aria-labelledby="clinical-offered-tt-heading">
        <h2 id="clinical-offered-tt-heading" className="portal-section-heading">
          {t('clinicalOfferedTimetableHeading')}
        </h2>
        <p className="portal-text-muted" style={{ marginTop: 0 }}>
          {t('clinicalOfferedTimetableLede')}
        </p>

        {!termsReady && (
          <p className="portal-text-muted" role="status">
            {t('loadingTerms')}
          </p>
        )}

        {termsReady && options.length === 0 && (
          <p className="portal-text-muted" role="status">
            {t('noAcademicTermsAvailable')}
          </p>
        )}

        {error != null && (
          <p className="portal-text-muted" role="alert">
            {error}
          </p>
        )}

        {selectedTerm != null && loading && (
          <p className="portal-text-muted" role="status">
            {t('clinicalOfferedTimetableLoading')}
          </p>
        )}

        {selectedTerm != null && !loading && error == null && layoutRows.length === 0 && (
          <p className="portal-text-muted" role="status">
            {t('clinicalOfferedTimetableEmpty')}
          </p>
        )}

        {selectedTerm != null && !loading && error == null && layoutRows.length > 0 && (
          <div className="portal-clinical-offered-timetable__scroll">
            <div className="admin-timetable-wrap portal-clinical-offered-timetable__inner">
              <TimetableWeekGrid
                rootClassName="portal-clinical-offered-timetable__grid"
                placedWeekdays={placedWeekdays}
                hourRows={hourRows}
                bodyHeightPx={bodyHeightPx}
                weekdayLabel={(d) => weekdayColumnLabel(d, t)}
                hourLabel={(h) => formatTimeHmsForDisplay(`${h}:00:00`)}
                renderBlock={(b, d) => {
                  const row = b.source
                  const colW = 100 / b.colCount
                  const insetPx = 3
                  return (
                    <button
                      key={`${row.timetableId}-${d}-${b.startMin}-${b.colIndex}`}
                      type="button"
                      className="admin-timetable-v2__block portal-clinical-offered-timetable__block"
                      style={{
                        top: b.topPx,
                        height: b.heightPx,
                        left: `calc(${colW * b.colIndex}% + ${insetPx}px)`,
                        width: `calc(${colW}% - ${insetPx * 2}px)`,
                      }}
                      onClick={() => {
                        console.log('[clinical-offered-timetable] slot', row.timetableId, row)
                      }}
                    >
                      <span className="admin-timetable-v2__block-title">
                        {row.clinicDisplayName}
                      </span>
                      <span className="admin-timetable-v2__block-meta">
                        {formatTimeHmsForDisplay(row.start_time)} –{' '}
                        {formatTimeHmsForDisplay(row.end_time)}
                      </span>
                      {row.facultyDisplay ? (
                        <span className="admin-timetable-v2__block-meta">{row.facultyDisplay}</span>
                      ) : null}
                      {row.seatsDisplay ? (
                        <span className="admin-timetable-v2__block-meta">{row.seatsDisplay}</span>
                      ) : null}
                    </button>
                  )
                }}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

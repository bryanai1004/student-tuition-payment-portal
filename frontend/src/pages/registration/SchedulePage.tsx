import { useEffect, useMemo, useState } from 'react'
import { useStudentPortalT } from '@/LanguageContext'
import type { StudentPortalKey } from '@/lib/i18n'
import { TimetableWeekGrid } from '../../components/timetable/TimetableWeekGrid'
import { useAccount } from '../../context/AccountContext'
import { fetchStudentEnrolledSections } from '../../lib/api'
import { getPreferredCourseTitle } from '../../lib/courseDisplayName'
import { formatDeliveryModeForDisplay } from '../../lib/deliveryMode'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  buildTimetablePlacedBlocksByDay,
  STUDENT_REGISTRATION_TIMETABLE_GRID,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import { WEEKDAYS_FULL_ORDERED, type WeekdayFull } from '../../lib/weekdaySchedule'
import { courseBinSectionKey, useCourseBin, type CourseBinItem } from './CourseBinContext'
import { partitionCourseBinItemsForTimetable } from './courseBinSchedule'
import { useRegistrationTermSearchParam } from './registrationTermSearch'
import { adminSectionToCourseBinItem } from './sectionToCourseBinItem'

const MY_GRID = STUDENT_REGISTRATION_TIMETABLE_GRID

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

export function SchedulePage() {
  const t = useStudentPortalT()
  const registrationTermId = useRegistrationTermSearchParam()
  const { currentStudentId, isAuthenticated } = useAccount()
  const { items } = useCourseBin()
  const [enrolledItems, setEnrolledItems] = useState<CourseBinItem[]>([])
  const [enrolledError, setEnrolledError] = useState<string | null>(null)

  const termKey = registrationTermId?.trim() ?? ''
  const studentKey = currentStudentId?.trim() ?? ''

  useEffect(() => {
    if (termKey === '' || !isAuthenticated || studentKey === '') {
      setEnrolledItems([])
      setEnrolledError(null)
      return
    }
    const ac = new AbortController()
    ;(async () => {
      try {
        const { sections } = await fetchStudentEnrolledSections(studentKey, termKey, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setEnrolledItems(sections.map((r) => adminSectionToCourseBinItem(r, undefined)))
        setEnrolledError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setEnrolledItems([])
        setEnrolledError(
          e instanceof Error ? e.message : t('couldNotLoadEnrolledSections'),
        )
      }
    })()
    return () => ac.abort()
  }, [termKey, studentKey, isAuthenticated, t])

  const displayItems = useMemo(() => {
    const map = new Map<string, CourseBinItem>()
    for (const it of enrolledItems) {
      map.set(
        courseBinSectionKey(it.course_code, it.section, it.schedule_track),
        it,
      )
    }
    for (const it of items) {
      map.set(
        courseBinSectionKey(it.course_code, it.section, it.schedule_track),
        it,
      )
    }
    return [...map.values()]
  }, [enrolledItems, items])

  const preferredCourseTitleByBinKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of displayItems) {
      const k = courseBinSectionKey(it.course_code, it.section, it.schedule_track)
      m.set(
        k,
        getPreferredCourseTitle(
          {
            code: it.course_code,
            eng_name: it.eng_name,
            chi_name: it.chi_name,
          },
          it.schedule_track,
        ),
      )
    }
    return m
  }, [displayItems])

  const { sections, unplaced } = useMemo(
    () => partitionCourseBinItemsForTimetable(displayItems),
    [displayItems],
  )

  const hourRows = useMemo(() => {
    const sh = MY_GRID.startHour ?? 8
    const eh = MY_GRID.endHour ?? 21
    return Array.from({ length: eh - sh + 1 }, (_, i) => sh + i)
  }, [])

  const placedByDayFull = useMemo(
    () => buildTimetablePlacedBlocksByDay(sections, MY_GRID),
    [sections],
  )

  const placedWeekdays = useMemo(
    () => placedByDayFull.slice(0, WEEKDAYS_FULL_ORDERED.length),
    [placedByDayFull],
  )

  const bodyHeightPx = timetableBodyHeightPx(MY_GRID)

  const termMissing = registrationTermId == null || registrationTermId.trim() === ''

  const tba = t('scheduleTba')

  return (
    <main
      className="portal-page portal-my-timetable-page"
      data-registration-term={registrationTermId ?? undefined}
    >
      <section className="portal-card portal-stack" aria-labelledby="timetable-heading">
        <h2 id="timetable-heading" className="portal-section-heading">
          {t('registrationMyTimetableHeading')}
        </h2>
        <p className="portal-text-muted" style={{ marginTop: 0 }}>
          {t('registrationSchedulePageLede')}
        </p>

        {termMissing && (
          <p className="portal-text-muted" role="status">
            {t('registrationScheduleSelectTermAbove')}
          </p>
        )}

        {enrolledError != null && !termMissing && (
          <p className="portal-text-muted" role="status">
            {enrolledError}
          </p>
        )}

        {!termMissing && displayItems.length === 0 && (
          <p className="portal-text-muted" role="status">
            {t('registrationScheduleEmpty')}
          </p>
        )}

        {!termMissing && displayItems.length > 0 && sections.length === 0 && (
          <p className="portal-text-muted" role="status">
            {t('registrationScheduleNoPlaceable')}
          </p>
        )}

        {!termMissing && sections.length > 0 && (
          <div className="admin-timetable-wrap">
            <TimetableWeekGrid
              rootClassName="portal-my-timetable-v2"
              placedWeekdays={placedWeekdays}
              hourRows={hourRows}
              bodyHeightPx={bodyHeightPx}
              weekdayLabel={(d) => weekdayColumnLabel(d, t)}
              hourLabel={(h) => formatTimeHmsForDisplay(`${h}:00:00`)}
              renderBlock={(b, d) => {
                const sec = b.source
                const colW = 100 / b.colCount
                const insetPx = 3
                const binKey = courseBinSectionKey(
                  sec.course_code,
                  sec.section_code,
                  sec.schedule_track,
                )
                const courseTitle =
                  preferredCourseTitleByBinKey.get(binKey) ?? sec.course_code
                const ariaLabel = t('registrationTimetableBlockAria')
                  .replace('{code}', String(sec.course_code))
                  .replace('{section}', String(sec.section_code))
                  .replace('{title}', courseTitle)
                return (
                  <div
                    key={`${sec.id}-${d}-${b.startMin}-${b.colIndex}`}
                    className="admin-timetable-v2__block portal-my-timetable__block"
                    style={{
                      top: b.topPx,
                      height: b.heightPx,
                      left: `calc(${colW * b.colIndex}% + ${insetPx}px)`,
                      width: `calc(${colW}% - ${insetPx * 2}px)`,
                    }}
                    role="group"
                    aria-label={ariaLabel}
                  >
                    <span className="admin-timetable-v2__block-title">
                      {sec.course_code} {sec.section_code}
                    </span>
                    <span className="admin-timetable-v2__block-subtitle">{courseTitle}</span>
                    <span className="admin-timetable-v2__block-meta">
                      {formatTimeHmsForDisplay(sec.start_time)} – {formatTimeHmsForDisplay(sec.end_time)}
                    </span>
                    {sec.instructor?.trim() ? (
                      <span className="admin-timetable-v2__block-meta">{sec.instructor}</span>
                    ) : null}
                    {sec.room?.trim() ? (
                      <span className="admin-timetable-v2__block-meta">{sec.room}</span>
                    ) : null}
                    {sec.delivery_mode?.trim() ? (
                      <span className="admin-timetable-v2__block-meta">
                        {formatDeliveryModeForDisplay(sec.delivery_mode)}
                      </span>
                    ) : null}
                  </div>
                )
              }}
            />
          </div>
        )}

        {!termMissing && unplaced.length > 0 && (
          <div className="portal-my-timetable-unplaced portal-stack">
            <h3 className="portal-my-timetable-unplaced__title">{t('registrationScheduleUnplacedTitle')}</h3>
            <p className="portal-text-muted" style={{ marginTop: 0 }}>
              {t('registrationScheduleUnplacedHelp')}
            </p>
            <ul className="portal-my-timetable-unplaced__list">
              {unplaced.map((u) => (
                <li
                  key={courseBinSectionKey(
                    u.course_code,
                    u.section,
                    u.schedule_track,
                  )}
                >
                  <strong>{u.course_code.trim() || '—'}</strong>
                  {u.section.trim() ? ` · ${u.section}` : ''}
                  {' · '}
                  {getPreferredCourseTitle(
                    {
                      code: u.course_code,
                      eng_name: u.eng_name,
                      chi_name: u.chi_name,
                    },
                    u.schedule_track,
                  )}
                  {u.time.trim() && u.time !== tba ? ` · ${u.time}` : ''}
                  {u.days.trim() && u.days !== tba ? ` · ${u.days}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  )
}

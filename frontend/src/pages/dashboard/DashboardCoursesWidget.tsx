import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../../context/AccountContext'
import {
  fetchAcademicTerms,
  fetchCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  fetchStudentEnrolledSections,
  fetchStudentRegisteredScheduleRowsForTerm,
  type AcademicTerm,
} from '../../lib/api'
import { enrolledSectionsToScheduleRows } from '../../lib/enrolledSectionsToScheduleRows'
import { resolveAcademicTermIdForPortalTerm } from '../../lib/resolveAcademicTermIdForPortalTerm'
import { mergeTermOptions } from '../registration/registrationTermSearch'
import {
  currentTermLabel,
  formatPortalCourseInstructor,
  formatPortalCourseLocation,
  noCurrentCoursesMessage,
} from '../../lib/academicCourseRecordsDisplay'
import {
  accountScheduleRowsHaveWeekGridData,
  blockVerticalStyle,
  buildWeekTimetableFromScheduleRows,
  formatBlockTimeRange24,
  formatHourLabel,
  hourTickMinutes,
  type WeekTimetableModel,
  WEEKDAY_LONG_LABEL,
  WEEKDAY_SHORT_LABEL,
} from '../../lib/dashboardWeekTimetable'
import type { MahmAccountMock } from '../../mock/mahmAccountMock'
import type { ScheduleRow } from '../../types/billing'

type CalendarView = 'list' | 'week'

type CalendarWeekTermKey = { term: string; year: number }

type DashboardWeekTermOption = CalendarWeekTermKey & {
  label: string
  /** When known (registration term list or resolved from academic terms), drives enrolled-sections fetch. */
  academicTermId?: string
}

function termKeysEqual(a: CalendarWeekTermKey, b: CalendarWeekTermKey): boolean {
  return (
    a.year === b.year && a.term.trim().toLowerCase() === b.term.trim().toLowerCase()
  )
}

function normalizedWeekTermCacheKey(t: CalendarWeekTermKey): string {
  return `${t.term.trim().toLowerCase()}|${t.year}`
}

/**
 * Split free-text location into building/place (line 1) and room/suite/virtual detail (line 2).
 * Handles trailing room numbers, trailing "Suite", and parenthetical qualifiers (e.g. synchronous virtual).
 */
function splitLocationDisplay(raw: string): { line1: string; line2: string } {
  const s = raw.trim()
  if (!s) return { line1: '', line2: '' }

  const paren = s.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (paren) {
    return { line1: paren[1]!.trim(), line2: `(${paren[2]!})` }
  }

  const words = s.split(/\s+/)
  if (words.length >= 2) {
    const last = words[words.length - 1]!
    if (/^\d+[A-Za-z]?$/.test(last)) {
      return { line1: words.slice(0, -1).join(' '), line2: last }
    }
    if (last.toLowerCase() === 'suite') {
      return { line1: words.slice(0, -1).join(' '), line2: last }
    }
  }

  return { line1: s, line2: '' }
}

function LocationCell({ location }: { location: string }) {
  const { line1, line2 } = splitLocationDisplay(location)
  return (
    <div className="portal-dashboard-courses-location-stack">
      <span className="portal-dashboard-courses-location-building">{line1}</span>
      {line2 ? <span className="portal-dashboard-courses-location-detail">{line2}</span> : null}
    </div>
  )
}

/**
 * Parse meeting text into card blocks: days (line 1) + time range (line 2).
 * Semicolons separate distinct meeting patterns (e.g. Mon/Thu blocks).
 */
function parseScheduleBlocks(schedule: string): { line1: string; line2: string }[] {
  const parts = schedule
    .split(/\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const timeTail = /^(.+?),\s*(\d{1,2}:\d{2}\s*(?:AM|PM)\s*[–-]\s*\d{1,2}:\d{2}\s*(?:AM|PM))\s*$/i
  const blocks: { line1: string; line2: string }[] = []
  for (const part of parts) {
    const m = part.match(timeTail)
    if (m) {
      blocks.push({ line1: m[1]!.trim(), line2: m[2]!.trim() })
    } else {
      blocks.push({ line1: part, line2: '' })
    }
  }
  return blocks.length ? blocks : [{ line1: schedule.trim(), line2: '' }]
}

function ScheduleCell({ schedule }: { schedule: string }) {
  const blocks = parseScheduleBlocks(schedule)
  return (
    <div className="portal-dashboard-courses-schedule-stack">
      {blocks.map((b, i) => (
        <div key={i} className="portal-dashboard-courses-schedule-block">
          <span className="portal-dashboard-courses-schedule-day">{b.line1}</span>
          {b.line2 ? <span className="portal-dashboard-courses-schedule-time">{b.line2}</span> : null}
        </div>
      ))}
    </div>
  )
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function WeekGridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9h18M9 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function scheduleRowKey(row: ScheduleRow, index: number): string {
  const code = row.courseCode?.trim() || 'course'
  return `${code}-${index}`
}

function browseTermDisplayLabel(account: MahmAccountMock): string {
  const t = account.student.term?.trim()
  const y = account.student.year
  const match = account.availableScheduleTerms?.find(
    (x) => x.term.trim().toLowerCase() === t.toLowerCase() && x.year === y,
  )
  if (match?.label?.trim()) return match.label.trim()
  return currentTermLabel(
    t && Number.isFinite(y) && y > 0 ? { term: t, year: y } : null,
  )
}

function scheduleTermOptionValue(term: string, year: number): string {
  return `${term.trim()}|${year}`
}

function DashboardWeekTimetableMobileList({ model }: { model: WeekTimetableModel }) {
  const { visibleDays, blocksByDay } = model

  return (
    <div className="portal-dashboard-courses-timetable-mobile" aria-label="Weekly timetable, list view">
      {visibleDays.map((day) => (
        <section key={day} className="portal-dashboard-courses-timetable-mobile-day">
          <h3 className="portal-dashboard-courses-timetable-mobile-day-title">
            {WEEKDAY_LONG_LABEL[day]}
          </h3>
          {blocksByDay[day].length === 0 ? (
            <p className="portal-dashboard-courses-timetable-mobile-empty">No classes</p>
          ) : (
            <ul className="portal-dashboard-courses-timetable-mobile-slots">
              {blocksByDay[day].map((block, bi) => (
                <li
                  key={`${day}-${block.courseCode}-${block.startMinutes}-${bi}`}
                  className="portal-dashboard-courses-timetable-mobile-slot"
                >
                  <span className="portal-dashboard-courses-timetable-mobile-time">
                    {formatBlockTimeRange24(block)}
                  </span>
                  <span className="portal-dashboard-courses-timetable-mobile-course">
                    <strong className="portal-dashboard-courses-timetable-mobile-code">
                      {block.courseCode}
                    </strong>
                    {block.subtitle ? (
                      <span className="portal-dashboard-courses-timetable-mobile-title">
                        {' '}
                        {block.subtitle}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

function DashboardWeekTimetableGrid({ model }: { model: WeekTimetableModel }) {
  const { visibleDays, gridStartMinutes, gridEndMinutes, blocksByDay } = model
  const colCount = visibleDays.length
  const ticks = hourTickMinutes(gridStartMinutes, gridEndMinutes)
  const hourBands = (gridEndMinutes - gridStartMinutes) / 60

  return (
    <div
      className="portal-dashboard-courses-timetable portal-dashboard-courses-timetable--grid"
      style={
        {
          gridTemplateColumns: `var(--portal-timetable-time-col) repeat(${colCount}, 1fr)`,
          '--portal-timetable-hour-bands': String(hourBands),
        } as CSSProperties
      }
    >
      <div
        className="portal-dashboard-courses-timetable-corner"
        style={{ gridColumn: 1, gridRow: 1 }}
        aria-hidden
      />
      {visibleDays.map((day, i) => (
        <div
          key={day}
          className="portal-dashboard-courses-timetable-dayhead"
          style={{ gridColumn: i + 2, gridRow: 1 }}
        >
          {WEEKDAY_SHORT_LABEL[day]}
        </div>
      ))}
      <div
        className="portal-dashboard-courses-timetable-timecol"
        style={{ gridColumn: 1, gridRow: 2 }}
      >
        {ticks.map((t) => (
          <span key={t} className="portal-dashboard-courses-timetable-time-label">
            {formatHourLabel(t)}
          </span>
        ))}
      </div>
      {visibleDays.map((day, i) => (
        <div
          key={day}
          className="portal-dashboard-courses-timetable-daycol"
          style={{ gridColumn: i + 2, gridRow: 2 }}
        >
          <div className="portal-dashboard-courses-timetable-track">
            {blocksByDay[day].map((block, bi) => {
              const pos = blockVerticalStyle(block, gridStartMinutes, gridEndMinutes)
              return (
                <div
                  key={`${day}-${block.courseCode}-${block.startMinutes}-${bi}`}
                  className="portal-dashboard-courses-timetable-block"
                  style={{ top: pos.top, height: pos.height }}
                  aria-label={`${block.courseCode}, ${formatHourLabel(block.startMinutes)} to ${formatHourLabel(
                    block.endMinutes,
                  )}`}
                >
                  <span className="portal-dashboard-courses-timetable-code">{block.courseCode}</span>
                  {block.subtitle ? (
                    <span className="portal-dashboard-courses-timetable-subtitle">{block.subtitle}</span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardCoursesWidget() {
  const [view, setView] = useState<CalendarView>('week')
  const [calendarWeekTerm, setCalendarWeekTerm] = useState<CalendarWeekTermKey | null>(null)
  const [weekTermRows, setWeekTermRows] = useState<ScheduleRow[] | null>(null)
  const [weekFetchLoading, setWeekFetchLoading] = useState(false)
  const [weekFetchError, setWeekFetchError] = useState(false)
  const weekTermRowsCacheRef = useRef<Map<string, ScheduleRow[]>>(new Map())
  /** Same merge as registration layout when account `availableScheduleTerms` is empty. */
  const [registrationMergedScheduleTerms, setRegistrationMergedScheduleTerms] = useState<
    Array<{ term: string; year: number; label: string; academicTermId: string }>
  >([])
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([])
  const [academicTermsLoading, setAcademicTermsLoading] = useState(false)

  const { account, fetchedAccount, loading, isAuthenticated, currentStudentId } = useAccount()

  useEffect(() => {
    setCalendarWeekTerm(null)
    setWeekTermRows(null)
    setWeekFetchLoading(false)
    setWeekFetchError(false)
    weekTermRowsCacheRef.current.clear()
  }, [currentStudentId])

  const accountScheduleTerms = account.availableScheduleTerms ?? []
  const accountHasScheduleTermOptions = accountScheduleTerms.length > 0

  useEffect(() => {
    if (accountHasScheduleTermOptions) {
      setRegistrationMergedScheduleTerms([])
      return
    }
    if (!isAuthenticated) {
      setRegistrationMergedScheduleTerms([])
      return
    }
    const ac = new AbortController()
    void (async () => {
      const recentP = fetchRecentAcademicTerms(3, { signal: ac.signal })
      const currentP = fetchCurrentAcademicTerm({ signal: ac.signal })
      const [recentR, currentR] = await Promise.allSettled([recentP, currentP])
      if (ac.signal.aborted) return

      let recent: Awaited<ReturnType<typeof fetchRecentAcademicTerms>> = []
      let current: Awaited<ReturnType<typeof fetchCurrentAcademicTerm>> = null
      if (recentR.status === 'fulfilled') recent = recentR.value
      if (currentR.status === 'fulfilled') current = currentR.value

      const merged = mergeTermOptions(recent, current)
      if (ac.signal.aborted) return
      setRegistrationMergedScheduleTerms(
        merged.map((t) => ({
          term: t.term_name,
          year: t.year,
          label:
            t.term_label?.trim() ||
            currentTermLabel({ term: t.term_name, year: t.year }),
          academicTermId: t.id,
        })),
      )
    })()
    return () => ac.abort()
  }, [accountHasScheduleTermOptions, isAuthenticated])

  /** Map browse term+year → academic term id when the account lists terms without ids (portal enrollments API). */
  useEffect(() => {
    if (!isAuthenticated || !accountHasScheduleTermOptions) {
      setAcademicTerms([])
      setAcademicTermsLoading(false)
      return
    }
    const ac = new AbortController()
    setAcademicTermsLoading(true)
    void (async () => {
      try {
        const terms = await fetchAcademicTerms({ signal: ac.signal })
        if (ac.signal.aborted) return
        setAcademicTerms(terms)
      } catch {
        if (ac.signal.aborted) return
        setAcademicTerms([])
      } finally {
        if (!ac.signal.aborted) setAcademicTermsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [accountHasScheduleTermOptions, isAuthenticated])

  const registration = account.registration
  const browseLabel = browseTermDisplayLabel(account)
  const weekTermSelectOptions: DashboardWeekTermOption[] = useMemo(() => {
    if (accountHasScheduleTermOptions) {
      return accountScheduleTerms.map((o) => ({ ...o }))
    }
    return registrationMergedScheduleTerms.map((o) => ({
      term: o.term,
      year: o.year,
      label: o.label,
      academicTermId: o.academicTermId,
    }))
  }, [accountHasScheduleTermOptions, accountScheduleTerms, registrationMergedScheduleTerms])

  const weekTermSelectOptionsResolved = useMemo((): DashboardWeekTermOption[] => {
    return weekTermSelectOptions.map((o) => ({
      ...o,
      academicTermId:
        o.academicTermId?.trim() ||
        resolveAcademicTermIdForPortalTerm(academicTerms, o.term, o.year) ||
        undefined,
    }))
  }, [weekTermSelectOptions, academicTerms])

  const listScheduleRows = account.scheduleRows

  const isLoadingAccount = Boolean(loading && isAuthenticated)

  const schedulePayloadStudent = useMemo(() => {
    if (!isAuthenticated) return account.student
    if (fetchedAccount) return fetchedAccount.student
    return account.student
  }, [isAuthenticated, account.student, fetchedAccount])

  const defaultTermFromAccount = useMemo((): CalendarWeekTermKey | null => {
    const term = schedulePayloadStudent.term?.trim() ?? ''
    const year = Number(schedulePayloadStudent.year)
    if (!term || !Number.isFinite(year) || year <= 0) return null
    return { term, year }
  }, [schedulePayloadStudent.term, schedulePayloadStudent.year])

  const resolvedWeekTerm = calendarWeekTerm ?? defaultTermFromAccount

  const usePayloadRowsForWeek = Boolean(
    resolvedWeekTerm &&
      defaultTermFromAccount &&
      termKeysEqual(resolvedWeekTerm, defaultTermFromAccount),
  )

  useEffect(() => {
    if (!isAuthenticated || !currentStudentId?.trim() || view !== 'week') {
      setWeekTermRows(null)
      setWeekFetchLoading(false)
      setWeekFetchError(false)
      return
    }
    if (resolvedWeekTerm == null || defaultTermFromAccount == null) {
      setWeekTermRows(null)
      setWeekFetchLoading(false)
      return
    }
    if (termKeysEqual(resolvedWeekTerm, defaultTermFromAccount)) {
      setWeekTermRows(null)
      setWeekFetchLoading(false)
      setWeekFetchError(false)
      return
    }

    const cacheKey = normalizedWeekTermCacheKey(resolvedWeekTerm)
    const cached = weekTermRowsCacheRef.current.get(cacheKey)
    if (cached) {
      setWeekTermRows(cached)
      setWeekFetchLoading(false)
      setWeekFetchError(false)
      return
    }

    const ac = new AbortController()
    setWeekFetchLoading(true)
    setWeekFetchError(false)
    setWeekTermRows(null)

    ;(async () => {
      try {
        const rows = await fetchStudentRegisteredScheduleRowsForTerm(
          currentStudentId.trim(),
          resolvedWeekTerm.term,
          resolvedWeekTerm.year,
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
        weekTermRowsCacheRef.current.set(cacheKey, rows)
        setWeekTermRows(rows)
      } catch {
        if (ac.signal.aborted) return
        setWeekTermRows([])
        setWeekFetchError(true)
      } finally {
        if (!ac.signal.aborted) setWeekFetchLoading(false)
      }
    })()

    return () => ac.abort()
  }, [
    currentStudentId,
    defaultTermFromAccount?.term,
    defaultTermFromAccount?.year,
    isAuthenticated,
    resolvedWeekTerm?.term,
    resolvedWeekTerm?.year,
    view,
  ])

  const weekScheduleLoading =
    isAuthenticated &&
    view === 'week' &&
    resolvedWeekTerm != null &&
    defaultTermFromAccount != null &&
    !termKeysEqual(resolvedWeekTerm, defaultTermFromAccount) &&
    weekFetchLoading

  const effectiveWeekRows: ScheduleRow[] = weekScheduleLoading
    ? []
    : usePayloadRowsForWeek
      ? account.scheduleRows
      : (weekTermRows ?? [])

  const weekTermDisplayLabel =
    resolvedWeekTerm != null
      ? weekTermSelectOptions.find((x) => termKeysEqual(x, resolvedWeekTerm))?.label?.trim() ||
        currentTermLabel({ term: resolvedWeekTerm.term, year: resolvedWeekTerm.year })
      : ''

  const weekGridSourceRows =
    resolvedWeekTerm == null ? [] : weekScheduleLoading ? [] : effectiveWeekRows
  const weekTimetableModel = buildWeekTimetableFromScheduleRows(weekGridSourceRows)
  const weekHasParsableMeetings = accountScheduleRowsHaveWeekGridData(effectiveWeekRows)

  const selectValue =
    resolvedWeekTerm != null
      ? scheduleTermOptionValue(resolvedWeekTerm.term, resolvedWeekTerm.year)
      : ''

  const showWeekTermSelect =
    !isLoadingAccount && view === 'week' && weekTermSelectOptions.length > 0

  const showListCourseTable =
    !isLoadingAccount &&
    registration.status === 'registered' &&
    view === 'list' &&
    listScheduleRows.length > 0

  const showWeekPanel = !isLoadingAccount && view === 'week'

  const showGlobalEmptyState = !isLoadingAccount && registration.status !== 'registered'

  return (
    <section className="portal-dashboard-courses" aria-labelledby="portal-dashboard-courses-heading">
      <header className="portal-dashboard-courses-head portal-dashboard-card-panel-head">
        <h2 id="portal-dashboard-courses-heading" className="portal-dashboard-card-panel-title">
          My Calendar
        </h2>
        <div className="portal-dashboard-courses-head-actions">
          {showWeekTermSelect ? (
            <div className="portal-dashboard-courses-head-term">
              <label htmlFor="portal-dashboard-courses-week-term-select" className="visually-hidden">
                Term for week view
              </label>
              <select
                id="portal-dashboard-courses-week-term-select"
                className="portal-account-ledger__select portal-dashboard-courses-head-term-select"
                value={selectValue}
                aria-label="Academic term for week timetable"
                onChange={(e) => {
                  const raw = e.target.value
                  const pipe = raw.indexOf('|')
                  if (pipe < 0) return
                  const term = raw.slice(0, pipe).trim()
                  const year = Number(raw.slice(pipe + 1))
                  if (!term || !Number.isFinite(year)) return
                  setCalendarWeekTerm({ term, year })
                }}
              >
                {weekTermSelectOptions.map((opt) => (
                  <option
                    key={scheduleTermOptionValue(opt.term, opt.year)}
                    value={scheduleTermOptionValue(opt.term, opt.year)}
                  >
                    {opt.label?.trim() ||
                      currentTermLabel({ term: opt.term, year: opt.year })}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div
            className="portal-dashboard-courses-view-tabs"
            role="tablist"
            aria-label="Calendar view"
          >
            <button
              type="button"
              role="tab"
              className="portal-dashboard-courses-view-tab"
              aria-selected={view === 'list'}
              id="portal-dashboard-calendar-tab-courses"
              onClick={() => setView('list')}
            >
              <ListIcon className="portal-dashboard-courses-view-tab-icon" />
              <span>Courses</span>
            </button>
            <button
              type="button"
              role="tab"
              className="portal-dashboard-courses-view-tab"
              aria-selected={view === 'week'}
              id="portal-dashboard-calendar-tab-week"
              onClick={() => setView('week')}
            >
              <WeekGridIcon className="portal-dashboard-courses-view-tab-icon" />
              <span>Week</span>
            </button>
          </div>
        </div>
      </header>
      <div className="portal-dashboard-card-panel-divider" aria-hidden />

      {isLoadingAccount ? (
        <div className="portal-dashboard-courses-loading" role="status">
          Loading your courses…
        </div>
      ) : null}

      {!isLoadingAccount && showGlobalEmptyState ? (
        <div className="portal-dashboard-courses-empty" aria-live="polite">
          <h3 className="portal-dashboard-courses-empty-title">No courses registered</h3>
          <p className="portal-dashboard-courses-empty-text">
            {registration.emptyReason?.trim()
              ? registration.emptyReason.trim()
              : noCurrentCoursesMessage(browseLabel)}
          </p>
          <Link to="/registration" className="portal-dashboard-courses-empty-cta">
            Go to Registration
          </Link>
        </div>
      ) : null}

      {!isLoadingAccount &&
      registration.status === 'registered' &&
      view === 'list' &&
      listScheduleRows.length === 0 ? (
        <p className="portal-text-muted portal-dashboard-courses-list-empty" role="status">
          No courses in your schedule for the current term.
        </p>
      ) : null}

      {!isLoadingAccount && showListCourseTable ? (
        <div className="portal-dashboard-courses-table-wrap">
          <table className="portal-dashboard-courses-table">
            <colgroup>
              <col className="portal-dashboard-courses-col-course" />
              <col className="portal-dashboard-courses-col-title" />
              <col className="portal-dashboard-courses-col-schedule" />
              <col className="portal-dashboard-courses-col-instructor" />
              <col className="portal-dashboard-courses-col-location" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Title</th>
                <th scope="col">Schedule</th>
                <th scope="col">Instructor</th>
                <th scope="col">Location</th>
              </tr>
            </thead>
            <tbody>
              {listScheduleRows.map((c, i) => {
                const sched =
                  c.schedule != null && String(c.schedule).trim() !== ''
                    ? String(c.schedule)
                    : '—'
                const loc = formatPortalCourseLocation(c.location)
                const inst = formatPortalCourseInstructor(c.instructor)
                return (
                  <tr key={scheduleRowKey(c, i)}>
                    <td className="portal-dashboard-courses-code">
                      <span className="portal-dashboard-courses-course-code">{c.courseCode}</span>
                    </td>
                    <td className="portal-dashboard-courses-title-cell">
                      <span className="portal-dashboard-courses-title-text">
                        {c.title?.trim() ? c.title.trim() : '—'}
                      </span>
                    </td>
                    <td className="portal-dashboard-courses-schedule">
                      <ScheduleCell schedule={sched} />
                    </td>
                    <td className="portal-dashboard-courses-instructor">{inst}</td>
                    <td className="portal-dashboard-courses-location">
                      <LocationCell location={loc} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {showWeekPanel ? (
        <div
          className="portal-dashboard-courses-week-panel"
          role="region"
          aria-label={
            weekTermDisplayLabel
              ? `Weekly timetable for ${weekTermDisplayLabel}`
              : 'Weekly timetable'
          }
        >
          {resolvedWeekTerm == null ? (
            <p className="portal-text-muted portal-dashboard-courses-week-status" role="status">
              No term available.
            </p>
          ) : null}

          {resolvedWeekTerm != null && weekScheduleLoading ? (
            <p className="portal-text-muted portal-dashboard-courses-week-status" role="status">
              Loading schedule…
            </p>
          ) : null}

          {resolvedWeekTerm != null && weekFetchError && !weekScheduleLoading ? (
            <p className="portal-text-muted portal-dashboard-courses-week-status" role="status">
              Could not load schedule.
            </p>
          ) : null}

          {resolvedWeekTerm != null &&
          !weekScheduleLoading &&
          !weekFetchError &&
          effectiveWeekRows.length === 0 ? (
            <p className="portal-text-muted portal-dashboard-courses-week-status" role="status">
              No scheduled classes for this term.
            </p>
          ) : null}

          {resolvedWeekTerm != null &&
          !weekScheduleLoading &&
          !weekFetchError &&
          effectiveWeekRows.length > 0 &&
          !weekHasParsableMeetings ? (
            <p className="portal-text-muted portal-dashboard-courses-week-status" role="status">
              Some courses do not include weekly times on this grid. Use the Courses tab for full
              meeting details.
            </p>
          ) : null}

          <div className="portal-dashboard-courses-timetable-wrap">
            <DashboardWeekTimetableMobileList model={weekTimetableModel} />
            <DashboardWeekTimetableGrid model={weekTimetableModel} />
          </div>
        </div>
      ) : null}

    </section>
  )
}

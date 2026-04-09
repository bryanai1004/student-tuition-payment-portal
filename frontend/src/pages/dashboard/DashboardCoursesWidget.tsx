import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchAcademicTerms,
  fetchCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  fetchStudentEnrolledSections,
  fetchStudentRegisteredScheduleRowsForTerm,
  type AcademicTerm,
  type StudentEnrolledSectionsScheduleMeta,
} from '../../lib/api'
import { enrolledSectionsToScheduleRows } from '../../lib/enrolledSectionsToScheduleRows'
import {
  buildDashboardGoogleCalendarExportModel,
  dashboardBlockGoogleCalendarPatternKey,
} from '../../lib/dashboardGoogleCalendarExport'
import { resolveAcademicTermIdForPortalTerm } from '../../lib/resolveAcademicTermIdForPortalTerm'
import { mergeTermOptions } from '../registration/registrationTermSearch'
import { currentTermLabel } from '../../lib/academicCourseRecordsDisplay'
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
import type { ScheduleRow } from '../../types/billing'
import { DashboardGoogleCalendarModal } from './DashboardGoogleCalendarModal'

type CalendarWeekTermKey = { term: string; year: number }

type DashboardWeekTermOption = CalendarWeekTermKey & {
  label: string
  /** When known (registration term list or resolved from academic terms), drives enrolled-sections fetch. */
  academicTermId?: string
  /** From academic term API when available; used for Google Calendar recurrence end. */
  start_date?: string | null
  end_date?: string | null
}

function termKeysEqual(a: CalendarWeekTermKey, b: CalendarWeekTermKey): boolean {
  return (
    a.year === b.year && a.term.trim().toLowerCase() === b.term.trim().toLowerCase()
  )
}

/** One cache entry per browse term+year regardless of enrolled-sections vs legacy account source. */
function normalizedWeekTermCacheKey(t: CalendarWeekTermKey): string {
  return `${t.term.trim().toLowerCase()}|${t.year}`
}

function errorIndicatesHttp404(e: unknown): boolean {
  return e instanceof Error && /\bHTTP\s+404\b/i.test(e.message)
}

type WeekTimetableCacheEntry = {
  rows: ScheduleRow[]
  /** From enrolled-sections when `academic_term_id` fetch; null when rows came from legacy account only. */
  scheduleMeta: StudentEnrolledSectionsScheduleMeta | null
  loadFailed: boolean
}

function scheduleTermOptionValue(term: string, year: number): string {
  return `${term.trim()}|${year}`
}

function DashboardWeekTimetableMobileList({
  model,
  gcalHrefByPattern,
}: {
  model: WeekTimetableModel
  gcalHrefByPattern?: Map<string, string>
}) {
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
              {blocksByDay[day].map((block, bi) => {
                const pk = dashboardBlockGoogleCalendarPatternKey(block)
                const gcalHref = gcalHrefByPattern?.get(pk)
                return (
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
                    {gcalHref ? (
                      <a
                        className="portal-text-link portal-dashboard-gcal-block-link portal-dashboard-gcal-block-link--mobile"
                        href={gcalHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Add to Google Calendar
                      </a>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

function DashboardWeekTimetableGrid({
  model,
  gcalHrefByPattern,
}: {
  model: WeekTimetableModel
  gcalHrefByPattern?: Map<string, string>
}) {
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
              const pk = dashboardBlockGoogleCalendarPatternKey(block)
              const gcalHref = gcalHrefByPattern?.get(pk)
              return (
                <div
                  key={`${day}-${block.courseCode}-${block.startMinutes}-${bi}`}
                  className="portal-dashboard-courses-timetable-block"
                  style={{ top: pos.top, height: pos.height }}
                  aria-label={`${block.courseCode}${
                    block.subtitle ? `, ${block.subtitle}` : ''
                  }, ${formatBlockTimeRange24(block)}`}
                >
                  <div className="portal-timetable-block-content">
                    <div className="portal-timetable-block-code">{block.courseCode}</div>
                    {block.subtitle ? (
                      <div className="portal-timetable-block-title">{block.subtitle}</div>
                    ) : null}
                    <div className="portal-timetable-block-time">{formatBlockTimeRange24(block)}</div>
                    {gcalHref ? (
                      <a
                        className="portal-text-link portal-dashboard-gcal-block-link"
                        href={gcalHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Add to Google Calendar"
                      >
                        Add to Google Calendar
                      </a>
                    ) : null}
                  </div>
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
  const [gcalModalOpen, setGcalModalOpen] = useState(false)
  const [calendarWeekTerm, setCalendarWeekTerm] = useState<CalendarWeekTermKey | null>(null)
  const [weekTermRows, setWeekTermRows] = useState<ScheduleRow[] | null>(null)
  const [weekFetchLoading, setWeekFetchLoading] = useState(false)
  const [weekFetchError, setWeekFetchError] = useState(false)
  const [weekScheduleMeta, setWeekScheduleMeta] =
    useState<StudentEnrolledSectionsScheduleMeta | null>(null)
  const weekTermRowsCacheRef = useRef<Map<string, WeekTimetableCacheEntry>>(new Map())
  /** Same merge as registration layout when account `availableScheduleTerms` is empty. */
  const [registrationMergedScheduleTerms, setRegistrationMergedScheduleTerms] = useState<
    Array<{
      term: string
      year: number
      label: string
      academicTermId: string
      start_date: string | null
      end_date: string | null
    }>
  >([])
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([])
  const [academicTermsLoading, setAcademicTermsLoading] = useState(false)

  const { account, fetchedAccount, loading, isAuthenticated, currentStudentId } = useAccount()

  useEffect(() => {
    setCalendarWeekTerm(null)
    setWeekTermRows(null)
    setWeekFetchLoading(false)
    setWeekFetchError(false)
    setWeekScheduleMeta(null)
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
          start_date: t.start_date,
          end_date: t.end_date,
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

  const weekTermSelectOptions: DashboardWeekTermOption[] = useMemo(() => {
    if (accountHasScheduleTermOptions) {
      return accountScheduleTerms.map((o) => ({
        term: o.term,
        year: o.year,
        label: o.label,
        ...(o.academicTermId?.trim() ? { academicTermId: o.academicTermId.trim() } : {}),
      }))
    }
    return registrationMergedScheduleTerms.map((o) => ({
      term: o.term,
      year: o.year,
      label: o.label,
      academicTermId: o.academicTermId,
    }))
  }, [accountHasScheduleTermOptions, accountScheduleTerms, registrationMergedScheduleTerms])

  const weekTermSelectOptionsResolved = useMemo((): DashboardWeekTermOption[] => {
    return weekTermSelectOptions.map((o) => {
      const resolvedId =
        o.academicTermId?.trim() ||
        resolveAcademicTermIdForPortalTerm(academicTerms, o.term, o.year) ||
        undefined
      const at = resolvedId ? academicTerms.find((x) => x.id === resolvedId) : undefined
      return {
        ...o,
        academicTermId: resolvedId,
        start_date: o.start_date ?? at?.start_date ?? null,
        end_date: o.end_date ?? at?.end_date ?? null,
      }
    })
  }, [weekTermSelectOptions, academicTerms])

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

  useEffect(() => {
    setGcalModalOpen(false)
  }, [resolvedWeekTerm?.term, resolvedWeekTerm?.year])

  const resolvedAcademicTermId = useMemo((): string | null => {
    if (!resolvedWeekTerm) return null
    const fromOpt = weekTermSelectOptionsResolved.find((x) =>
      termKeysEqual(x, resolvedWeekTerm),
    )
    const id = fromOpt?.academicTermId?.trim()
    if (id) return id
    return resolveAcademicTermIdForPortalTerm(
      academicTerms,
      resolvedWeekTerm.term,
      resolvedWeekTerm.year,
    )
  }, [resolvedWeekTerm, weekTermSelectOptionsResolved, academicTerms])

  const useAccountPayloadForWeek = Boolean(
    resolvedWeekTerm &&
      defaultTermFromAccount &&
      termKeysEqual(resolvedWeekTerm, defaultTermFromAccount) &&
      resolvedAcademicTermId == null,
  )

  useEffect(() => {
    if (!isAuthenticated || !currentStudentId?.trim()) {
      setWeekTermRows(null)
      setWeekFetchLoading(false)
      setWeekFetchError(false)
      setWeekScheduleMeta(null)
      return
    }
    if (resolvedWeekTerm == null) {
      setWeekTermRows(null)
      setWeekFetchLoading(false)
      setWeekScheduleMeta(null)
      return
    }
    if (accountHasScheduleTermOptions && academicTermsLoading) {
      setWeekFetchLoading(true)
      setWeekFetchError(false)
      setWeekTermRows(null)
      setWeekScheduleMeta(null)
      return
    }

    const termId = resolvedAcademicTermId
    const cacheKey = normalizedWeekTermCacheKey(resolvedWeekTerm)
    const cached = weekTermRowsCacheRef.current.get(cacheKey)
    if (cached) {
      setWeekTermRows(cached.rows)
      setWeekScheduleMeta(cached.scheduleMeta)
      setWeekFetchLoading(false)
      setWeekFetchError(cached.loadFailed)
      return
    }

    if (termId) {
      const ac = new AbortController()
      setWeekFetchLoading(true)
      setWeekFetchError(false)
      setWeekTermRows(null)
      setWeekScheduleMeta(null)
      ;(async () => {
        const sid = currentStudentId.trim()
        const qs = new URLSearchParams()
        qs.set('studentId', sid)
        qs.set('academic_term_id', termId)
        console.debug(
          '[dashboard My Calendar] enrolled-sections',
          `/api/student/enrolled-sections?${qs.toString()}`,
          { portalTerm: resolvedWeekTerm.term, portalYear: resolvedWeekTerm.year, academicTermId: termId },
        )
        let rows: ScheduleRow[] = []
        let scheduleMeta: StudentEnrolledSectionsScheduleMeta | null = null
        let loadFailed = false
        try {
          const { sections, scheduleMeta: meta } = await fetchStudentEnrolledSections(sid, termId, {
            signal: ac.signal,
          })
          if (ac.signal.aborted) return
          scheduleMeta = meta
          rows = enrolledSectionsToScheduleRows(sections)
          loadFailed = meta.scheduleQueryFailed === true
          if (loadFailed) {
            console.debug(
              '[dashboard My Calendar] enrolled-sections scheduleQueryFailed; trying legacy account schedule',
              { portalTerm: resolvedWeekTerm.term, portalYear: resolvedWeekTerm.year, academicTermId: termId },
            )
            try {
              rows = await fetchStudentRegisteredScheduleRowsForTerm(
                sid,
                resolvedWeekTerm.term,
                resolvedWeekTerm.year,
                { signal: ac.signal },
              )
              if (ac.signal.aborted) return
              scheduleMeta = null
              loadFailed = false
            } catch {
              if (ac.signal.aborted) return
              loadFailed = true
              rows = []
              scheduleMeta = null
            }
          }
        } catch {
          if (ac.signal.aborted) return
          console.debug(
            '[dashboard My Calendar] enrolled-sections failed; trying legacy account schedule',
            { portalTerm: resolvedWeekTerm.term, portalYear: resolvedWeekTerm.year },
          )
          try {
            rows = await fetchStudentRegisteredScheduleRowsForTerm(
              sid,
              resolvedWeekTerm.term,
              resolvedWeekTerm.year,
              { signal: ac.signal },
            )
            if (ac.signal.aborted) return
            scheduleMeta = null
            loadFailed = false
          } catch {
            if (ac.signal.aborted) return
            loadFailed = true
            rows = []
            scheduleMeta = null
          }
        }
        const entry: WeekTimetableCacheEntry = { rows, scheduleMeta, loadFailed }
        weekTermRowsCacheRef.current.set(cacheKey, entry)
        setWeekTermRows(rows)
        setWeekScheduleMeta(scheduleMeta)
        setWeekFetchError(loadFailed)
        if (!ac.signal.aborted) setWeekFetchLoading(false)
      })()
      return () => ac.abort()
    }

    if (
      defaultTermFromAccount != null &&
      termKeysEqual(resolvedWeekTerm, defaultTermFromAccount)
    ) {
      setWeekTermRows(null)
      setWeekFetchLoading(false)
      setWeekFetchError(false)
      setWeekScheduleMeta(null)
      return
    }

    const ac = new AbortController()
    setWeekFetchLoading(true)
    setWeekFetchError(false)
    setWeekTermRows(null)
    setWeekScheduleMeta(null)

    ;(async () => {
      const sid = currentStudentId.trim()
      const accountPath = `/api/students/${encodeURIComponent(sid)}/account?term=${encodeURIComponent(
        resolvedWeekTerm.term,
      )}&year=${encodeURIComponent(String(resolvedWeekTerm.year))}`
      console.debug('[dashboard My Calendar] legacy account schedule', accountPath)
      try {
        const rows = await fetchStudentRegisteredScheduleRowsForTerm(
          sid,
          resolvedWeekTerm.term,
          resolvedWeekTerm.year,
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
        const entry: WeekTimetableCacheEntry = {
          rows,
          scheduleMeta: null,
          loadFailed: false,
        }
        weekTermRowsCacheRef.current.set(cacheKey, entry)
        setWeekTermRows(rows)
        setWeekScheduleMeta(null)
        setWeekFetchError(false)
      } catch (e) {
        if (ac.signal.aborted) return
        const soft404 = errorIndicatesHttp404(e)
        const entry: WeekTimetableCacheEntry = {
          rows: [],
          scheduleMeta: null,
          loadFailed: !soft404,
        }
        weekTermRowsCacheRef.current.set(cacheKey, entry)
        setWeekTermRows([])
        setWeekScheduleMeta(null)
        setWeekFetchError(!soft404)
      } finally {
        if (!ac.signal.aborted) setWeekFetchLoading(false)
      }
    })()

    return () => ac.abort()
  }, [
    academicTermsLoading,
    accountHasScheduleTermOptions,
    currentStudentId,
    defaultTermFromAccount?.term,
    defaultTermFromAccount?.year,
    isAuthenticated,
    resolvedAcademicTermId,
    resolvedWeekTerm?.term,
    resolvedWeekTerm?.year,
  ])

  const weekScheduleLoading =
    isAuthenticated && resolvedWeekTerm != null && weekFetchLoading

  const effectiveWeekRows: ScheduleRow[] = weekScheduleLoading
    ? []
    : resolvedAcademicTermId != null
      ? (weekTermRows ?? [])
      : useAccountPayloadForWeek
        ? account.scheduleRows
        : (weekTermRows ?? [])

  const resolvedTermDateBounds = useMemo((): { start: string | null; end: string | null } => {
    if (resolvedWeekTerm == null) return { start: null, end: null }
    const opt = weekTermSelectOptionsResolved.find((x) => termKeysEqual(x, resolvedWeekTerm))
    const s = opt?.start_date?.trim() || null
    const e = opt?.end_date?.trim() || null
    if (s && e && /^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e)) {
      return { start: s, end: e }
    }
    return { start: null, end: null }
  }, [resolvedWeekTerm, weekTermSelectOptionsResolved])

  const gcalExport = useMemo(() => {
    if (resolvedWeekTerm == null) {
      return { batchItems: [], hrefByBlockPatternKey: new Map<string, string>() }
    }
    return buildDashboardGoogleCalendarExportModel(effectiveWeekRows, {
      term: resolvedWeekTerm.term,
      year: resolvedWeekTerm.year,
      start: resolvedTermDateBounds.start,
      end: resolvedTermDateBounds.end,
    })
  }, [
    effectiveWeekRows,
    resolvedWeekTerm,
    resolvedTermDateBounds.start,
    resolvedTermDateBounds.end,
  ])

  const gcalAddAllDisabled =
    isLoadingAccount ||
    resolvedWeekTerm == null ||
    weekScheduleLoading ||
    weekFetchError ||
    resolvedTermDateBounds.start == null ||
    resolvedTermDateBounds.end == null ||
    gcalExport.batchItems.length === 0

  const weekTermDisplayLabel =
    resolvedWeekTerm != null
      ? weekTermSelectOptionsResolved
          .find((x) => termKeysEqual(x, resolvedWeekTerm))
          ?.label?.trim() ||
        currentTermLabel({ term: resolvedWeekTerm.term, year: resolvedWeekTerm.year })
      : ''

  const weekGridSourceRows =
    resolvedWeekTerm == null ? [] : weekScheduleLoading ? [] : effectiveWeekRows
  const weekTimetableModel = buildWeekTimetableFromScheduleRows(weekGridSourceRows)
  const weekHasParsableMeetings = accountScheduleRowsHaveWeekGridData(effectiveWeekRows)

  /** Known active portal enrollment count for the selected week term when the API exposes it; null if unknown. */
  const portalEnrollmentHintCount = useMemo((): number | null => {
    if (resolvedWeekTerm == null) return null
    if (resolvedAcademicTermId != null) {
      if (weekScheduleMeta?.scheduleQueryFailed) return null
      if (weekFetchLoading) return null
      if (weekScheduleMeta == null) return null
      return weekScheduleMeta.activePortalEnrollmentCount
    }
    if (
      defaultTermFromAccount != null &&
      termKeysEqual(resolvedWeekTerm, defaultTermFromAccount)
    ) {
      const n = account.activePortalEnrollmentCountForBrowseTerm
      return typeof n === 'number' ? n : null
    }
    return null
  }, [
    resolvedWeekTerm,
    resolvedAcademicTermId,
    weekScheduleMeta,
    weekFetchLoading,
    defaultTermFromAccount,
    account.activePortalEnrollmentCountForBrowseTerm,
  ])

  const selectValue =
    resolvedWeekTerm != null
      ? scheduleTermOptionValue(resolvedWeekTerm.term, resolvedWeekTerm.year)
      : ''

  const showWeekTermSelect =
    !isLoadingAccount && weekTermSelectOptions.length > 0

  return (
    <section className="portal-dashboard-courses" aria-labelledby="portal-dashboard-courses-heading">
      <header className="portal-dashboard-courses-head portal-dashboard-card-panel-head">
        <h2 id="portal-dashboard-courses-heading" className="portal-dashboard-card-panel-title">
          My Calendar
        </h2>
        {!isLoadingAccount ? (
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
                  {weekTermSelectOptionsResolved.map((opt) => (
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
            <button
              type="button"
              className="portal-dashboard-gcal-add-all"
              disabled={gcalAddAllDisabled}
              onClick={() => setGcalModalOpen(true)}
            >
              Add all to Google Calendar
            </button>
          </div>
        ) : null}
      </header>
      <div className="portal-dashboard-card-panel-divider" aria-hidden />

      {isLoadingAccount ? (
        <div className="portal-dashboard-courses-loading" role="status">
          Loading your courses…
        </div>
      ) : null}

      {!isLoadingAccount ? (
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
          effectiveWeekRows.length === 0 &&
          portalEnrollmentHintCount != null &&
          portalEnrollmentHintCount > 0 ? (
            <p className="portal-text-muted portal-dashboard-courses-week-status" role="status">
              You are enrolled in courses for this term, but no scheduled section times are available
              yet.
            </p>
          ) : null}

          {resolvedWeekTerm != null &&
          !weekScheduleLoading &&
          !weekFetchError &&
          effectiveWeekRows.length === 0 &&
          !(portalEnrollmentHintCount != null && portalEnrollmentHintCount > 0) ? (
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
              Some courses do not include weekly times on this grid. Check Registration or Academics
              for more details.
            </p>
          ) : null}

          <div className="portal-dashboard-courses-timetable-wrap">
            <DashboardWeekTimetableMobileList
              model={weekTimetableModel}
              gcalHrefByPattern={gcalExport.hrefByBlockPatternKey}
            />
            <DashboardWeekTimetableGrid
              model={weekTimetableModel}
              gcalHrefByPattern={gcalExport.hrefByBlockPatternKey}
            />
          </div>
        </div>
      ) : null}

      {gcalModalOpen && gcalExport.batchItems.length > 0 ? (
        <DashboardGoogleCalendarModal
          title={`Add to Google Calendar${weekTermDisplayLabel ? ` — ${weekTermDisplayLabel}` : ''}`}
          items={gcalExport.batchItems}
          onClose={() => setGcalModalOpen(false)}
        />
      ) : null}

    </section>
  )
}

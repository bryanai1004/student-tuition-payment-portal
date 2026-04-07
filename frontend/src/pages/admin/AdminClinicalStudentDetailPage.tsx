import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAdminClinicalTimetable,
  fetchAdminStudentDetail,
  fetchStudentClinicalSchedule,
  postAdminClinicalAssign,
  type AdminClinicalTimetableSlot,
  type AdminStudentDetail,
  type ClinicalProgress,
  type ClinicalScheduleSession,
} from '../../lib/api'

function dashText(value: string | null | undefined): string {
  const s = value?.trim() ?? ''
  return s.length > 0 ? s : '—'
}

function clinicalReadinessLabel(readiness: ClinicalProgress['readiness']): string {
  return readiness === 'ready' ? 'Ready' : 'Not ready'
}

function clinicalHoursProgressPct(cp: ClinicalProgress): number {
  if (cp.requiredHours > 0) {
    return Math.min(100, Math.round((cp.completedHours / cp.requiredHours) * 100))
  }
  return cp.completedHours > 0 ? 100 : 0
}

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const TIMETABLE_PLACEHOLDER_DATE = '1900-01-01'

function formatScheduleDate(isoYmd: string): string {
  const m = ISO_YMD.exec(isoYmd.trim())
  if (!m) return isoYmd
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return isoYmd
  }
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isWeeklyTimetableSessionDate(sessionDate: string): boolean {
  const s = sessionDate.trim()
  return s.includes('· weekly') || s === TIMETABLE_PLACEHOLDER_DATE
}

/** Date column: real calendar dates formatted; weekly / placeholder never show 1900-01-01. */
function formatAssignedSessionDateCell(sessionDate: string): string {
  const s = sessionDate.trim()
  if (s === TIMETABLE_PLACEHOLDER_DATE) {
    return 'Weekly clinic (timetable)'
  }
  if (s.includes('· weekly')) {
    return s
  }
  if (!ISO_YMD.test(s)) {
    return s
  }
  return formatScheduleDate(s)
}

/** Site / faculty: unknown → —, explicit TBA preserved (normalized casing). */
function displayClinicalSiteOrFaculty(value: string | null | undefined): string {
  const raw = value?.trim() ?? ''
  if (raw === '') return '—'
  if (raw.toUpperCase() === 'TBA') return 'TBA'
  return raw
}

function displayAssignedSessionName(
  sessionDate: string,
  sessionName: string | null | undefined,
): string {
  const name = sessionName?.trim() ?? ''
  if (name !== '') return name
  if (isWeeklyTimetableSessionDate(sessionDate)) return 'Weekly slot'
  return '—'
}

function clinicalAssignmentStatusClass(status: string): string {
  const t = status.trim() || 'Scheduled'
  if (t === 'Confirmed') return 'portal-status portal-status--paid'
  if (t === 'Tentative') return 'portal-status portal-status--upcoming'
  return 'portal-status portal-status--pending'
}

export function AdminClinicalStudentDetailPage() {
  const { studentId: studentIdParam } = useParams<{ studentId: string }>()
  const studentId = studentIdParam ?? ''

  const [detail, setDetail] = useState<AdminStudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [timetableSlots, setTimetableSlots] = useState<AdminClinicalTimetableSlot[]>(
    [],
  )
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [timetableError, setTimetableError] = useState<string | null>(null)
  const [filterYear, setFilterYear] = useState<string>('')
  const [filterTerm, setFilterTerm] = useState<string>('')
  const [selectedSlotId, setSelectedSlotId] = useState<string>('')
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null)

  const [scheduleSessions, setScheduleSessions] = useState<
    ClinicalScheduleSession[]
  >([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleReloadKey, setScheduleReloadKey] = useState(0)

  useEffect(() => {
    if (!studentId.trim()) {
      setDetail(null)
      setLoading(false)
      setError('Missing student id.')
      return
    }

    const ac = new AbortController()
    setDetail(null)
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const d = await fetchAdminStudentDetail(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setDetail(d)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setDetail(null)
        setError(
          e instanceof Error ? e.message : 'Could not load clinical record.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [studentId, reloadKey])

  useEffect(() => {
    const ac = new AbortController()
    setTimetableLoading(true)
    setTimetableError(null)
    ;(async () => {
      try {
        const slots = await fetchAdminClinicalTimetable({
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setTimetableSlots(slots)
      } catch (e) {
        if (ac.signal.aborted) return
        setTimetableSlots([])
        setTimetableError(
          e instanceof Error
            ? e.message
            : 'Could not load clinic timetable slots.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setTimetableLoading(false)
        }
      }
    })()
    return () => ac.abort()
  }, [])

  const filteredTimetableSlots = useMemo(() => {
    return timetableSlots.filter((s) => {
      if (filterYear.trim() !== '' && String(s.year) !== filterYear.trim()) {
        return false
      }
      if (filterTerm.trim() !== '' && s.term !== filterTerm.trim()) {
        return false
      }
      return true
    })
  }, [timetableSlots, filterYear, filterTerm])

  useEffect(() => {
    if (selectedSlotId.trim() === '') return
    const id = Number(selectedSlotId)
    if (!filteredTimetableSlots.some((s) => s.id === id)) {
      setSelectedSlotId('')
    }
  }, [filteredTimetableSlots, selectedSlotId])

  const slotAssignDisabled =
    timetableLoading ||
    timetableError != null ||
    filteredTimetableSlots.length === 0

  useEffect(() => {
    if (!studentId.trim()) {
      setScheduleSessions([])
      setScheduleLoading(false)
      setScheduleError(null)
      return
    }

    const ac = new AbortController()
    setScheduleLoading(true)
    setScheduleError(null)

    ;(async () => {
      try {
        const sessions = await fetchStudentClinicalSchedule(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setScheduleSessions(sessions)
      } catch (e) {
        if (ac.signal.aborted) return
        setScheduleSessions([])
        setScheduleError(
          e instanceof Error
            ? e.message
            : 'Could not load assigned clinical sessions.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setScheduleLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [studentId, scheduleReloadKey])

  const sectionLoading = loading && detail === null && error === null
  const cp = detail?.clinicalProgress

  async function onAssignSubmit(ev: FormEvent) {
    ev.preventDefault()
    setAssignError(null)
    setAssignSuccess(null)
    const sid = studentId.trim()
    if (!sid) {
      setAssignError('Missing student id.')
      return
    }
    const tid = Number(selectedSlotId)
    if (!Number.isFinite(tid) || tid <= 0) {
      setAssignError('Select a clinic timetable slot.')
      return
    }
    setAssignSubmitting(true)
    try {
      await postAdminClinicalAssign({
        studentId: sid,
        timetableId: tid,
      })
      setSelectedSlotId('')
      setAssignSuccess('Session assigned.')
      setScheduleReloadKey((k) => k + 1)
    } catch (e) {
      setAssignError(
        e instanceof Error ? e.message : 'Could not assign clinical session.',
      )
    } finally {
      setAssignSubmitting(false)
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <div>
          <Link
            to="/admin/clinical"
            className="portal-text-muted"
            style={{ fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Clinical roster
          </Link>
          <h1 className="admin-page__title admin-page__title--inline">
            {detail?.name ?? 'Student'}
          </h1>
          {detail ? (
            <p
              className="portal-text-muted"
              style={{
                fontSize: '0.875rem',
                marginTop: '0.35rem',
                marginBottom: 0,
              }}
            >
              Student ID: {dashText(detail.studentId)}
              {' · '}
              Division: {dashText(detail.division)}
              {' · '}
              Latest registration term: {dashText(detail.latestRegistrationTerm)}
            </p>
          ) : null}
        </div>
      </div>

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading clinical record</p>
          <p className="portal-profile-state__detail">
            Please wait while we load this student&apos;s clinical progress from
            the school database.
          </p>
        </section>
      ) : null}

      {!sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">
            We could not load this clinical record
          </p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
            <Link to="/admin/clinical" className="portal-btn portal-btn--secondary">
              Back to clinical roster
            </Link>
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {!sectionLoading && !error && detail ? (
        <>
          <section
            className={`portal-card portal-stack${cp ? ' portal-academics-progress-card' : ''}`}
            aria-labelledby="admin-clinical-student-progress"
          >
            <h2
              id="admin-clinical-student-progress"
              className="portal-section-heading"
            >
              Clinical progress
            </h2>
            {cp == null ? (
              <p
                className="portal-card-note admin-detail-empty"
                role="status"
              >
                Clinical progress is not available for this student record.
              </p>
            ) : (
              <>
                <div className="portal-grid-4">
                  <div>
                    <p className="portal-card-label">Current level</p>
                    <p className="portal-card-value">
                      {!Number.isFinite(cp.level) || cp.level <= 0
                        ? 'Not started'
                        : `Level ${cp.level}`}
                    </p>
                  </div>
                  <div>
                    <p className="portal-card-label">Hours</p>
                    <p className="portal-card-value">
                      {cp.completedHours} / {cp.requiredHours}
                    </p>
                  </div>
                  <div>
                    <p className="portal-card-label">Readiness</p>
                    <p className="portal-card-value">
                      <span
                        className={
                          cp.readiness === 'ready'
                            ? 'portal-status portal-status--paid'
                            : 'portal-status portal-status--pending'
                        }
                      >
                        {clinicalReadinessLabel(cp.readiness)}
                      </span>
                    </p>
                  </div>
                </div>
                <div
                  className="portal-academics-progress-track"
                  role="progressbar"
                  aria-valuenow={clinicalHoursProgressPct(cp)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Clinical hours progress"
                >
                  <div
                    className="portal-academics-progress-fill"
                    style={{
                      width: `${clinicalHoursProgressPct(cp)}%`,
                    }}
                  />
                </div>
                <p className="portal-academics-progress-caption portal-inline-note portal-inline-note--flush">
                  {cp.completedHours} of {cp.requiredHours} required hours in
                  clinical records.
                </p>
                <div className="portal-stack" style={{ gap: '0.75rem' }}>
                  <div>
                    <p className="portal-card-label">Completed courses</p>
                    {cp.completedCourses.length === 0 ? (
                      <p className="portal-inline-note portal-inline-note--flush">
                        No clinical course rows on file yet.
                      </p>
                    ) : (
                      <p
                        className="portal-card-value"
                        style={{ marginTop: '0.25rem' }}
                      >
                        {cp.completedCourses.join(', ')}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="portal-card-label">Missing</p>
                    {cp.missing.length === 0 ? (
                      <p className="portal-inline-note portal-inline-note--flush">
                        No open items listed.
                      </p>
                    ) : (
                      <ul className="portal-module-list">
                        {cp.missing.map((item) => (
                          <li key={item} className="portal-module-list-item">
                            <span className="portal-module-list-label">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          <section
            className="portal-card portal-stack"
            style={{ gap: '1rem' }}
            aria-labelledby="admin-clinical-assign-heading"
          >
            <h2
              id="admin-clinical-assign-heading"
              className="portal-section-heading"
            >
              Assign clinical session
            </h2>
            <p
              className="portal-inline-note portal-inline-note--flush"
              style={{ margin: 0, marginBottom: '0.25rem' }}
            >
              Choose a published slot from the legacy clinic timetable. Course, site, and
              faculty details come from that record (site may be blank when not on file).
            </p>
            <form className="portal-stack" style={{ gap: '0.85rem' }} onSubmit={onAssignSubmit}>
              {assignError ? (
                <p
                  className="portal-profile-state__detail portal-profile-state--error"
                  role="alert"
                  style={{ margin: 0 }}
                >
                  {assignError}
                </p>
              ) : null}
              {assignSuccess ? (
                <p
                  className="portal-inline-note portal-inline-note--flush"
                  role="status"
                  style={{ margin: 0 }}
                >
                  {assignSuccess}
                </p>
              ) : null}
              {timetableError ? (
                <p
                  className="portal-profile-state__detail portal-profile-state--error"
                  role="alert"
                  style={{ margin: 0 }}
                >
                  {timetableError}
                </p>
              ) : null}
              <div className="portal-stack" style={{ gap: '0.75rem' }}>
                <div className="admin-detail-field-row">
                  <label
                    htmlFor="admin-clinical-filter-year"
                    className="admin-detail-field-label"
                  >
                    Filter by year
                  </label>
                  <select
                    id="admin-clinical-filter-year"
                    className="admin-input"
                    value={filterYear}
                    disabled={assignSubmitting}
                    onChange={(e) => {
                      setFilterYear(e.target.value)
                      setSelectedSlotId('')
                    }}
                    aria-label="Filter timetable by year"
                  >
                    <option value="">All years</option>
                    {[...new Set(timetableSlots.map((s) => s.year))]
                      .sort((a, b) => b - a)
                      .map((y) => (
                        <option key={y} value={String(y)}>
                          {y}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="admin-detail-field-row">
                  <label
                    htmlFor="admin-clinical-filter-term"
                    className="admin-detail-field-label"
                  >
                    Filter by term
                  </label>
                  <select
                    id="admin-clinical-filter-term"
                    className="admin-input"
                    value={filterTerm}
                    disabled={assignSubmitting}
                    onChange={(e) => {
                      setFilterTerm(e.target.value)
                      setSelectedSlotId('')
                    }}
                    aria-label="Filter timetable by term"
                  >
                    <option value="">All terms</option>
                    {[...new Set(timetableSlots.map((s) => s.term))].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-detail-field-row">
                  <label
                    htmlFor="admin-clinical-slot-select"
                    className="admin-detail-field-label"
                  >
                    Clinic slot
                  </label>
                  <select
                    id="admin-clinical-slot-select"
                    className="admin-input"
                    value={selectedSlotId}
                    disabled={assignSubmitting || slotAssignDisabled}
                    onChange={(e) => setSelectedSlotId(e.target.value)}
                    aria-required="true"
                  >
                    <option value="">
                      {timetableLoading
                        ? 'Loading slots…'
                        : timetableError
                          ? 'Slots unavailable'
                          : filteredTimetableSlots.length === 0
                            ? 'No slots for these filters'
                            : 'Select a slot'}
                    </option>
                    {filteredTimetableSlots.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.slotLabel} ({s.term} {s.year})
                      </option>
                    ))}
                  </select>
                </div>
                {!timetableLoading &&
                !timetableError &&
                filteredTimetableSlots.length === 0 ? (
                  <p
                    className="portal-inline-note portal-inline-note--flush"
                    style={{ margin: 0, opacity: 0.85 }}
                    role="status"
                  >
                    No clinic slots are available for the selected term.
                  </p>
                ) : null}
                <div className="portal-actions" style={{ marginTop: '0.15rem' }}>
                  <button
                    type="submit"
                    className="portal-btn portal-btn--primary"
                    disabled={
                      assignSubmitting ||
                      slotAssignDisabled ||
                      selectedSlotId.trim() === ''
                    }
                  >
                    {assignSubmitting ? 'Assigning…' : 'Assign selected slot'}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section
            className="portal-card portal-stack"
            style={{ gap: '0.75rem' }}
            aria-labelledby="admin-clinical-assigned-heading"
          >
            <h2
              id="admin-clinical-assigned-heading"
              className="portal-section-heading"
            >
              Assigned clinical sessions
            </h2>
            {scheduleError ? (
              <p
                className="portal-profile-state__detail portal-profile-state--error"
                role="alert"
                style={{ margin: 0 }}
              >
                {scheduleError}
              </p>
            ) : null}
            {scheduleLoading && scheduleSessions.length === 0 && !scheduleError ? (
              <p className="portal-inline-note portal-inline-note--flush" aria-live="polite">
                Loading assigned sessions…
              </p>
            ) : null}
            {!scheduleLoading && !scheduleError && scheduleSessions.length === 0 ? (
              <p className="portal-card-note admin-detail-empty" role="status">
                No clinical sessions assigned yet.
              </p>
            ) : null}
            {!scheduleError && scheduleSessions.length > 0 ? (
              <div className="portal-table-wrap">
                <table className="portal-table portal-table--clinical-schedule">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Course code</th>
                      <th scope="col">Session</th>
                      <th scope="col">Site</th>
                      <th scope="col">Faculty</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleSessions.map((row) => {
                      const statusLabel = row.status.trim() || 'Scheduled'
                      return (
                        <tr key={row.id}>
                          <td>{formatAssignedSessionDateCell(row.sessionDate)}</td>
                          <td>{dashText(row.courseCode)}</td>
                          <td>
                            {displayAssignedSessionName(
                              row.sessionDate,
                              row.sessionName,
                            )}
                          </td>
                          <td>{displayClinicalSiteOrFaculty(row.site)}</td>
                          <td>{displayClinicalSiteOrFaculty(row.faculty)}</td>
                          <td>
                            <span
                              className={clinicalAssignmentStatusClass(
                                statusLabel,
                              )}
                            >
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAdminStudentDetail,
  type AdminStudentDetail,
  type AdminStudentRegistrationHistoryItem,
  type ClinicalProgress,
} from '../../lib/api'

function dashText(value: string | null | undefined): string {
  const s = value?.trim() ?? ''
  return s.length > 0 ? s : '—'
}

function formatUsMdY(iso: string | null | undefined): string {
  const s = iso?.trim() ?? ''
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    return `${mo}/${d}/${y}`
  }
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = d.getFullYear()
  return `${mm}/${dd}/${yy}`
}

function formatEntryYear(y: number | null | undefined): string {
  if (y == null || !Number.isFinite(y)) return '—'
  return String(Math.trunc(y))
}

const SEASON_ORDER: Record<string, number> = {
  FALL: 4,
  SUMMER: 3,
  SPRING: 2,
  WINTER: 1,
}

/** Sort key for labels like `Fall 2025` (newer / later season sorts higher). */
function termSortKey(term: string): number {
  const t = term.trim()
  if (!t) return 0
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 0
  const year = Number(parts[parts.length - 1])
  const seasonBlob = parts.slice(0, -1).join(' ').toUpperCase()
  let seasonRank = 0
  for (const [k, rank] of Object.entries(SEASON_ORDER)) {
    if (seasonBlob.includes(k)) {
      seasonRank = rank
      break
    }
  }
  const y = Number.isFinite(year) ? year : 0
  return y * 10 + seasonRank
}

function buildQuarterOptions(
  history: AdminStudentDetail['registrationHistory'],
  latestRegistrationTerm: string | null,
): string[] {
  const fromHistory = (history ?? [])
    .map((h) => h.term.trim())
    .filter((x) => x.length > 0)
  const uniq = new Set(fromHistory)
  const latest = latestRegistrationTerm?.trim()
  if (latest) uniq.add(latest)
  return Array.from(uniq).sort((a, b) => termSortKey(b) - termSortKey(a))
}

function cellHistory(
  item: AdminStudentRegistrationHistoryItem,
  key: keyof AdminStudentRegistrationHistoryItem,
): string {
  const v = item[key]
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return String(v)
  const s = v.trim()
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

export function AdminStudentDetailPage() {
  const { studentId: studentIdParam } = useParams<{ studentId: string }>()
  const studentId = studentIdParam ?? ''

  const [detail, setDetail] = useState<AdminStudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'registration' | 'profile'>(
    'registration',
  )
  /** User override; cleared when navigating to another student. */
  const [selectedQuarter, setSelectedQuarter] = useState('')

  useEffect(() => {
    setActiveTab('registration')
    setSelectedQuarter('')
  }, [studentId])

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
          e instanceof Error ? e.message : 'Could not load student.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [studentId, reloadKey])

  const quarterOptions = useMemo(() => {
    if (!detail) return []
    return buildQuarterOptions(
      detail.registrationHistory,
      detail.latestRegistrationTerm,
    )
  }, [detail])

  const effectiveQuarter = useMemo(() => {
    if (!detail || quarterOptions.length === 0) return ''
    if (selectedQuarter && quarterOptions.includes(selectedQuarter)) {
      return selectedQuarter
    }
    const latest = detail.latestRegistrationTerm?.trim() ?? ''
    if (latest && quarterOptions.includes(latest)) return latest
    return quarterOptions[0] ?? ''
  }, [detail, quarterOptions, selectedQuarter])

  const registrationItems = useMemo(() => {
    if (!detail || !effectiveQuarter.trim()) return []
    const bucket = detail.registrationHistory?.find(
      (h) => h.term === effectiveQuarter,
    )
    return bucket?.items ?? []
  }, [detail, effectiveQuarter])

  const sectionLoading = loading && detail === null && error === null

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <div>
          <Link
            to="/admin/students"
            className="portal-text-muted"
            style={{ fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Students
          </Link>
          <h1 className="admin-page__title admin-page__title--inline">
            {detail?.name ?? 'Student'}
          </h1>
        </div>
        {detail ? (
          <div className="admin-page__toolbar-actions">
            <Link
              to={`/admin/students/${encodeURIComponent(detail.studentId)}/edit`}
              className="portal-btn portal-btn--primary"
            >
              Edit
            </Link>
          </div>
        ) : null}
      </div>

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading student</p>
          <p className="portal-profile-state__detail">
            Please wait while we load this record from the school database.
          </p>
        </section>
      ) : null}

      {!sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load this student</p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
            <Link to="/admin/students" className="portal-btn portal-btn--secondary">
              Back to list
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
          <div
            className="admin-detail-tabs"
            role="tablist"
            aria-label="Student record sections"
          >
            <button
              type="button"
              role="tab"
              id="admin-student-tab-registration"
              aria-selected={activeTab === 'registration'}
              aria-controls="admin-student-panel-registration"
              tabIndex={activeTab === 'registration' ? 0 : -1}
              className={`admin-detail-tab${activeTab === 'registration' ? ' admin-detail-tab--active' : ''}`}
              onClick={() => setActiveTab('registration')}
            >
              Registration
            </button>
            <button
              type="button"
              role="tab"
              id="admin-student-tab-profile"
              aria-selected={activeTab === 'profile'}
              aria-controls="admin-student-panel-profile"
              tabIndex={activeTab === 'profile' ? 0 : -1}
              className={`admin-detail-tab${activeTab === 'profile' ? ' admin-detail-tab--active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
          </div>

          {activeTab === 'registration' ? (
            <div
              className="portal-stack"
              style={{ gap: '1.25rem' }}
              id="admin-student-panel-registration"
              role="tabpanel"
              aria-labelledby="admin-student-tab-registration"
            >
              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-reg-summary"
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <h2
                    id="admin-student-reg-summary"
                    className="portal-section-heading"
                    style={{ marginBottom: 0 }}
                  >
                    Registration summary
                  </h2>
                  {detail.clinicalProgress ? (
                    <div
                      style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                      aria-label="Clinical summary"
                    >
                      <span className="portal-status portal-status--scheduled">
                        Level {detail.clinicalProgress.level}
                      </span>
                      <span
                        className={
                          detail.clinicalProgress.readiness === 'ready'
                            ? 'portal-status portal-status--paid'
                            : 'portal-status portal-status--pending'
                        }
                      >
                        {clinicalReadinessLabel(detail.clinicalProgress.readiness)}
                      </span>
                    </div>
                  ) : null}
                </div>
                <dl>
                  <div className="portal-row">
                    <dt>Latest registration term</dt>
                    <dd>{dashText(detail.latestRegistrationTerm)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Signed date</dt>
                    <dd>{formatUsMdY(detail.signedDate)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Enroll start date</dt>
                    <dd>{formatUsMdY(detail.enrollStartDate)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Resolved entry date</dt>
                    <dd>{formatUsMdY(detail.resolvedEntryDate)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Entry year</dt>
                    <dd>{formatEntryYear(detail.entryYear)}</dd>
                  </div>
                </dl>
              </section>

              <section
                className={`portal-card portal-stack${detail.clinicalProgress ? ' portal-academics-progress-card' : ''}`}
                aria-labelledby="admin-student-clinical-progress"
              >
                <h2
                  id="admin-student-clinical-progress"
                  className="portal-section-heading"
                >
                  Clinical progress
                </h2>
                {detail.clinicalProgress == null ? (
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
                          {detail.clinicalProgress.level}
                        </p>
                      </div>
                      <div>
                        <p className="portal-card-label">Hours</p>
                        <p className="portal-card-value">
                          {detail.clinicalProgress.completedHours} /{' '}
                          {detail.clinicalProgress.requiredHours}
                        </p>
                      </div>
                      <div>
                        <p className="portal-card-label">Readiness</p>
                        <p className="portal-card-value">
                          <span
                            className={
                              detail.clinicalProgress.readiness === 'ready'
                                ? 'portal-status portal-status--paid'
                                : 'portal-status portal-status--pending'
                            }
                          >
                            {clinicalReadinessLabel(
                              detail.clinicalProgress.readiness,
                            )}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div
                      className="portal-academics-progress-track"
                      role="progressbar"
                      aria-valuenow={clinicalHoursProgressPct(detail.clinicalProgress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Clinical hours progress"
                    >
                      <div
                        className="portal-academics-progress-fill"
                        style={{
                          width: `${clinicalHoursProgressPct(detail.clinicalProgress)}%`,
                        }}
                      />
                    </div>
                    <p className="portal-academics-progress-caption portal-inline-note portal-inline-note--flush">
                      {detail.clinicalProgress.completedHours} of{' '}
                      {detail.clinicalProgress.requiredHours} required hours in
                      clinical records.
                    </p>
                    <div className="portal-stack" style={{ gap: '0.75rem' }}>
                      <div>
                        <p className="portal-card-label">Completed courses</p>
                        {detail.clinicalProgress.completedCourses.length === 0 ? (
                          <p className="portal-inline-note portal-inline-note--flush">
                            No clinical course rows on file yet.
                          </p>
                        ) : (
                          <p className="portal-card-value" style={{ marginTop: '0.25rem' }}>
                            {detail.clinicalProgress.completedCourses.join(', ')}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="portal-card-label">Missing</p>
                        {detail.clinicalProgress.missing.length === 0 ? (
                          <p className="portal-inline-note portal-inline-note--flush">
                            No open items listed.
                          </p>
                        ) : (
                          <ul className="portal-module-list">
                            {detail.clinicalProgress.missing.map((item) => (
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
                aria-labelledby="admin-student-reg-history"
              >
                <h2
                  id="admin-student-reg-history"
                  className="portal-section-heading"
                >
                  Registration history
                </h2>
                <div className="admin-detail-field-row">
                  <label
                    className="admin-detail-field-label"
                    htmlFor="admin-student-quarter-select"
                  >
                    Quarter
                  </label>
                  <select
                    id="admin-student-quarter-select"
                    className="admin-input admin-detail-quarter-select"
                    value={
                      quarterOptions.length === 0 ? '' : effectiveQuarter
                    }
                    onChange={(e) => setSelectedQuarter(e.target.value)}
                    disabled={quarterOptions.length === 0}
                  >
                    {quarterOptions.length === 0 ? (
                      <option value="">No terms on file</option>
                    ) : (
                      quarterOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                {registrationItems.length === 0 ? (
                  <p
                    className="portal-card-note admin-detail-empty"
                    role="status"
                  >
                    No registration records for this quarter.
                  </p>
                ) : (
                  <div className="portal-table-wrap admin-table-wrap">
                    <table className="portal-table portal-data-table admin-registration-history-table">
                      <thead>
                        <tr>
                          <th scope="col">Course code</th>
                          <th scope="col">Course title</th>
                          <th scope="col">Credits</th>
                          <th scope="col">Instructor</th>
                          <th scope="col">Status</th>
                          <th scope="col">Grade</th>
                          <th scope="col">Schedule</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrationItems.map((row, idx) => (
                          <tr key={`${effectiveQuarter}-${idx}`}>
                            <td>{cellHistory(row, 'courseCode')}</td>
                            <td>{cellHistory(row, 'courseTitle')}</td>
                            <td>{cellHistory(row, 'credits')}</td>
                            <td>{cellHistory(row, 'instructor')}</td>
                            <td>{cellHistory(row, 'status')}</td>
                            <td>{cellHistory(row, 'grade')}</td>
                            <td>{cellHistory(row, 'schedule')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-reg-refs"
              >
                <h2
                  id="admin-student-reg-refs"
                  className="portal-section-heading"
                >
                  Academic registration references
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Requirements ID</dt>
                    <dd>{dashText(detail.requirementsId)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : (
            <div
              className="portal-stack"
              style={{ gap: '1.25rem' }}
              id="admin-student-panel-profile"
              role="tabpanel"
              aria-labelledby="admin-student-tab-profile"
            >
              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-identity"
              >
                <h2 id="admin-student-identity" className="portal-section-heading">
                  Identity
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Student ID</dt>
                    <dd>{dashText(detail.studentId)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Division</dt>
                    <dd>{dashText(detail.division)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Name</dt>
                    <dd>{dashText(detail.name)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Gender</dt>
                    <dd>{dashText(detail.gender)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Email</dt>
                    <dd>{dashText(detail.email)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Program</dt>
                    <dd>{dashText(detail.requirementsId)}</dd>
                  </div>
                </dl>
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-academic-bg"
              >
                <h2
                  id="admin-student-academic-bg"
                  className="portal-section-heading"
                >
                  Academic background
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Highest degree</dt>
                    <dd>{dashText(detail.highestDegree)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Background school</dt>
                    <dd>{dashText(detail.backgroundSchool)}</dd>
                  </div>
                </dl>
              </section>

              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-contact"
              >
                <h2 id="admin-student-contact" className="portal-section-heading">
                  Contact information
                </h2>
                <dl>
                  <div className="portal-row">
                    <dt>Address</dt>
                    <dd>{dashText(detail.address)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>City</dt>
                    <dd>{dashText(detail.city)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>State</dt>
                    <dd>{dashText(detail.state)}</dd>
                  </div>
                  <div className="portal-row">
                    <dt>Zip</dt>
                    <dd>{dashText(detail.zip)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </>
      ) : null}
    </main>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAcademicTerms,
  fetchAdminStudentDetail,
  fetchAdminStudentDocuments,
  fetchCurrentAcademicTerm,
  resetAdminStudentDocumentRequirement,
  resetAllAdminStudentDocuments,
  type AcademicTerm,
  type AdminStudentDetail,
  type AdminStudentRegistrationHistoryItem,
  type DocumentRequirementType,
  type StudentDocumentsResponse,
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

const ADMIN_DOC_REQUIREMENT_ORDER: DocumentRequirementType[] = [
  'ferpa',
  'titleix',
  'campus',
  'copyright_release_agreement',
]

const ADMIN_DOC_LABELS: Record<DocumentRequirementType, string> = {
  ferpa: 'FERPA Quiz',
  titleix: 'Title IX Quiz',
  campus: 'Campus Safety Quiz',
  copyright_release_agreement: 'Copyright Release Agreement',
}

/** Visible terms first when any exist; otherwise full list. Newest by `sequence_no`, then year, then quarter. */
function academicTermsForAdminDocPicker(terms: AcademicTerm[]): AcademicTerm[] {
  const visible = terms.filter((t) => t.is_visible)
  const pool = visible.length > 0 ? visible : terms
  return [...pool].sort((a, b) => {
    if (b.sequence_no !== a.sequence_no) return b.sequence_no - a.sequence_no
    if (b.year !== a.year) return b.year - a.year
    return b.quarter_index - a.quarter_index
  })
}

/**
 * Default academic term for admin documents: latest registration label match, else registration-open
 * current term, else most recent visible (or all terms if none visible).
 */
function pickDefaultDocumentsAcademicTermId(
  terms: AcademicTerm[],
  latestRegistrationTermLabel: string | null,
  currentRegistrationOpen: AcademicTerm | null,
): string | null {
  if (terms.length === 0) return null
  const pickerList = academicTermsForAdminDocPicker(terms)
  const label = latestRegistrationTermLabel?.trim()
  if (label) {
    const match =
      terms.find((t) => t.term_label === label) ??
      pickerList.find((t) => t.term_label === label)
    if (match) return match.id
  }
  if (currentRegistrationOpen) {
    const match = terms.find((t) => t.id === currentRegistrationOpen.id)
    if (match) return match.id
  }
  return pickerList[0]?.id ?? null
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

export function AdminStudentDetailPage() {
  const { studentId: studentIdParam } = useParams<{ studentId: string }>()
  const studentId = studentIdParam ?? ''

  const [detail, setDetail] = useState<AdminStudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeTab, setActiveTab] = useState<
    'registration' | 'profile' | 'documents'
  >('registration')
  /** User override; cleared when navigating to another student. */
  const [selectedQuarter, setSelectedQuarter] = useState('')

  const [docTerms, setDocTerms] = useState<AcademicTerm[] | null>(null)
  const [docTermsLoading, setDocTermsLoading] = useState(false)
  const [docTermsError, setDocTermsError] = useState<string | null>(null)
  const [docCurrentRegistrationTerm, setDocCurrentRegistrationTerm] =
    useState<AcademicTerm | null>(null)
  /** When set, Documents tab uses this academic term id instead of the default. */
  const [documentsTermOverride, setDocumentsTermOverride] = useState<
    string | null
  >(null)

  const [documentsData, setDocumentsData] =
    useState<StudentDocumentsResponse | null>(null)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [documentsActionError, setDocumentsActionError] = useState<
    string | null
  >(null)
  const [resettingRequirement, setResettingRequirement] =
    useState<DocumentRequirementType | null>(null)
  const [resettingAllDocuments, setResettingAllDocuments] = useState(false)

  useEffect(() => {
    setActiveTab('registration')
    setSelectedQuarter('')
    setDocTerms(null)
    setDocTermsLoading(false)
    setDocTermsError(null)
    setDocCurrentRegistrationTerm(null)
    setDocumentsTermOverride(null)
    setDocumentsData(null)
    setDocumentsLoading(false)
    setDocumentsError(null)
    setDocumentsActionError(null)
    setResettingRequirement(null)
    setResettingAllDocuments(false)
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

  const defaultDocumentsTermId = useMemo(() => {
    if (!docTerms || docTerms.length === 0) return null
    return pickDefaultDocumentsAcademicTermId(
      docTerms,
      detail?.latestRegistrationTerm ?? null,
      docCurrentRegistrationTerm,
    )
  }, [docTerms, detail?.latestRegistrationTerm, docCurrentRegistrationTerm])

  const effectiveDocumentsTermId = useMemo(() => {
    if (documentsTermOverride) {
      const ok = docTerms?.some((t) => t.id === documentsTermOverride)
      if (ok) return documentsTermOverride
    }
    return defaultDocumentsTermId
  }, [documentsTermOverride, docTerms, defaultDocumentsTermId])

  const documentsTermOptions = useMemo(() => {
    if (!docTerms || docTerms.length === 0) return []
    return academicTermsForAdminDocPicker(docTerms)
  }, [docTerms])

  useEffect(() => {
    if (activeTab !== 'documents' || !studentId.trim() || !detail) return
    if (docTerms !== null) return
    const ac = new AbortController()
    setDocTermsLoading(true)
    setDocTermsError(null)
    ;(async () => {
      try {
        const [terms, current] = await Promise.all([
          fetchAcademicTerms({ signal: ac.signal }),
          fetchCurrentAcademicTerm({ signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setDocTerms(terms)
        setDocCurrentRegistrationTerm(current)
      } catch (e) {
        if (ac.signal.aborted) return
        setDocTerms(null)
        setDocCurrentRegistrationTerm(null)
        setDocTermsError(
          e instanceof Error ? e.message : 'Could not load academic terms.',
        )
      } finally {
        if (!ac.signal.aborted) setDocTermsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [activeTab, studentId, detail, docTerms])

  const loadDocumentsForTerm = useCallback(
    async (termId: string, signal?: AbortSignal) => {
      return fetchAdminStudentDocuments(studentId, termId, { signal })
    },
    [studentId],
  )

  useEffect(() => {
    if (activeTab !== 'documents' || !studentId.trim()) return
    const termId = effectiveDocumentsTermId
    if (!termId) {
      setDocumentsData(null)
      setDocumentsLoading(false)
      setDocumentsError(null)
      return
    }
    const ac = new AbortController()
    setDocumentsLoading(true)
    setDocumentsError(null)
    ;(async () => {
      try {
        const data = await loadDocumentsForTerm(termId, ac.signal)
        if (ac.signal.aborted) return
        setDocumentsData(data)
      } catch (e) {
        if (ac.signal.aborted) return
        setDocumentsData(null)
        setDocumentsError(
          e instanceof Error
            ? e.message
            : 'Could not load document requirements.',
        )
      } finally {
        if (!ac.signal.aborted) setDocumentsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [activeTab, studentId, effectiveDocumentsTermId, loadDocumentsForTerm])

  const refreshDocumentsAfterMutation = useCallback(async () => {
    const termId = effectiveDocumentsTermId
    if (!termId || !studentId.trim()) return
    setDocumentsError(null)
    try {
      const data = await fetchAdminStudentDocuments(studentId, termId)
      setDocumentsData(data)
    } catch (e) {
      setDocumentsError(
        e instanceof Error ? e.message : 'Could not reload document requirements.',
      )
    }
  }, [effectiveDocumentsTermId, studentId])

  const handleResetDocumentRequirement = useCallback(
    async (requirementType: DocumentRequirementType) => {
      const termId = effectiveDocumentsTermId
      if (!termId || !studentId.trim()) return
      setDocumentsActionError(null)
      setResettingRequirement(requirementType)
      try {
        await resetAdminStudentDocumentRequirement(
          studentId,
          requirementType,
          { academicTermId: termId },
        )
        await refreshDocumentsAfterMutation()
      } catch (e) {
        setDocumentsActionError(
          e instanceof Error ? e.message : 'Could not re-assign this requirement.',
        )
      } finally {
        setResettingRequirement(null)
      }
    },
    [effectiveDocumentsTermId, studentId, refreshDocumentsAfterMutation],
  )

  const handleResetAllDocumentRequirements = useCallback(async () => {
    const termId = effectiveDocumentsTermId
    if (!termId || !studentId.trim()) return
    setDocumentsActionError(null)
    setResettingAllDocuments(true)
    try {
      await resetAllAdminStudentDocuments(studentId, {
        academicTermId: termId,
      })
      await refreshDocumentsAfterMutation()
    } catch (e) {
      setDocumentsActionError(
        e instanceof Error ? e.message : 'Could not re-assign all requirements.',
      )
    } finally {
      setResettingAllDocuments(false)
    }
  }, [effectiveDocumentsTermId, studentId, refreshDocumentsAfterMutation])

  const sectionLoading = loading && detail === null && error === null

  const documentsBusy =
    documentsLoading ||
    resettingAllDocuments ||
    resettingRequirement !== null

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
            <button
              type="button"
              role="tab"
              id="admin-student-tab-documents"
              aria-selected={activeTab === 'documents'}
              aria-controls="admin-student-panel-documents"
              tabIndex={activeTab === 'documents' ? 0 : -1}
              className={`admin-detail-tab${activeTab === 'documents' ? ' admin-detail-tab--active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              Documents
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
                <h2
                  id="admin-student-reg-summary"
                  className="portal-section-heading"
                  style={{ marginBottom: 0 }}
                >
                  Registration summary
                </h2>
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
          ) : null}

          {activeTab === 'profile' ? (
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
          ) : null}

          {activeTab === 'documents' ? (
            <div
              className="portal-stack"
              style={{ gap: '1.25rem' }}
              id="admin-student-panel-documents"
              role="tabpanel"
              aria-labelledby="admin-student-tab-documents"
            >
              <section
                className="portal-card portal-stack"
                aria-labelledby="admin-student-documents-heading"
              >
                <h2
                  id="admin-student-documents-heading"
                  className="portal-section-heading"
                  style={{ marginBottom: 0 }}
                >
                  Document & training compliance
                </h2>
                <p className="portal-card-note" style={{ marginTop: 0 }}>
                  Status and quiz results are shown for the selected academic term. Re-assign
                  clears completion so the student must finish the item again in the portal.
                </p>

                {docTermsLoading ? (
                  <div
                    className="portal-card portal-profile-state"
                    aria-busy="true"
                    aria-live="polite"
                  >
                    <p className="portal-profile-state__title">
                      Loading academic terms
                    </p>
                    <p className="portal-profile-state__detail">
                      Choose a term to load document requirements.
                    </p>
                  </div>
                ) : null}

                {!docTermsLoading && docTermsError ? (
                  <div
                    className="portal-card-note"
                    role="alert"
                    style={{
                      border: '1px solid var(--portal-border-subtle)',
                      borderLeft: '3px solid #c53030',
                      background: '#fff5f5',
                      color: '#742a2a',
                    }}
                  >
                    {docTermsError}
                  </div>
                ) : null}

                {!docTermsLoading && !docTermsError ? (
                  <>
                    <div className="admin-detail-field-row">
                      <label
                        className="admin-detail-field-label"
                        htmlFor="admin-student-documents-term-select"
                      >
                        Academic term
                      </label>
                      <select
                        id="admin-student-documents-term-select"
                        className="admin-input admin-detail-quarter-select"
                        value={effectiveDocumentsTermId ?? ''}
                        onChange={(e) => {
                          const v = e.target.value
                          setDocumentsActionError(null)
                          setDocumentsTermOverride(v === '' ? null : v)
                        }}
                        disabled={
                          documentsTermOptions.length === 0 || documentsBusy
                        }
                      >
                        {documentsTermOptions.length === 0 ? (
                          <option value="">No terms available</option>
                        ) : (
                          documentsTermOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.term_label}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    {!effectiveDocumentsTermId &&
                    documentsTermOptions.length === 0 ? (
                      <p
                        className="portal-card-note admin-detail-empty"
                        role="status"
                      >
                        No academic terms are available to load document
                        requirements.
                      </p>
                    ) : null}

                    {!effectiveDocumentsTermId &&
                    documentsTermOptions.length > 0 ? (
                      <p
                        className="portal-card-note admin-detail-empty"
                        role="status"
                      >
                        Select an academic term to view document requirements.
                      </p>
                    ) : null}

                    {documentsError ? (
                      <div
                        className="portal-card-note"
                        role="alert"
                        style={{
                          border: '1px solid var(--portal-border-subtle)',
                          borderLeft: '3px solid #c53030',
                          background: '#fff5f5',
                          color: '#742a2a',
                        }}
                      >
                        {documentsError}
                      </div>
                    ) : null}

                    {documentsActionError ? (
                      <div
                        className="portal-card-note"
                        role="alert"
                        style={{
                          border: '1px solid var(--portal-border-subtle)',
                          borderLeft: '3px solid #c53030',
                          background: '#fff5f5',
                          color: '#742a2a',
                        }}
                      >
                        {documentsActionError}
                      </div>
                    ) : null}

                    {effectiveDocumentsTermId ? (
                      <div className="portal-actions" style={{ flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="portal-btn portal-btn--secondary"
                          disabled={
                            documentsBusy || !effectiveDocumentsTermId
                          }
                          onClick={() => void handleResetAllDocumentRequirements()}
                        >
                          {resettingAllDocuments
                            ? 'Re-assigning all…'
                            : 'Re-assign all'}
                        </button>
                      </div>
                    ) : null}

                    {effectiveDocumentsTermId && documentsLoading ? (
                      <p className="portal-card-note admin-detail-empty" aria-busy="true">
                        Loading document requirements…
                      </p>
                    ) : null}

                    {effectiveDocumentsTermId &&
                    !documentsLoading &&
                    documentsData
                      ? ADMIN_DOC_REQUIREMENT_ORDER.map((reqType) => {
                          const req = documentsData.requirements.find(
                            (r) => r.requirementType === reqType,
                          )
                          const title = ADMIN_DOC_LABELS[reqType]
                          const submittedYes = req?.status === 'completed'
                          const singleBusy = resettingRequirement === reqType
                          return (
                            <div
                              key={reqType}
                              className="portal-stack"
                              style={{
                                gap: '0.75rem',
                                paddingTop: '0.75rem',
                                borderTop:
                                  '1px solid var(--portal-border-subtle)',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                }}
                              >
                                <h3
                                  className="portal-section-heading"
                                  style={{
                                    fontSize: '1rem',
                                    margin: 0,
                                    flex: '1 1 12rem',
                                  }}
                                >
                                  {title}
                                </h3>
                                <button
                                  type="button"
                                  className="portal-btn portal-btn--secondary"
                                  disabled={
                                    !effectiveDocumentsTermId || documentsBusy
                                  }
                                  onClick={() =>
                                    void handleResetDocumentRequirement(
                                      reqType,
                                    )
                                  }
                                >
                                  {singleBusy ? 'Re-assigning…' : 'Re-assign'}
                                </button>
                              </div>
                              <dl style={{ margin: 0 }}>
                                <div className="portal-row">
                                  <dt>Submitted</dt>
                                  <dd>{submittedYes ? 'Yes' : 'No'}</dd>
                                </div>
                              </dl>
                            </div>
                          )
                        })
                      : null}
                  </>
                ) : null}
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminSchedulingQueryString } from '../../lib/adminSchedulingSearchParams'
import { AdminCourseFeedbackModal } from '../../components/admin/AdminCourseFeedbackModal'
import {
  deleteAdminPortalEnrollment,
  fetchAcademicTerms,
  fetchAdminCourseSectionEnrollments,
  postAdminMarksSetGrade,
  type AcademicTerm,
  type AdminCourseSectionEnrollmentRow,
} from '../../lib/api'
import {
  normalizeScheduleTrackValue,
  scheduleTrackTableLabel,
} from '../../lib/scheduleTrack'

const GRADE_SCALE: Record<string, number | null> = {
  A: 4,
  'A-': 3.75,
  'B+': 3.5,
  B: 3,
  'B-': 2.75,
  'C+': 2.5,
  C: 2,
  'C-': 1.75,
  D: 1,
  F: 0,
  P: null,
  NP: null,
  INC: null,
}

function academicStatusLabel(status: string): string {
  const s = status.trim().toLowerCase()
  if (s === 'withdrawn') return 'Withdrawn'
  if (s === 'active') return 'Active'
  if (s === 'completed') return 'Completed'
  if (s === 'dropped') return 'Dropped'
  if (s === 'unknown' || s === '') return '—'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function rosterGradeDisplay(row: AdminCourseSectionEnrollmentRow): string {
  const withdrawn = row.status.trim().toLowerCase() === 'withdrawn'
  if (withdrawn) return row.grade?.trim() || 'W'
  return row.grade ?? '—'
}

export function AdminCourseSectionRosterPage() {
  const [searchParams] = useSearchParams()
  const termId = searchParams.get('term')?.trim() ?? ''
  const courseCode = searchParams.get('course')?.trim() ?? ''
  const q = searchParams.get('q') ?? ''
  const sectionCode = searchParams.get('section')?.trim() ?? ''
  const trackRaw = searchParams.get('track')?.trim() ?? ''

  const trackNormalized =
    trackRaw !== '' ? normalizeScheduleTrackValue(trackRaw) : null

  const backSearch = useMemo(
    () => adminSchedulingQueryString({ term: termId, course: courseCode, q }),
    [termId, courseCode, q],
  )
  const backTo = backSearch
    ? `/admin/course-sections?${backSearch}`
    : '/admin/course-sections'

  const [terms, setTerms] = useState<AcademicTerm[] | null>(null)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [students, setStudents] = useState<AdminCourseSectionEnrollmentRow[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyGradeId, setBusyGradeId] = useState<string | null>(null)
  const [gradeDraft, setGradeDraft] = useState<Record<string, string>>({})
  const [reloadNonce, setReloadNonce] = useState(0)
  const [feedbackStudentId, setFeedbackStudentId] = useState<string | null>(
    null,
  )

  const termLabel = useMemo(() => {
    if (termId === '') return null
    const t = terms?.find((x) => x.id === termId)
    return t?.term_label ?? null
  }, [terms, termId])

  const missingContext = termId === '' || courseCode === ''

  const rosterTermYear = useMemo(() => {
    if (termId === '') return null
    return terms?.find((x) => x.id === termId)?.year ?? null
  }, [terms, termId])

  /** Same `term` string as `portal_enrollments.term` / student feedback (not academic term row id). */
  const rosterTermName = useMemo(() => {
    if (termId === '') return null
    return terms?.find((x) => x.id === termId)?.term_name ?? null
  }, [terms, termId])

  useEffect(() => {
    if (termId === '') {
      setTerms([])
      setTermsError(null)
      return
    }
    const ac = new AbortController()
    setTermsError(null)
    void (async () => {
      try {
        const t = await fetchAcademicTerms({ signal: ac.signal })
        if (ac.signal.aborted) return
        setTerms(t)
      } catch (e) {
        if (ac.signal.aborted) return
        setTerms([])
        setTermsError(
          e instanceof Error ? e.message : 'Could not load academic terms.',
        )
      }
    })()
    return () => ac.abort()
  }, [termId])

  useEffect(() => {
    if (missingContext) {
      setLoading(false)
      setStudents([])
      setLoadError(null)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const rows = await fetchAdminCourseSectionEnrollments({
          academicTermId: termId,
          courseCode,
          signal: ac.signal,
        })
        if (!ac.signal.aborted) setStudents(rows)
      } catch (e) {
        if (ac.signal.aborted) return
        setLoadError(
          e instanceof Error ? e.message : 'Could not load enrollments.',
        )
        setStudents([])
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [termId, courseCode, missingContext, reloadNonce])

  const bumpRoster = useCallback(() => {
    setReloadNonce((n) => n + 1)
  }, [])

  const onSaveGrade = async (studentId: string) => {
    const row = students.find((x) => x.studentId === studentId)
    const grade = (gradeDraft[studentId] ?? row?.grade ?? '').trim()
    if (!grade || grade === 'W') return
    if (!Object.prototype.hasOwnProperty.call(GRADE_SCALE, grade)) {
      setActionError(
        'Pick a standard letter grade from the list before saving.',
      )
      return
    }

    const numeric = GRADE_SCALE[grade] ?? null

    setActionError(null)
    setBusyGradeId(studentId)
    try {
      await postAdminMarksSetGrade({
        studentId,
        courseCode,
        term: termId,
        grade,
        numeric,
      })
      setGradeDraft((prev) => {
        const next = { ...prev }
        delete next[studentId]
        return next
      })
      bumpRoster()
    } catch {
      setActionError('Save grade failed')
    } finally {
      setBusyGradeId(null)
    }
  }

  const onRemove = async (studentId: string) => {
    setActionError(null)
    setBusyId(studentId)
    try {
      const res = await deleteAdminPortalEnrollment({
        studentId,
        academic_term_id: termId,
        course_code: courseCode,
      })
      if (res.removedCount < 1) {
        setActionError(
          'No enrollment row was removed (already removed or not found).',
        )
        return
      }
      bumpRoster()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Remove failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="admin-page admin-course-section-roster">
      {feedbackStudentId != null &&
      !missingContext &&
      rosterTermYear != null &&
      rosterTermName != null ? (
        <AdminCourseFeedbackModal
          studentId={feedbackStudentId}
          courseCode={courseCode}
          term={rosterTermName}
          year={rosterTermYear}
          onClose={() => setFeedbackStudentId(null)}
        />
      ) : null}
      <div className="admin-course-section-roster__top">
        <Link
          to={backTo}
          className="portal-btn portal-btn--secondary portal-btn--compact admin-course-section-roster__back"
        >
          ← Back to Course Sections
        </Link>
      </div>

      <h1 className="admin-page__title">Course roster</h1>

      {missingContext ? (
        <p className="admin-form-message" role="alert">
          This roster needs a term and course in the URL. Use{' '}
          <strong>View students</strong> from Course Sections, or{' '}
          <Link to="/admin/course-sections">return to Course Sections</Link>.
        </p>
      ) : (
        <>
          <div className="admin-course-section-roster__context">
            <p className="admin-course-section-roster__context-line">
              <span className="admin-course-section-roster__context-k">
                Academic term
              </span>
              <span className="admin-course-section-roster__context-v">
                {termLabel != null ? (
                  <>
                    {termLabel}{' '}
                    <code className="admin-code">({termId})</code>
                  </>
                ) : termsError != null ? (
                  <>
                    <code className="admin-code">{termId}</code>
                    <span className="portal-text-muted">
                      {' '}
                      (could not load term name)
                    </span>
                  </>
                ) : terms == null ? (
                  <span className="portal-text-muted">Loading term…</span>
                ) : (
                  <code className="admin-code">{termId}</code>
                )}
              </span>
            </p>
            <p className="admin-course-section-roster__context-line">
              <span className="admin-course-section-roster__context-k">
                Course
              </span>
              <span className="admin-course-section-roster__context-v">
                <code className="admin-code">{courseCode}</code>
              </span>
            </p>
            {sectionCode !== '' ? (
              <p className="admin-course-section-roster__context-line">
                <span className="admin-course-section-roster__context-k">
                  Section
                </span>
                <span className="admin-course-section-roster__context-v">
                  {sectionCode}
                  {trackNormalized != null
                    ? ` · ${scheduleTrackTableLabel(trackNormalized)} track`
                    : null}
                </span>
              </p>
            ) : trackNormalized != null ? (
              <p className="admin-course-section-roster__context-line">
                <span className="admin-course-section-roster__context-k">
                  Track
                </span>
                <span className="admin-course-section-roster__context-v">
                  {scheduleTrackTableLabel(trackNormalized)}
                </span>
              </p>
            ) : null}
          </div>

          <p className="portal-text-muted admin-form-hint admin-course-section-roster__hint">
            Registrations are stored per course and term in{' '}
            <code className="admin-code">portal_enrollments</code>, not per
            section. Removing a student drops their course enrollment for this
            term; counts on all sections for this course will update together.
          </p>

          {termsError != null && (
            <p className="portal-text-muted admin-course-section-roster__terms-warn" role="status">
              {termsError}
            </p>
          )}

          {actionError != null && (
            <p className="admin-form-message" role="alert">
              {actionError}
            </p>
          )}
          {loadError != null && (
            <p className="admin-form-message" role="alert">
              {loadError}
            </p>
          )}

          {loading ? (
            <div
              className="portal-table-wrap admin-table-wrap admin-course-section-roster__state-wrap"
              role="status"
              aria-live="polite"
            >
              <p className="admin-course-section-roster__state">
                Loading enrollments…
              </p>
            </div>
          ) : students.length === 0 && loadError == null ? (
            <div className="portal-table-wrap admin-table-wrap admin-course-section-roster__state-wrap">
              <p className="admin-course-section-roster__state">
                No students listed for this course in this term.
              </p>
            </div>
          ) : loadError == null ? (
            <div className="portal-table-wrap admin-table-wrap admin-course-section-roster__table-shell">
              <table className="portal-table admin-course-section-roster__table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Student ID</th>
                    <th scope="col">Status</th>
                    <th scope="col">Grade</th>
                    <th scope="col">Save</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => {
                    const withdrawn =
                      s.status.trim().toLowerCase() === 'withdrawn'
                    return (
                      <tr key={s.studentId}>
                        <td>{s.name?.trim() ? s.name.trim() : '—'}</td>
                        <td>
                          <code className="admin-code">{s.studentId}</code>
                        </td>
                        <td>{academicStatusLabel(s.status)}</td>
                        <td>
                          {withdrawn ? (
                            rosterGradeDisplay(s)
                          ) : (
                            <select
                              className="admin-input"
                              aria-label={`Grade for ${s.studentId}`}
                              value={
                                gradeDraft[s.studentId] ?? (s.grade ?? '')
                              }
                              onChange={(e) =>
                                setGradeDraft((prev) => ({
                                  ...prev,
                                  [s.studentId]: e.target.value,
                                }))
                              }
                            >
                              <option value="">—</option>
                              {Object.keys(GRADE_SCALE).map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                              {(() => {
                                const v = (
                                  gradeDraft[s.studentId] ??
                                  s.grade ??
                                  ''
                                ).trim()
                                if (
                                  v !== '' &&
                                  !Object.prototype.hasOwnProperty.call(
                                    GRADE_SCALE,
                                    v,
                                  )
                                ) {
                                  return (
                                    <option key={`legacy-${v}`} value={v}>
                                      {v}
                                    </option>
                                  )
                                }
                                return null
                              })()}
                            </select>
                          )}
                        </td>
                        <td>
                          {withdrawn ? (
                            <span className="portal-text-muted">—</span>
                          ) : (
                            <button
                              type="button"
                              className="portal-btn portal-btn--primary portal-btn--compact"
                              disabled={busyGradeId != null || busyId != null}
                              onClick={() => void onSaveGrade(s.studentId)}
                            >
                              {busyGradeId === s.studentId
                                ? 'Saving…'
                                : 'Save'}
                            </button>
                          )}
                        </td>
                        <td>
                          <div className="admin-course-section-roster__row-actions">
                            <button
                              type="button"
                              className="portal-btn portal-btn--secondary portal-btn--compact"
                              disabled={
                                busyId != null ||
                                busyGradeId != null ||
                                rosterTermYear == null ||
                                rosterTermName == null
                              }
                              onClick={() => setFeedbackStudentId(s.studentId)}
                            >
                              View Feedback
                            </button>
                            <button
                              type="button"
                              className="portal-btn portal-btn--secondary portal-btn--compact"
                              disabled={busyId != null || withdrawn}
                              onClick={() => void onRemove(s.studentId)}
                            >
                              {busyId === s.studentId
                                ? 'Removing…'
                                : 'Remove registration'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </main>
  )
}

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentAcademics,
  fetchStudentCourseFeedback,
  fetchStudentTranscriptPreview,
  postStudentCourseFeedback,
  type CourseFeedbackApiItem,
  type StudentAcademicsResponse,
  type StudentTranscriptPreviewResponse,
} from '../../lib/api'
import {
  academicStatusLabel,
  currentTermLabel,
  formatAcademicTimeRange,
  formatCreditsCell,
  formatDaysCell,
  formatGradeCell,
  noCurrentCoursesMessage,
} from '../../lib/academicCourseRecordsDisplay'
import {
  courseRowDisplayTitle,
  formatCreditCell,
  groupRowsByTermYear,
  groupTranscriptByTermYear,
  termYearKey,
} from '../../lib/academicsTranscriptDisplay'

type AcademicsTab = 'current' | 'history' | 'transcript'

type EnrollmentHistoryRow = StudentAcademicsResponse['enrollmentHistory'][number]

function findFeedbackItemForRow(
  items: CourseFeedbackApiItem[],
  row: Pick<EnrollmentHistoryRow, 'courseCode' | 'term' | 'year'>,
): CourseFeedbackApiItem | undefined {
  const code = row.courseCode.trim()
  const term = row.term.trim().toLowerCase()
  return items.find(
    (it) =>
      it.courseCode.trim() === code &&
      it.year === row.year &&
      it.term.trim().toLowerCase() === term,
  )
}

function CourseFeedbackCell({
  row,
  onOpenSubmit,
  onOpenView,
}: {
  row: EnrollmentHistoryRow
  onOpenSubmit: (row: EnrollmentHistoryRow) => void
  onOpenView: (row: EnrollmentHistoryRow) => void
}) {
  const submitted = row.feedbackSubmitted === true
  if (!row.feedbackEligible) {
    return <span className="portal-text-muted">Not eligible</span>
  }
  if (!submitted) {
    return (
      <button
        type="button"
        className="portal-btn portal-btn--secondary portal-btn--compact"
        onClick={() => onOpenSubmit(row)}
      >
        Submit Feedback
      </button>
    )
  }
  return (
    <div className="portal-academics-feedback-actions">
      <span>Submitted</span>
      <button
        type="button"
        className="portal-btn portal-btn--link"
        onClick={() => onOpenView(row)}
      >
        View
      </button>
    </div>
  )
}

function CourseFeedbackModal({
  mode,
  row,
  studentId,
  onClose,
  onSubmitted,
}: {
  mode: 'submit' | 'view'
  row: EnrollmentHistoryRow
  studentId: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const [rating, setRating] = useState('')
  const [workload, setWorkload] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [comments, setComments] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [viewLoading, setViewLoading] = useState(mode === 'view')
  const [viewError, setViewError] = useState<string | null>(null)
  const [viewItem, setViewItem] = useState<CourseFeedbackApiItem | null>(null)

  useEffect(() => {
    if (mode !== 'view') return
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetchStudentCourseFeedback(studentId, { signal: ac.signal })
        if (ac.signal.aborted) return
        const item = findFeedbackItemForRow(res.items, row)
        if (!item) {
          setViewItem(null)
          setViewError('Could not find submitted feedback for this course.')
        } else {
          setViewItem(item)
          setViewError(null)
        }
      } catch (e) {
        if (ac.signal.aborted) return
        setViewError(e instanceof Error ? e.message : 'Could not load feedback.')
      } finally {
        if (!ac.signal.aborted) setViewLoading(false)
      }
    })()
    return () => ac.abort()
  }, [mode, studentId, row.courseCode, row.term, row.year])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function backdropMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const r = Number(rating)
    const w = Number(workload)
    const d = Number(difficulty)
    if (![r, w, d].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
      setFormError('Please choose a whole number from 1 to 5 for overall rating, workload, and difficulty.')
      return
    }
    setSubmitting(true)
    try {
      await postStudentCourseFeedback(studentId, {
        courseCode: row.courseCode,
        term: row.term,
        year: row.year,
        rating: r,
        workloadRating: w,
        difficultyRating: d,
        comments: comments.trim() || null,
      })
      onSubmitted()
      onClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit feedback.')
    } finally {
      setSubmitting(false)
    }
  }

  const titleId = 'course-feedback-modal-title'
  const courseLabel = `${row.courseCode.trim()} — ${courseRowDisplayTitle(row)}`

  return (
    <div
      className="portal-course-feedback-modal-backdrop"
      onMouseDown={backdropMouseDown}
      role="presentation"
    >
      <div
        className="portal-course-feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {mode === 'submit' ? (
          <>
            <h2 id={titleId} className="portal-course-feedback-modal__title">
              Course evaluation
            </h2>
            <p className="portal-course-feedback-modal__meta">
              {courseLabel}
              <br />
              {row.term} {row.year}
            </p>
            <form onSubmit={handleSubmit}>
              <div className="portal-course-feedback-modal__field">
                <label htmlFor="cfb-rating">Overall rating (required)</label>
                <select
                  id="cfb-rating"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="portal-course-feedback-modal__field">
                <label htmlFor="cfb-workload">Workload (required)</label>
                <select
                  id="cfb-workload"
                  value={workload}
                  onChange={(e) => setWorkload(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="portal-course-feedback-modal__field">
                <label htmlFor="cfb-difficulty">Difficulty (required)</label>
                <select
                  id="cfb-difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="portal-course-feedback-modal__field">
                <label htmlFor="cfb-comments">Comments (optional)</label>
                <textarea
                  id="cfb-comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  maxLength={8000}
                  rows={4}
                />
              </div>
              {formError ? (
                <p className="portal-card-note portal-profile-state--error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="portal-course-feedback-modal__actions">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="portal-btn portal-btn--primary"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit evaluation'}
                </button>
              </div>
            </form>
          </>
        ) : null}

        {mode === 'view' ? (
          <>
            <h2 id={titleId} className="portal-course-feedback-modal__title">
              Submitted evaluation
            </h2>
            <p className="portal-course-feedback-modal__meta">
              {courseLabel}
              <br />
              {row.term} {row.year}
            </p>
            {viewLoading ? (
              <p className="portal-card-note">Loading…</p>
            ) : null}
            {viewError && !viewLoading ? (
              <p className="portal-card-note portal-profile-state--error" role="alert">
                {viewError}
              </p>
            ) : null}
            {viewItem && !viewLoading ? (
              <dl className="portal-course-feedback-modal__readonly-dl">
                <div>
                  <dt>Overall</dt>
                  <dd>{viewItem.rating}</dd>
                </div>
                <div>
                  <dt>Workload</dt>
                  <dd>{viewItem.workloadRating}</dd>
                </div>
                <div>
                  <dt>Difficulty</dt>
                  <dd>{viewItem.difficultyRating}</dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>
                    {(() => {
                      try {
                        return new Date(viewItem.submittedAt).toLocaleString()
                      } catch {
                        return viewItem.submittedAt
                      }
                    })()}
                  </dd>
                </div>
                <div>
                  <dt>Comments</dt>
                  <dd>{viewItem.comments?.trim() ? viewItem.comments : '—'}</dd>
                </div>
              </dl>
            ) : null}
            <div className="portal-course-feedback-modal__actions">
              <button type="button" className="portal-btn portal-btn--secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

/** Displayed in transcript masthead (print + screen). */
const SCHOOL_TITLE = 'ALHAMBRA MEDICAL UNIVERSITY'

function formatIssueDate(): string {
  try {
    return new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

const GRADES_TABLE_CLASS =
  'portal-table portal-table--grades portal-academics-portal-grades-table'

function instructorCell(v: string | null | undefined): string {
  const s = v?.trim()
  return s && s.length > 0 ? s : '—'
}

export function AcademicsPortalPage() {
  const { currentStudentId } = useAccount()
  const [tab, setTab] = useState<AcademicsTab>('current')
  const [academics, setAcademics] = useState<StudentAcademicsResponse | null>(null)
  const [academicsError, setAcademicsError] = useState<string | null>(null)
  const [academicsLoading, setAcademicsLoading] = useState(false)
  const [transcriptPreview, setTranscriptPreview] =
    useState<StudentTranscriptPreviewResponse | null>(null)
  const [transcriptPreviewError, setTranscriptPreviewError] = useState<string | null>(null)
  const [transcriptPreviewLoading, setTranscriptPreviewLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [feedbackModal, setFeedbackModal] = useState<
    | { mode: 'submit'; row: EnrollmentHistoryRow }
    | { mode: 'view'; row: EnrollmentHistoryRow }
    | null
  >(null)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setAcademics(null)
      setAcademicsError(null)
      setAcademicsLoading(false)
      setTranscriptPreview(null)
      setTranscriptPreviewError(null)
      setTranscriptPreviewLoading(false)
      return
    }

    const ac = new AbortController()
    setAcademics(null)
    setAcademicsError(null)
    setAcademicsLoading(true)
    setTranscriptPreview(null)
    setTranscriptPreviewError(null)
    setTranscriptPreviewLoading(true)

    ;(async () => {
      try {
        const data = await fetchStudentAcademics(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setAcademics(data)
        setAcademicsError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setAcademics(null)
        setAcademicsError(
          e instanceof Error ? e.message : 'Could not load academic records.',
        )
      } finally {
        if (!ac.signal.aborted) setAcademicsLoading(false)
      }
    })()

    ;(async () => {
      try {
        const data = await fetchStudentTranscriptPreview(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setTranscriptPreview(data)
        setTranscriptPreviewError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setTranscriptPreview(null)
        setTranscriptPreviewError(
          e instanceof Error ? e.message : 'Could not load transcript preview.',
        )
      } finally {
        if (!ac.signal.aborted) setTranscriptPreviewLoading(false)
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, reloadKey])

  const registrationGroups = useMemo(
    () => (academics ? groupRowsByTermYear(academics.enrollmentHistory) : []),
    [academics],
  )

  const groupedPreview = useMemo(
    () =>
      transcriptPreview ? groupTranscriptByTermYear(transcriptPreview.transcript) : [],
    [transcriptPreview],
  )

  const id = currentStudentId?.trim()
  const showEmpty = !id
  const issueDate = formatIssueDate()

  const academicsBlocking =
    academicsLoading && academics === null && academicsError === null
  const transcriptBlocking =
    transcriptPreviewLoading &&
    transcriptPreview === null &&
    transcriptPreviewError === null

  const showAcademicsError = academicsError != null && academics === null && !academicsLoading
  const showTranscriptError =
    transcriptPreviewError != null && transcriptPreview === null && !transcriptPreviewLoading

  const termPhrase = academics ? currentTermLabel(academics.currentTerm) : 'the current term'

  return (
    <main className="portal-page portal-stack">
      {id && feedbackModal ? (
        <CourseFeedbackModal
          key={`${feedbackModal.mode}-${feedbackModal.row.courseCode}-${feedbackModal.row.term}-${feedbackModal.row.year}`}
          mode={feedbackModal.mode}
          row={feedbackModal.row}
          studentId={id}
          onClose={() => setFeedbackModal(null)}
          onSubmitted={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      <div
        className="portal-academics-print-hide"
        role="tablist"
        aria-label="Academics sections"
      >
        <div className="portal-tab-group portal-academics-portal-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'current'}
            className={['portal-tab', tab === 'current' ? 'portal-tab--active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('current')}
          >
            Current Courses
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={['portal-tab', tab === 'history' ? 'portal-tab--active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('history')}
          >
            Registration History
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'transcript'}
            className={['portal-tab', tab === 'transcript' ? 'portal-tab--active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('transcript')}
          >
            Transcript
          </button>
        </div>
      </div>

      {showEmpty ? (
        <section
          className="portal-card portal-profile-state"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Sign in to view academics</p>
          <p className="portal-profile-state__detail">
            Your courses, registration history, and transcript appear here after you log in with your
            student account.
          </p>
        </section>
      ) : null}

      {!showEmpty && tab === 'current' ? (
        <>
          {academicsBlocking ? (
            <section className="portal-card portal-profile-state" aria-busy="true" aria-live="polite">
              <p className="portal-profile-state__title">Loading courses</p>
              <p className="portal-profile-state__detail">Please wait while we load your schedule.</p>
            </section>
          ) : null}
          {showAcademicsError ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
              aria-live="assertive"
            >
              <p className="portal-profile-state__title">We could not load your courses</p>
              <p className="portal-profile-state__detail">{academicsError}</p>
              <div className="portal-actions portal-profile-state__actions">
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
          {!academicsBlocking && !showAcademicsError && academics ? (
            <section className="portal-stack" aria-label="Current courses">
              {academics.currentSchedule.length === 0 ? (
                <div className="portal-card portal-academics-empty-state" aria-live="polite">
                  <h2 className="portal-academics-empty-state__title">No courses this term</h2>
                  <p className="portal-academics-empty-state__text">
                    {academics.currentTerm
                      ? noCurrentCoursesMessage(termPhrase)
                      : 'There is no active enrollment term on file. Completed coursework appears under Registration History and Transcript.'}
                  </p>
                </div>
              ) : (
                <div className="portal-table-wrap">
                  <table className={GRADES_TABLE_CLASS}>
                    <thead>
                      <tr>
                        <th scope="col">Course code</th>
                        <th scope="col">Course title</th>
                        <th scope="col">Credits</th>
                        <th scope="col">Days / meeting pattern</th>
                        <th scope="col">Time</th>
                        <th scope="col">Instructor</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {academics.currentSchedule.map((row, idx) => (
                        <tr
                          key={`${row.courseCode}-${row.term}-${row.year}-${idx}`}
                        >
                          <td>{row.courseCode}</td>
                          <td className="portal-academics-course-title-cell">
                            <span className="portal-academics-course-title__en">
                              {courseRowDisplayTitle(row)}
                            </span>
                          </td>
                          <td>{formatCreditsCell(row.credits)}</td>
                          <td>{formatDaysCell(row.days)}</td>
                          <td>{formatAcademicTimeRange(row.timeFrom, row.timeTo)}</td>
                          <td>{instructorCell(row.instructor)}</td>
                          <td>{academicStatusLabel(row.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {!showEmpty && tab === 'history' ? (
        <>
          {academicsBlocking ? (
            <section className="portal-card portal-profile-state" aria-busy="true" aria-live="polite">
              <p className="portal-profile-state__title">Loading registration history</p>
              <p className="portal-profile-state__detail">
                Please wait while we load your enrollment record.
              </p>
            </section>
          ) : null}
          {showAcademicsError ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
              aria-live="assertive"
            >
              <p className="portal-profile-state__title">We could not load registration history</p>
              <p className="portal-profile-state__detail">{academicsError}</p>
              <div className="portal-actions portal-profile-state__actions">
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
          {!academicsBlocking && !showAcademicsError && academics ? (
            <section className="portal-stack portal-academics-registration-history" aria-label="Registration history">
              {registrationGroups.length === 0 ? (
                <div className="portal-card portal-academics-empty-state" aria-live="polite">
                  <h2 className="portal-academics-empty-state__title">No registration history</h2>
                  <p className="portal-academics-empty-state__text">
                    No course registrations are on file yet.
                  </p>
                </div>
              ) : (
                registrationGroups.map((g) => (
                  <div key={termYearKey(g.term, g.year)} className="portal-stack">
                    <h2 className="portal-academics-term-heading">
                      {g.term} {g.year}
                    </h2>
                    <div className="portal-table-wrap">
                      <table className={GRADES_TABLE_CLASS}>
                        <thead>
                          <tr>
                            <th scope="col">Course code</th>
                            <th scope="col">Course title</th>
                            <th scope="col">Credits</th>
                            <th scope="col">Status</th>
                            <th scope="col">Grade</th>
                            <th scope="col">Instructor</th>
                            <th scope="col">Course feedback</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((row, idx) => (
                            <tr key={`${row.courseCode}-${g.term}-${g.year}-${idx}`}>
                              <td>{row.courseCode}</td>
                              <td className="portal-academics-course-title-cell">
                                <span className="portal-academics-course-title__en">
                                  {courseRowDisplayTitle(row)}
                                </span>
                              </td>
                              <td>{formatCreditsCell(row.credits)}</td>
                              <td>{academicStatusLabel(row.status)}</td>
                              <td>{formatGradeCell(row.grade)}</td>
                              <td>{instructorCell(row.instructor)}</td>
                              <td>
                                <CourseFeedbackCell
                                  row={row}
                                  onOpenSubmit={(r) => setFeedbackModal({ mode: 'submit', row: r })}
                                  onOpenView={(r) => setFeedbackModal({ mode: 'view', row: r })}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {!showEmpty && tab === 'transcript' ? (
        <>
          {transcriptBlocking ? (
            <section className="portal-card portal-profile-state" aria-busy="true" aria-live="polite">
              <p className="portal-profile-state__title">Loading transcript</p>
              <p className="portal-profile-state__detail">Please wait while we load your transcript.</p>
            </section>
          ) : null}
          {showTranscriptError ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
              aria-live="assertive"
            >
              <p className="portal-profile-state__title">We could not load your transcript</p>
              <p className="portal-profile-state__detail">{transcriptPreviewError}</p>
              <div className="portal-actions portal-profile-state__actions">
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
          {!transcriptBlocking && !showTranscriptError && transcriptPreview ? (
            <div className="portal-academics-transcript-preview portal-stack">
              <div className="portal-academics-print-hide portal-academics-transcript-preview__actions">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  onClick={() => window.print()}
                >
                  Print
                </button>
              </div>

              <div className="portal-academics-transcript-sheet">
                <header className="portal-academics-transcript-sheet__masthead">
                  <div className="portal-academics-transcript-sheet__masthead-inner">
                    <img
                      className="portal-academics-transcript-sheet__logo"
                      src="/AMULogo.png"
                      alt=""
                    />
                    <p className="portal-academics-transcript-sheet__school">{SCHOOL_TITLE}</p>
                    <p className="portal-academics-transcript-sheet__title">UNOFFICIAL TRANSCRIPT</p>
                  </div>
                </header>

                <dl className="portal-academics-transcript-sheet__meta">
                  <div className="portal-academics-transcript-sheet__meta-row">
                    <dt>Student name</dt>
                    <dd>{transcriptPreview.studentName}</dd>
                  </div>
                  <div className="portal-academics-transcript-sheet__meta-row">
                    <dt>Student ID</dt>
                    <dd>{transcriptPreview.studentId}</dd>
                  </div>
                  <div className="portal-academics-transcript-sheet__meta-row">
                    <dt>Date issued</dt>
                    <dd>{issueDate}</dd>
                  </div>
                </dl>

                {groupedPreview.length === 0 ? (
                  <p className="portal-card-note">No transcript rows on file yet.</p>
                ) : (
                  <div className="portal-academics-transcript-sheet__terms">
                    {groupedPreview.map((g) => (
                      <section
                        key={termYearKey(g.term, g.year)}
                        className="portal-academics-transcript-sheet__term-block"
                      >
                        <h3 className="portal-academics-transcript-sheet__term-heading">
                          {g.term} {g.year}
                        </h3>
                        <div className="portal-table-wrap">
                          <table
                            className={`${GRADES_TABLE_CLASS} portal-academics-transcript-sheet__table`}
                          >
                            <thead>
                              <tr>
                                <th scope="col">Code</th>
                                <th scope="col">Course title</th>
                                <th scope="col">Grade</th>
                                <th scope="col">Numeric</th>
                                <th scope="col">Credit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.rows.map((row, idx) => (
                                <tr key={`${row.courseCode}-${g.term}-${g.year}-${idx}`}>
                                  <td>{row.courseCode}</td>
                                  <td className="portal-academics-course-title-cell">
                                    <span className="portal-academics-course-title__en">
                                      {courseRowDisplayTitle(row)}
                                    </span>
                                  </td>
                                  <td>{row.grade?.trim() ? row.grade : '—'}</td>
                                  <td>
                                    {row.numericGrade != null && Number.isFinite(row.numericGrade)
                                      ? String(row.numericGrade)
                                      : '—'}
                                  </td>
                                  <td>{formatCreditCell(row)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                <section
                  className="portal-academics-transcript-sheet__cumulative"
                  aria-labelledby="transcript-cumulative-heading"
                >
                  <h3
                    id="transcript-cumulative-heading"
                    className="portal-academics-transcript-sheet__cumulative-heading"
                  >
                    Cumulative Total
                  </h3>
                  <dl className="portal-academics-transcript-sheet__cumulative-dl">
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>Units Transferred</dt>
                      <dd>45.0</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>Clinic Hour Transferred</dt>
                      <dd>100 Hours</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>Units Completed</dt>
                      <dd>198.0</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>Clinic Completed</dt>
                      <dd>980 Hours</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>GPA</dt>
                      <dd>3.76</dd>
                    </div>
                  </dl>
                </section>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  )
}

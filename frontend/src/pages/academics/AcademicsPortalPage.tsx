import { useEffect, useMemo, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentAcademics,
  fetchStudentTranscriptPreview,
  type StudentAcademicsResponse,
  type StudentTranscriptPreviewResponse,
} from '../../lib/api'
import { CourseFeedbackCell } from '../../components/academics/CourseFeedbackCell'
import { CourseFeedbackModal } from '../../components/academics/CourseFeedbackModal'
import {
  academicStatusLabel,
  formatCreditsCell,
  formatGradeCell,
} from '../../lib/academicCourseRecordsDisplay'
import {
  courseRowDisplayTitle,
  formatCreditCell,
  groupRowsByTermYear,
  groupTranscriptByTermYear,
  termYearKey,
} from '../../lib/academicsTranscriptDisplay'

type AcademicsTab = 'history' | 'transcript'

type EnrollmentHistoryRow = StudentAcademicsResponse['enrollmentHistory'][number]

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

const REGISTRATION_HISTORY_TABLE_CLASS = `${GRADES_TABLE_CLASS} portal-academics-registration-history-table`

function instructorCell(v: string | null | undefined): string {
  const s = v?.trim()
  return s && s.length > 0 ? s : '—'
}

export function AcademicsPortalPage() {
  const { currentStudentId } = useAccount()
  const [tab, setTab] = useState<AcademicsTab>('history')
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
            Your registration history and transcript appear here after you log in with your student
            account.
          </p>
        </section>
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
                    No course registrations are on file yet. When you enroll, rows will appear here by
                    term. Use the Transcript tab for the unofficial transcript view.
                  </p>
                </div>
              ) : (
                registrationGroups.map((g) => (
                  <div key={termYearKey(g.term, g.year)} className="portal-stack">
                    <h2 className="portal-academics-term-heading">
                      {g.term} {g.year}
                    </h2>
                    <div className="portal-table-wrap">
                      <table className={REGISTRATION_HISTORY_TABLE_CLASS}>
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

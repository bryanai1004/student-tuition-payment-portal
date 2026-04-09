import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import {
  fetchStudentCourseFeedback,
  postStudentCourseFeedback,
  type CourseFeedbackApiItem,
  type StudentAcademicsResponse,
} from '../../lib/api'
import { courseRowDisplayTitle } from '../../lib/academicsTranscriptDisplay'

export type EnrollmentHistoryRow = StudentAcademicsResponse['enrollmentHistory'][number]

function ratingSelectField(
  id: string,
  label: string,
  value: number,
  onChange: (n: number) => void,
) {
  return (
    <div className="portal-course-feedback-modal__field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  )
}

function isRating(n: unknown): n is number {
  return typeof n === 'number' && n >= 1 && n <= 5 && Number.isInteger(n)
}

export function CourseFeedbackModal({
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
  const [q1, setQ1] = useState<number>(3)
  const [q2, setQ2] = useState<number>(3)
  const [q3, setQ3] = useState<number>(3)
  const [q4, setQ4] = useState<number>(3)
  const [q5, setQ5] = useState<number>(3)
  const [overall, setOverall] = useState<number>(3)
  const [comment, setComment] = useState<string>('')
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
        const item = await fetchStudentCourseFeedback(
          {
            studentId,
            courseCode: row.courseCode,
            term: row.term,
            year: row.year,
          },
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
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
    setSubmitting(true)
    try {
      if (!row.courseCode?.trim() || !row.term?.trim() || row.year == null) {
        throw new Error('Missing course metadata')
      }
      if (!isRating(q1) || !isRating(q2) || !isRating(q3) || !isRating(q4) || !isRating(q5) || !isRating(overall)) {
        throw new Error('Please rate all questions and overall (1–5).')
      }
      const payload = {
        courseCode: row.courseCode,
        term: row.term,
        year: row.year,
        q1Rating: q1,
        q2Rating: q2,
        q3Rating: q3,
        q4Rating: q4,
        q5Rating: q5,
        overallRating: overall,
        comment: comment.trim() || null,
      }
      await postStudentCourseFeedback(studentId, payload)
      onClose()
      onSubmitted()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not submit feedback.')
    } finally {
      setSubmitting(false)
    }
  }

  const titleId = 'course-feedback-modal-title'
  const courseLabel = `${row.courseCode.trim()} — ${courseRowDisplayTitle(row)}`

  const view = viewItem

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
              {ratingSelectField('cfb-q1', 'Q1 (1–5)', q1, setQ1)}
              {ratingSelectField('cfb-q2', 'Q2 (1–5)', q2, setQ2)}
              {ratingSelectField('cfb-q3', 'Q3 (1–5)', q3, setQ3)}
              {ratingSelectField('cfb-q4', 'Q4 (1–5)', q4, setQ4)}
              {ratingSelectField('cfb-q5', 'Q5 (1–5)', q5, setQ5)}
              {ratingSelectField('cfb-overall', 'Overall (1–5)', overall, setOverall)}
              <div className="portal-course-feedback-modal__field">
                <label htmlFor="cfb-comment">Comment</label>
                <textarea
                  id="cfb-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
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
                  {submitting ? 'Submitting…' : 'Submit'}
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
            {view && !viewLoading ? (
              <>
                <dl className="portal-course-feedback-modal__readonly-dl">
                  <div>
                    <dt>Q1 rating</dt>
                    <dd>{view.q1Rating}</dd>
                  </div>
                  <div>
                    <dt>Q2 rating</dt>
                    <dd>{view.q2Rating}</dd>
                  </div>
                  <div>
                    <dt>Q3 rating</dt>
                    <dd>{view.q3Rating}</dd>
                  </div>
                  <div>
                    <dt>Q4 rating</dt>
                    <dd>{view.q4Rating}</dd>
                  </div>
                  <div>
                    <dt>Q5 rating</dt>
                    <dd>{view.q5Rating}</dd>
                  </div>
                  <div>
                    <dt>Overall Rating</dt>
                    <dd>{view.overallRating}</dd>
                  </div>
                  <div>
                    <dt>Comment</dt>
                    <dd>
                      {view.comment != null && view.comment.trim() !== '' ? view.comment : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>
                      {view.submittedAt
                        ? new Date(view.submittedAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </>
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

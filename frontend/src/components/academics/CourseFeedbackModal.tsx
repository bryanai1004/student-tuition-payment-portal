import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import {
  fetchStudentCourseFeedback,
  postStudentCourseFeedback,
  type CourseFeedbackApiItem,
  type StudentAcademicsResponse,
} from '../../lib/api'
import { courseRowDisplayTitle } from '../../lib/academicsTranscriptDisplay'

export type EnrollmentHistoryRow = StudentAcademicsResponse['enrollmentHistory'][number]

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
  const [rating, setRating] = useState(0)
  const [workload, setWorkload] = useState(0)
  const [difficulty, setDifficulty] = useState(0)
  const [comment, setComment] = useState('')
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
    if (!rating || !workload || !difficulty) {
      setFormError('Please complete all ratings')
      return
    }
    setSubmitting(true)
    try {
      await postStudentCourseFeedback(studentId, {
        courseCode: row.courseCode,
        term: row.term,
        year: row.year,
        rating,
        workloadRating: workload,
        difficultyRating: difficulty,
        comments: comment.trim() || null,
      })
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
                <label htmlFor="cfb-rating">Overall Rating (1–5)</label>
                <select
                  id="cfb-rating"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                >
                  <option value={0}>Select…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="portal-course-feedback-modal__field">
                <label htmlFor="cfb-workload">Workload (1–5)</label>
                <select
                  id="cfb-workload"
                  value={workload}
                  onChange={(e) => setWorkload(Number(e.target.value))}
                >
                  <option value={0}>Select…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="portal-course-feedback-modal__field">
                <label htmlFor="cfb-difficulty">Difficulty (1–5)</label>
                <select
                  id="cfb-difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(Number(e.target.value))}
                >
                  <option value={0}>Select…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
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
                  <dt>Comment</dt>
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

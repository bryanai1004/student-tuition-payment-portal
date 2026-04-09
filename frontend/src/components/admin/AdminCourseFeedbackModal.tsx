import { useEffect, useState, type MouseEvent } from 'react'
import {
  fetchAdminCourseFeedback,
  type CourseFeedbackApiItem,
} from '../../lib/api'

function backdropMouseDown(
  e: MouseEvent<HTMLDivElement>,
  onClose: () => void,
) {
  if (e.target === e.currentTarget) onClose()
}

export function AdminCourseFeedbackModal({
  studentId,
  courseCode,
  term,
  year,
  onClose,
}: {
  studentId: string
  courseCode: string
  term: string
  year: number
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [item, setItem] = useState<CourseFeedbackApiItem | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const data = await fetchAdminCourseFeedback(
          {
            studentId,
            courseCode: courseCode.trim(),
            term: term.trim(),
            year,
          },
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
        setItem(data)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Could not load feedback.')
        setItem(null)
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [studentId, courseCode, term, year])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const titleId = 'admin-course-feedback-modal-title'
  const f = item

  const q1 = f ? (f.q1Rating ?? f.rating) : null
  const q2 = f ? (f.q2Rating ?? f.workloadRating) : null
  const q3 = f ? (f.q3Rating ?? f.difficultyRating) : null
  const q4 = f ? (f.q4Rating ?? f.rating) : null
  const q5 = f ? (f.q5Rating ?? f.rating) : null
  const overall = f ? (f.overallRating ?? f.rating) : null
  const commentRaw = f ? (f.comment ?? f.comments) : null
  const comment =
    typeof commentRaw === 'string' && commentRaw.trim() !== ''
      ? commentRaw
      : null
  const submittedAt = f?.submittedAt

  return (
    <div
      className="portal-course-feedback-modal-backdrop"
      onMouseDown={(e) => backdropMouseDown(e, onClose)}
      role="presentation"
    >
      <div
        className="portal-course-feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="portal-course-feedback-modal__title">
          Course feedback
        </h2>
        <p className="portal-course-feedback-modal__meta">
          <code className="admin-code">{studentId}</code>
          <br />
          <code className="admin-code">{courseCode.trim()}</code>
        </p>
        {loading ? (
          <p className="portal-card-note">Loading…</p>
        ) : error ? (
          <p className="portal-card-note portal-profile-state--error" role="alert">
            {error}
          </p>
        ) : !f ? (
          <p className="portal-card-note">No feedback submitted</p>
        ) : (
          <dl className="portal-course-feedback-modal__readonly-dl">
            <div>
              <dt>Q1 rating</dt>
              <dd>{q1 ?? '—'}</dd>
            </div>
            <div>
              <dt>Q2 rating</dt>
              <dd>{q2 ?? '—'}</dd>
            </div>
            <div>
              <dt>Q3 rating</dt>
              <dd>{q3 ?? '—'}</dd>
            </div>
            <div>
              <dt>Q4 rating</dt>
              <dd>{q4 ?? '—'}</dd>
            </div>
            <div>
              <dt>Q5 rating</dt>
              <dd>{q5 ?? '—'}</dd>
            </div>
            <div>
              <dt>Overall rating</dt>
              <dd>{overall ?? '—'}</dd>
            </div>
            <div>
              <dt>Comment</dt>
              <dd>{comment ?? '—'}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                {submittedAt
                  ? new Date(submittedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
        <div className="portal-course-feedback-modal__actions">
          <button
            type="button"
            className="portal-btn portal-btn--secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

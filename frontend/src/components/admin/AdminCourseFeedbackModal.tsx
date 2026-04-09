import { useEffect, useState, type MouseEvent } from 'react'
import {
  fetchAdminCourseFeedback,
  type CourseFeedbackApiItem,
} from '../../lib/api'

const COURSE_FEEDBACK_QUESTIONS = [
  'Course content was clear and well organized.',
  'The instructor explained concepts effectively.',
  'The pace of the course was appropriate.',
  'Assignments and learning activities supported my learning.',
  'I would recommend this course to other students.',
] as const

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
            courseCode,
            term,
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
          <br />
          {term.trim()} {year}
        </p>
        {loading ? (
          <p className="portal-card-note">Loading…</p>
        ) : error ? (
          <p className="portal-card-note portal-profile-state--error" role="alert">
            {error}
          </p>
        ) : !f ? (
          <p className="portal-card-note">No feedback submitted yet</p>
        ) : (
          <dl className="portal-course-feedback-modal__readonly-dl">
            <div>
              <dt>{COURSE_FEEDBACK_QUESTIONS[0]}</dt>
              <dd>{f.q1Rating}</dd>
            </div>
            <div>
              <dt>{COURSE_FEEDBACK_QUESTIONS[1]}</dt>
              <dd>{f.q2Rating}</dd>
            </div>
            <div>
              <dt>{COURSE_FEEDBACK_QUESTIONS[2]}</dt>
              <dd>{f.q3Rating}</dd>
            </div>
            <div>
              <dt>{COURSE_FEEDBACK_QUESTIONS[3]}</dt>
              <dd>{f.q4Rating}</dd>
            </div>
            <div>
              <dt>{COURSE_FEEDBACK_QUESTIONS[4]}</dt>
              <dd>{f.q5Rating}</dd>
            </div>
            <div>
              <dt>Overall rating</dt>
              <dd>{f.overallRating}</dd>
            </div>
            <div>
              <dt>Additional comments</dt>
              <dd>
                {f.comment != null && f.comment.trim() !== '' ? f.comment : '—'}
              </dd>
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

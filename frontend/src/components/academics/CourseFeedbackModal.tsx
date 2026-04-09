import { useEffect, useId, useState, type FormEvent, type MouseEvent } from 'react'
import {
  fetchStudentCourseFeedback,
  postStudentCourseFeedback,
  type CourseFeedbackApiItem,
  type StudentAcademicsResponse,
} from '../../lib/api'
import { courseRowDisplayTitle } from '../../lib/academicsTranscriptDisplay'

export type EnrollmentHistoryRow = StudentAcademicsResponse['enrollmentHistory'][number]

const COURSE_FEEDBACK_QUESTIONS = [
  'Course content was clear and well organized.',
  'The instructor explained concepts effectively.',
  'The pace of the course was appropriate.',
  'Assignments and learning activities supported my learning.',
  'I would recommend this course to other students.',
] as const

const RATING_WORDS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

const RATING_SCALE_LEGEND =
  '1 = Poor · 2 = Fair · 3 = Good · 4 = Very Good · 5 = Excellent'

function isRating(n: unknown): n is number {
  return typeof n === 'number' && n >= 1 && n <= 5 && Number.isInteger(n)
}

function formatRatingDisplay(n: number): string {
  const word = RATING_WORDS[n]
  return word ? `${n} — ${word}` : String(n)
}

function formatSubmittedAt(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d)
  } catch {
    return '—'
  }
}

function RatingScaleRow({
  name,
  value,
  onChange,
  labelledBy,
}: {
  name: string
  value: number
  onChange: (n: number) => void
  labelledBy: string
}) {
  return (
    <div
      className="portal-course-feedback-modal__rating-scale"
      role="radiogroup"
      aria-labelledby={labelledBy}
    >
      <div className="portal-course-feedback-modal__rating-scale-row">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={
              value === n
                ? 'portal-course-feedback-modal__rating-option portal-course-feedback-modal__rating-option--selected'
                : 'portal-course-feedback-modal__rating-option'
            }
          >
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
            />
            <span className="portal-course-feedback-modal__rating-option-face" aria-hidden>
              {n}
            </span>
          </label>
        ))}
      </div>
      <p className="portal-course-feedback-modal__rating-scale-legend portal-text-muted">{RATING_SCALE_LEGEND}</p>
    </div>
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
  const reactId = useId()
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
  const courseTitle = courseRowDisplayTitle(row)
  const courseLine = `${row.courseCode.trim()} — ${courseTitle}`
  const termLine = `${row.term} ${row.year}`

  const radioName = (suffix: string) => `cfb-${suffix}-${reactId.replace(/:/g, '')}`

  const view = viewItem

  return (
    <div
      className="portal-course-feedback-modal-backdrop"
      onMouseDown={backdropMouseDown}
      role="presentation"
    >
      <div
        className="portal-course-feedback-modal portal-course-feedback-modal--student-eval"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="portal-course-feedback-modal__header">
          {mode === 'submit' ? (
            <h2 id={titleId} className="portal-course-feedback-modal__header-title">
              Course evaluation
            </h2>
          ) : (
            <h2 id={titleId} className="portal-course-feedback-modal__header-title">
              Submitted evaluation
            </h2>
          )}
          <p className="portal-course-feedback-modal__header-course">{courseLine}</p>
          {mode === 'view' ? (
            <p className="portal-course-feedback-modal__header-term portal-text-muted">{termLine}</p>
          ) : null}
        </header>
        <div className="portal-course-feedback-modal__section-divider" aria-hidden="true" />

        {mode === 'submit' ? (
          <form onSubmit={handleSubmit}>
            <div className="portal-course-feedback-modal__feedback-block">
              <p className="portal-course-feedback-modal__question" id="cfb-q1-text">
                {COURSE_FEEDBACK_QUESTIONS[0]}
              </p>
              <RatingScaleRow
                name={radioName('q1')}
                value={q1}
                onChange={setQ1}
                labelledBy="cfb-q1-text"
              />
            </div>
            <div className="portal-course-feedback-modal__feedback-block">
              <p className="portal-course-feedback-modal__question" id="cfb-q2-text">
                {COURSE_FEEDBACK_QUESTIONS[1]}
              </p>
              <RatingScaleRow
                name={radioName('q2')}
                value={q2}
                onChange={setQ2}
                labelledBy="cfb-q2-text"
              />
            </div>
            <div className="portal-course-feedback-modal__feedback-block">
              <p className="portal-course-feedback-modal__question" id="cfb-q3-text">
                {COURSE_FEEDBACK_QUESTIONS[2]}
              </p>
              <RatingScaleRow
                name={radioName('q3')}
                value={q3}
                onChange={setQ3}
                labelledBy="cfb-q3-text"
              />
            </div>
            <div className="portal-course-feedback-modal__feedback-block">
              <p className="portal-course-feedback-modal__question" id="cfb-q4-text">
                {COURSE_FEEDBACK_QUESTIONS[3]}
              </p>
              <RatingScaleRow
                name={radioName('q4')}
                value={q4}
                onChange={setQ4}
                labelledBy="cfb-q4-text"
              />
            </div>
            <div className="portal-course-feedback-modal__feedback-block">
              <p className="portal-course-feedback-modal__question" id="cfb-q5-text">
                {COURSE_FEEDBACK_QUESTIONS[4]}
              </p>
              <RatingScaleRow
                name={radioName('q5')}
                value={q5}
                onChange={setQ5}
                labelledBy="cfb-q5-text"
              />
            </div>
            <div className="portal-course-feedback-modal__feedback-block portal-course-feedback-modal__feedback-block--overall">
              <p className="portal-course-feedback-modal__question" id="cfb-overall-text">
                Overall rating
              </p>
              <RatingScaleRow
                name={radioName('overall')}
                value={overall}
                onChange={setOverall}
                labelledBy="cfb-overall-text"
              />
            </div>
            <div className="portal-course-feedback-modal__comment-block">
              <label className="portal-course-feedback-modal__comment-label" htmlFor="cfb-comment">
                Additional comments
              </label>
              <textarea
                id="cfb-comment"
                className="portal-course-feedback-modal__comment-textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={8000}
                rows={4}
                placeholder="Share any additional feedback about this course."
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
        ) : null}

        {mode === 'view' ? (
          <>
            {viewLoading ? <p className="portal-card-note">Loading…</p> : null}
            {viewError && !viewLoading ? (
              <p className="portal-card-note portal-profile-state--error" role="alert">
                {viewError}
              </p>
            ) : null}
            {view && !viewLoading ? (
              <dl className="portal-course-feedback-modal__readonly-dl">
                <div className="portal-course-feedback-modal__readonly-row">
                  <dt className="portal-course-feedback-modal__readonly-label">{COURSE_FEEDBACK_QUESTIONS[0]}</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {isRating(view.q1Rating) ? formatRatingDisplay(view.q1Rating) : '—'}
                  </dd>
                </div>
                <div className="portal-course-feedback-modal__readonly-row">
                  <dt className="portal-course-feedback-modal__readonly-label">{COURSE_FEEDBACK_QUESTIONS[1]}</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {isRating(view.q2Rating) ? formatRatingDisplay(view.q2Rating) : '—'}
                  </dd>
                </div>
                <div className="portal-course-feedback-modal__readonly-row">
                  <dt className="portal-course-feedback-modal__readonly-label">{COURSE_FEEDBACK_QUESTIONS[2]}</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {isRating(view.q3Rating) ? formatRatingDisplay(view.q3Rating) : '—'}
                  </dd>
                </div>
                <div className="portal-course-feedback-modal__readonly-row">
                  <dt className="portal-course-feedback-modal__readonly-label">{COURSE_FEEDBACK_QUESTIONS[3]}</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {isRating(view.q4Rating) ? formatRatingDisplay(view.q4Rating) : '—'}
                  </dd>
                </div>
                <div className="portal-course-feedback-modal__readonly-row">
                  <dt className="portal-course-feedback-modal__readonly-label">{COURSE_FEEDBACK_QUESTIONS[4]}</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {isRating(view.q5Rating) ? formatRatingDisplay(view.q5Rating) : '—'}
                  </dd>
                </div>
                <div className="portal-course-feedback-modal__readonly-row">
                  <dt className="portal-course-feedback-modal__readonly-label">Overall rating</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {isRating(view.overallRating) ? formatRatingDisplay(view.overallRating) : '—'}
                  </dd>
                </div>
                <div className="portal-course-feedback-modal__readonly-row portal-course-feedback-modal__readonly-row--multiline">
                  <dt className="portal-course-feedback-modal__readonly-label">Additional comments</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {view.comment != null && view.comment.trim() !== '' ? view.comment : '—'}
                  </dd>
                </div>
                <div className="portal-course-feedback-modal__readonly-row portal-course-feedback-modal__readonly-row--submitted">
                  <dt className="portal-course-feedback-modal__readonly-label">Submitted</dt>
                  <dd className="portal-course-feedback-modal__readonly-value">
                    {formatSubmittedAt(view.submittedAt)}
                  </dd>
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

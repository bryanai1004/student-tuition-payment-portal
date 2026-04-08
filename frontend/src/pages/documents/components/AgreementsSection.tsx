import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from '../../../context/AccountContext'
import {
  fetchStudentProfile,
  submitStudentDocumentAgreement,
  type StudentDocumentRequirement,
} from '../../../lib/api'
import {
  COPYRIGHT_RELEASE_CLOSING_TEMPLATE,
  COPYRIGHT_RELEASE_PARAGRAPHS,
  COPYRIGHT_RELEASE_SUBMIT_NOTE,
} from '../../../data/copyrightReleaseAgreement'

type AgreementsSectionProps = {
  studentId: string
  academicTermId: string
  requirement: StudentDocumentRequirement | undefined
  onRefresh: () => Promise<void>
}

export function AgreementsSection({
  studentId,
  academicTermId,
  requirement,
  onRefresh,
}: AgreementsSectionProps) {
  const { account } = useAccount()
  const [profileName, setProfileName] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = studentId.trim()
    if (!id) {
      setProfileName(null)
      return
    }
    const ac = new AbortController()
    fetchStudentProfile(id, { signal: ac.signal })
      .then((p) => setProfileName(p.fullName?.trim() || null))
      .catch(() => setProfileName(null))
    return () => ac.abort()
  }, [studentId])

  const displayName = useMemo(() => {
    const n = profileName || account.student.name?.trim()
    return n && n.length > 0 ? n : 'the student'
  }, [profileName, account.student.name])

  const completed = requirement?.status === 'completed'
  const submittedAt = requirement?.submittedAt ?? null

  const closing = useMemo(() => {
    return COPYRIGHT_RELEASE_CLOSING_TEMPLATE.replace('{{NAME}}', displayName)
  }, [displayName])

  const handleSubmit = useCallback(async () => {
    if (!agreed || completed || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await submitStudentDocumentAgreement(studentId, academicTermId)
      await onRefresh()
      setAgreed(false)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not submit the agreement. Try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }, [academicTermId, agreed, completed, onRefresh, studentId, submitting])

  const statusLabel =
    requirement == null
      ? 'Unknown'
      : requirement.status === 'completed'
        ? 'Completed'
        : 'Assigned'

  return (
    <div className="portal-documents-agreements">
      <div className="portal-doc-quiz-entry-card">
        <div className="portal-doc-quiz-entry-card__row">
          <div className="portal-doc-quiz-entry-card__text">
            <p className="portal-doc-quiz-entry-card__title">Copyright Release Agreement</p>
            <p className="portal-doc-quiz-entry-card__desc">
              Review and submit the university copyright release for recordings and promotional use.
            </p>
            <p className="portal-inline-note portal-inline-note--flush">
              Status: <strong>{statusLabel}</strong>
              {submittedAt ? (
                <>
                  {' '}
                  · Submitted {new Date(submittedAt).toLocaleString()}
                </>
              ) : null}
            </p>
          </div>
          <div className="portal-doc-quiz-entry-card__aside">
            {completed ? (
              <span className="portal-doc-quiz-entry-card__completed" aria-label="Completed">
                Completed
              </span>
            ) : null}
            <button
              type="button"
              className="portal-tab portal-doc-quiz-tab"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? 'Hide agreement' : 'View agreement'}
            </button>
          </div>
        </div>
        {error ? (
          <p className="portal-inline-note portal-inline-note--flush" role="alert">
            {error}
          </p>
        ) : null}
        {expanded ? (
          <div className="portal-doc-quiz-entry-card__expand">
            <div className="portal-doc-quiz-expand-form">
              <div className="portal-doc-quiz-expand-form__inner portal-documents-agreement-body">
                <img
                  className="portal-documents-agreement-body__logo"
                  src="/AMULogo.png"
                  alt="Alhambra Medical University"
                />
                <h4 className="portal-documents-agreement-body__title">Copyright Release Agreement</h4>
                {COPYRIGHT_RELEASE_PARAGRAPHS.map((para, i) => (
                  <p key={i} className="portal-documents-agreement-body__para">
                    {para.split('\n').map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 ? <br /> : null}
                      </span>
                    ))}
                  </p>
                ))}
                <p className="portal-documents-agreement-body__para">{closing}</p>
                <p className="portal-documents-agreement-body__para">{COPYRIGHT_RELEASE_SUBMIT_NOTE}</p>

                {completed ? (
                  <p className="portal-documents-agreement-body__success" role="status">
                    Submitted. This agreement is on file for this term.
                    {submittedAt ? ` (${new Date(submittedAt).toLocaleString()})` : ''}
                  </p>
                ) : (
                  <div className="portal-documents-agreement-body__actions">
                    <label className="portal-documents-agreement-body__check">
                      <input
                        type="checkbox"
                        checked={agreed}
                        disabled={submitting}
                        onChange={(e) => setAgreed(e.target.checked)}
                      />
                      <span>
                        I have read, understood, and agreed to the above statements, terms, and
                        conditions.
                      </span>
                    </label>
                    <button
                      type="button"
                      className="portal-btn portal-btn--primary portal-documents-agreement-body__submit"
                      disabled={!agreed || submitting}
                      onClick={() => {
                        void handleSubmit()
                      }}
                    >
                      {submitting ? 'Submitting…' : 'Submit'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

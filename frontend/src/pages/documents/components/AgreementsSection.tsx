import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount } from '../../../context/AccountContext'
import { fetchStudentProfile } from '../../../lib/api'
import {
  COPYRIGHT_AGREEMENT_STORAGE_KEY,
  COPYRIGHT_RELEASE_CLOSING_TEMPLATE,
  COPYRIGHT_RELEASE_PARAGRAPHS,
  COPYRIGHT_RELEASE_SUBMIT_NOTE,
} from '../../../data/copyrightReleaseAgreement'

function readSigned(): boolean {
  try {
    return localStorage.getItem(COPYRIGHT_AGREEMENT_STORAGE_KEY) === 'signed'
  } catch {
    return false
  }
}

function writeSigned() {
  try {
    localStorage.setItem(COPYRIGHT_AGREEMENT_STORAGE_KEY, 'signed')
  } catch {
    /* ignore */
  }
}

export function AgreementsSection() {
  const { account, currentStudentId } = useAccount()
  const [profileName, setProfileName] = useState<string | null>(null)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setProfileName(null)
      return
    }
    const ac = new AbortController()
    fetchStudentProfile(id, { signal: ac.signal })
      .then((p) => setProfileName(p.fullName?.trim() || null))
      .catch(() => setProfileName(null))
    return () => ac.abort()
  }, [currentStudentId])

  const displayName = useMemo(() => {
    const n = profileName || account.student.name?.trim()
    return n && n.length > 0 ? n : 'the student'
  }, [profileName, account.student.name])

  const [expanded, setExpanded] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [submitted, setSubmitted] = useState(() => readSigned())

  useEffect(() => {
    setSubmitted(readSigned())
  }, [])

  const closing = useMemo(() => {
    return COPYRIGHT_RELEASE_CLOSING_TEMPLATE.replace('{{NAME}}', displayName)
  }, [displayName])

  const handleSubmit = useCallback(() => {
    if (!agreed) return
    writeSigned()
    setSubmitted(true)
  }, [agreed])

  return (
    <div className="portal-documents-agreements">
      <div className="portal-doc-quiz-entry-card">
        <div className="portal-doc-quiz-entry-card__row">
          <div className="portal-doc-quiz-entry-card__text">
            <p className="portal-doc-quiz-entry-card__title">Copyright Release Agreement</p>
            <p className="portal-doc-quiz-entry-card__desc">
              Review and submit the university copyright release for recordings and promotional use.
            </p>
          </div>
          <div className="portal-doc-quiz-entry-card__aside">
            <button
              type="button"
              className="portal-tab portal-doc-quiz-tab"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? 'Hide agreement' : 'View agreement'}
            </button>
          </div>
        </div>
        {expanded ? (
          <div className="portal-doc-quiz-entry-card__expand">
            <div className="portal-doc-quiz-expand-form">
              <div className="portal-doc-quiz-expand-form__inner portal-documents-agreement-body">
                <h3 className="portal-documents-agreement-body__school">Alhambra Medical University</h3>
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

                {submitted ? (
                  <p className="portal-documents-agreement-body__success" role="status">
                    Submitted. Thank you — your agreement has been recorded for this browser session.
                  </p>
                ) : (
                  <div className="portal-documents-agreement-body__actions">
                    <label className="portal-documents-agreement-body__check">
                      <input
                        type="checkbox"
                        checked={agreed}
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
                      disabled={!agreed}
                      onClick={handleSubmit}
                    >
                      Submit
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

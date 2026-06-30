import { useCallback, useEffect, useState } from 'react'
import {
  fetchStudentLoginEmailStatus,
  sendStudentLoginEmailCode,
  verifyStudentLoginEmailCode,
  type StudentLoginEmailStatus,
} from '../lib/api'

type Props = {
  /** When false, the panel is hidden until the student profile has loaded. */
  ready: boolean
  /** Renders inside the profile card without an extra outer card shell. */
  embedded?: boolean
}

export function StudentLoginEmailPanel({ ready, embedded = false }: Props) {
  const [status, setStatus] = useState<StudentLoginEmailStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const next = await fetchStudentLoginEmailStatus()
      setStatus(next)
      if (!next.verified) {
        setEditing(true)
      } else {
        setEditing(false)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Unable to load login email.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    void loadStatus()
  }, [ready, loadStatus])

  function resetEditState() {
    setEditing(false)
    setEmailInput('')
    setCodeInput('')
    setCodeSent(false)
    setActionError(null)
    setActionSuccess(null)
  }

  function startEdit() {
    setEditing(true)
    setEmailInput('')
    setCodeInput('')
    setCodeSent(false)
    setActionError(null)
    setActionSuccess(null)
  }

  async function handleSendCode() {
    const email = emailInput.trim()
    if (!email) {
      setActionError('Enter an email address.')
      return
    }
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      await sendStudentLoginEmailCode(email)
      setCodeSent(true)
      setActionSuccess('Verification code sent. Check your inbox.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Unable to send code.')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleVerify() {
    const email = emailInput.trim()
    const code = codeInput.trim()
    if (!email || !code) {
      setActionError('Enter your email and the 6-digit code.')
      return
    }
    setActionLoading(true)
    setActionError(null)
    setActionSuccess(null)
    try {
      const next = await verifyStudentLoginEmailCode(email, code)
      setStatus(next)
      resetEditState()
      setActionSuccess('Email verified — you can sign in with a one-time code.')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Verification failed.')
    } finally {
      setActionLoading(false)
    }
  }

  if (!ready) return null

  const Wrapper = embedded ? 'div' : 'section'
  const wrapperClass = embedded
    ? 'portal-login-email-embedded'
    : 'portal-card portal-stack portal-login-email-card'

  return (
    <Wrapper
      className={wrapperClass}
      aria-labelledby="login-email-heading"
    >
      <h2 id="login-email-heading" className="portal-section-heading">
        Login email
      </h2>
      <p className="portal-login-email-intro">
        Verify an email to sign in with a one-time code or reset your password later.
        This is separate from your contact email above.
      </p>

      {loading ? (
        <p className="portal-card-note" aria-live="polite">
          Loading login email…
        </p>
      ) : null}

      {!loading && loadError ? (
        <div className="portal-login-email-state portal-login-email-state--error" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-btn--sm"
            onClick={() => void loadStatus()}
          >
            Try again
          </button>
        </div>
      ) : null}

      {!loading && !loadError && status?.verified && !editing ? (
        <div className="portal-login-email-verified">
          <div className="portal-login-email-row">
            <span className="portal-login-email-label">Email</span>
            <span className="portal-login-email-value">{status.emailMasked}</span>
            <button
              type="button"
              className="portal-login-email-edit"
              onClick={startEdit}
              aria-label="Change login email"
            >
              ✎
            </button>
          </div>
          <p className="portal-login-email-status">
            Verified — you can sign in with a one-time code.
          </p>
        </div>
      ) : null}

      {!loading && !loadError && (!status?.verified || editing) ? (
        <div className="portal-login-email-form">
          <label className="portal-login-email-field" htmlFor="login-email-input">
            <span className="portal-login-email-label">Email</span>
            <input
              id="login-email-input"
              className="portal-profile-input portal-login-email-input"
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              disabled={actionLoading || codeSent}
            />
          </label>

          {codeSent ? (
            <label className="portal-login-email-field" htmlFor="login-email-code">
              <span className="portal-login-email-label">Verification code</span>
              <input
                id="login-email-code"
                className="portal-profile-input portal-login-email-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                maxLength={6}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={actionLoading}
              />
            </label>
          ) : null}

          <div className="portal-login-email-actions">
            {!codeSent ? (
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--sm"
                onClick={() => void handleSendCode()}
                disabled={actionLoading}
              >
                {actionLoading ? 'Sending…' : 'Send code'}
              </button>
            ) : (
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--sm"
                onClick={() => void handleVerify()}
                disabled={actionLoading}
              >
                {actionLoading ? 'Verifying…' : 'Verify'}
              </button>
            )}
            <button
              type="button"
              className="portal-btn portal-btn--secondary portal-btn--sm"
              onClick={resetEditState}
              disabled={actionLoading}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {actionSuccess ? (
        <p className="portal-login-email-status" role="status" aria-live="polite">
          {actionSuccess}
        </p>
      ) : null}
      {actionError ? (
        <p className="portal-login-email-error" role="alert" aria-live="assertive">
          {actionError}
        </p>
      ) : null}
    </Wrapper>
  )
}

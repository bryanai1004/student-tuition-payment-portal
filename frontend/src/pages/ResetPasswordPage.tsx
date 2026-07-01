import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { LoginFooter } from '../components/LoginFooter'
import { PortalLoginPasswordInput } from '../components/PortalLoginPasswordInput'
import {
  confirmStudentPasswordReset,
  validateStudentPasswordResetToken,
} from '../lib/api'

export function ResetPasswordPage() {
  const t = useStudentPortalT()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [emailMasked, setEmailMasked] = useState<string | null>(null)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (token.length === 0) {
      setTokenValid(false)
      return
    }

    const ac = new AbortController()
    setTokenValid(null)
    ;(async () => {
      try {
        const result = await validateStudentPasswordResetToken(token, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        if (result.valid) {
          setTokenValid(true)
          setEmailMasked(result.emailMasked)
        } else {
          setTokenValid(false)
        }
      } catch {
        if (!ac.signal.aborted) setTokenValid(false)
      }
    })()

    return () => ac.abort()
  }, [token])

  async function handleSubmit() {
    if (!token) return
    const pw = password.trim()
    const confirm = confirmPassword.trim()
    if (pw.length < 8) {
      setFormError(t('passwordMinLength'))
      return
    }
    if (pw !== confirm) {
      setFormError(t('passwordMismatch'))
      return
    }

    setFormError(null)
    setFormNotice(null)
    setSubmitting(true)
    try {
      const result = await confirmStudentPasswordReset(token, pw)
      setFormNotice(result.message || t('passwordResetSuccess'))
      window.setTimeout(() => navigate('/login'), 1500)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('signInFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-shell portal-shell--login">
      <div className="portal-login-body">
        <div className="portal-login-stack">
          <img
            className="portal-login-logo"
            src="/AMULogo.png"
            alt={t('alhambraLogoAlt')}
          />
          <article className="portal-login-card">
            <h1 className="portal-login-card-title">{t('resetPasswordTitle')}</h1>

            {tokenValid === null ? (
              <p className="portal-login-card-intro">{t('signingIn')}</p>
            ) : null}

            {tokenValid === false ? (
              <>
                <p className="portal-login-error" role="alert">
                  {t('passwordResetInvalidLink')}
                </p>
                <p className="portal-login-back-link-wrap">
                  <Link className="portal-login-help-link" to="/login/forgot-password">
                    {t('sendResetLink')}
                  </Link>
                </p>
              </>
            ) : null}

            {tokenValid === true ? (
              <>
                <p className="portal-login-card-intro">
                  {t('resetPasswordIntro')} <strong>{emailMasked}</strong>
                </p>

                <div className="portal-login-fields">
                  <div className="portal-login-field">
                    <label className="portal-login-label" htmlFor="reset-password">
                      {t('newPassword')}
                    </label>
                    <PortalLoginPasswordInput
                      id="reset-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="portal-login-field">
                    <label className="portal-login-label" htmlFor="reset-password-confirm">
                      {t('confirmPassword')}
                    </label>
                    <PortalLoginPasswordInput
                      id="reset-password-confirm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>

                {formNotice ? (
                  <p className="portal-login-notice" role="status">
                    {formNotice}
                  </p>
                ) : null}
                {formError ? (
                  <p className="portal-login-error" role="alert">
                    {formError}
                  </p>
                ) : null}

                <button
                  type="button"
                  className="portal-login-submit"
                  onClick={() => void handleSubmit()}
                  disabled={submitting}
                >
                  {submitting ? t('savingNewPassword') : t('saveNewPassword')}
                </button>
              </>
            ) : null}

            <p className="portal-login-back-link-wrap">
              <Link className="portal-login-help-link" to="/login">
                {t('backToSignIn')}
              </Link>
            </p>
          </article>
        </div>
      </div>
      <LoginFooter />
    </div>
  )
}

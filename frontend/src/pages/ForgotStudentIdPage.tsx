import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { LoginFooter } from '../components/LoginFooter'
import { requestStudentIdRecovery } from '../lib/api'

export function ForgotStudentIdPage() {
  const t = useStudentPortalT()
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const trimmed = email.trim()
    if (!trimmed) {
      setFormError(t('loginEmailRequired'))
      return
    }
    setFormError(null)
    setFormNotice(null)
    setSubmitting(true)
    try {
      const result = await requestStudentIdRecovery(trimmed)
      setFormNotice(result.message || t('studentIdRecoverySent'))
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
            <h1 className="portal-login-card-title">{t('forgotStudentIdTitle')}</h1>
            <p className="portal-login-card-intro">{t('forgotStudentIdIntro')}</p>

            <div className="portal-login-fields">
              <div className="portal-login-field">
                <label className="portal-login-label" htmlFor="forgot-student-id-email">
                  {t('loginEmail')}
                </label>
                <input
                  id="forgot-student-id-email"
                  className="portal-login-input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              {submitting ? t('sendingStudentId') : t('sendStudentId')}
            </button>

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

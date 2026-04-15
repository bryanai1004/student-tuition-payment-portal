import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { LoginFooter } from '../components/LoginFooter'
import { PortalLoginPasswordInput } from '../components/PortalLoginPasswordInput'
import { useAccount } from '../context/AccountContext'
import { loginStudent } from '../lib/api'

export function LoginPage() {
  const navigate = useNavigate()
  const t = useStudentPortalT()
  const { login } = useAccount()
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSignIn() {
    const id = studentId.trim()
    const pw = password.trim()
    if (!id || !pw) {
      setFormError(t('loginRequiredFields'))
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      const result = await loginStudent(id, password)
      login(result.studentId, result.accessToken ?? null)
      navigate('/dashboard')
    } catch (e) {
      const message =
        e instanceof Error ? e.message : t('signInFailed')
      setFormError(message)
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
            <h1 className="portal-login-card-title">{t('studentPortal')}</h1>
            <div className="portal-login-fields">
              <div className="portal-login-field">
                <label className="portal-login-label" htmlFor="login-student-id">
                  {t('studentId')}
                </label>
                <input
                  id="login-student-id"
                  className="portal-login-input"
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                />
              </div>
              <div className="portal-login-field">
                <label className="portal-login-label" htmlFor="login-password">
                  {t('password')}
                </label>
                <PortalLoginPasswordInput
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            {formError ? (
              <p
                className="portal-login-error"
                role="alert"
                style={{ color: '#6e1622', fontSize: '0.875rem', margin: '0 0 0.5rem' }}
              >
                {formError}
              </p>
            ) : null}
            <button
              type="button"
              className="portal-login-submit"
              onClick={() => void handleSignIn()}
              disabled={submitting}
            >
              {submitting ? t('signingIn') : t('signIn')}
            </button>
            <nav className="portal-login-help-links" aria-label={t('accountHelpAria')}>
              <a className="portal-login-help-link" href="#">
                {t('forgotStudentId')}
              </a>
              <span className="portal-login-help-sep" aria-hidden="true">
                |
              </span>
              <a className="portal-login-help-link" href="#">
                {t('forgotPassword')}
              </a>
            </nav>
          </article>
        </div>
      </div>
      <LoginFooter />
    </div>
  )
}

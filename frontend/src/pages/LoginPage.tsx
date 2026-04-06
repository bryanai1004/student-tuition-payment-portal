import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PORTAL_BRANDING_TITLE, PORTAL_SHELL_SUBTITLE } from '../branding'
import { LoginFooter } from '../components/LoginFooter'
import { useAccount } from '../context/AccountContext'
import { loginStudent } from '../lib/api'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAccount()
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSignIn() {
    const id = studentId.trim()
    const pw = password.trim()
    if (!id || !pw) {
      setFormError('Student ID and Password are required')
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      const result = await loginStudent(id, password)
      login(result.studentId)
      navigate('/dashboard')
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Sign in failed. Please try again.'
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
            alt="Alhambra Medical University"
          />
          <article className="portal-login-card">
            <h1 className="portal-login-card-title">{PORTAL_SHELL_SUBTITLE}</h1>
            <p className="portal-login-card-institution">{PORTAL_BRANDING_TITLE}</p>
            <div className="portal-login-fields">
              <div className="portal-login-field">
                <label className="portal-login-label" htmlFor="login-student-id">
                  Student ID
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
                  Password
                </label>
                <div className="portal-login-password-wrap">
                  <input
                    id="login-password"
                    className="portal-login-input portal-login-input--with-toggle"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="portal-login-password-toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden={true}
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden={true}
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
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
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
            <nav className="portal-login-help-links" aria-label="Account help">
              <a className="portal-login-help-link" href="#">
                Forgot Student ID
              </a>
              <span className="portal-login-help-sep" aria-hidden="true">
                |
              </span>
              <a className="portal-login-help-link" href="#">
                Forgot Password
              </a>
            </nav>
          </article>
        </div>
      </div>
      <LoginFooter />
    </div>
  )
}

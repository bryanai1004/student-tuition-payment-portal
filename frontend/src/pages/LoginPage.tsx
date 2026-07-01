import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { LoginFooter } from '../components/LoginFooter'
import { PortalLoginPasswordInput } from '../components/PortalLoginPasswordInput'
import { useAccount } from '../context/AccountContext'
import {
  loginStudent,
  sendStudentLoginOtpCode,
  verifyStudentLoginOtp,
} from '../lib/api'

type LoginMode = 'password' | 'otp'

export function LoginPage() {
  const navigate = useNavigate()
  const t = useStudentPortalT()
  const { login } = useAccount()
  const [mode, setMode] = useState<LoginMode>('password')
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formNotice, setFormNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)

  function switchMode(next: LoginMode) {
    setMode(next)
    setFormError(null)
    setFormNotice(null)
    setCodeSent(false)
    setOtpCode('')
  }

  async function handlePasswordSignIn() {
    const id = studentId.trim()
    const pw = password.trim()
    if (!id || !pw) {
      setFormError(t('loginRequiredFields'))
      return
    }
    setFormError(null)
    setFormNotice(null)
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

  async function handleSendCode() {
    const email = loginEmail.trim()
    if (!email) {
      setFormError(t('loginEmailRequired'))
      return
    }
    setFormError(null)
    setFormNotice(null)
    setSendingCode(true)
    try {
      await sendStudentLoginOtpCode(email)
      setCodeSent(true)
      setFormNotice(t('loginCodeSent'))
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('signInFailed'))
    } finally {
      setSendingCode(false)
    }
  }

  async function handleOtpSignIn() {
    const email = loginEmail.trim()
    const code = otpCode.trim()
    if (!email || !code) {
      setFormError(t('loginCodeRequired'))
      return
    }
    setFormError(null)
    setFormNotice(null)
    setSubmitting(true)
    try {
      const result = await verifyStudentLoginOtp(email, code)
      login(result.studentId, result.accessToken ?? null)
      navigate('/dashboard')
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
            <h1 className="portal-login-card-title">{t('studentPortal')}</h1>

            {mode === 'password' ? (
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
            ) : (
              <div className="portal-login-fields">
                <div className="portal-login-field">
                  <label className="portal-login-label" htmlFor="login-email">
                    {t('loginEmail')}
                  </label>
                  <input
                    id="login-email"
                    className="portal-login-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value)
                      setCodeSent(false)
                      setOtpCode('')
                    }}
                  />
                </div>
                {codeSent ? (
                  <div className="portal-login-field">
                    <label className="portal-login-label" htmlFor="login-otp-code">
                      {t('verificationCode')}
                    </label>
                    <input
                      id="login-otp-code"
                      className="portal-login-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="portal-login-secondary-btn"
                  onClick={() => void handleSendCode()}
                  disabled={sendingCode || submitting}
                >
                  {sendingCode ? t('sendingCode') : t('sendSignInCode')}
                </button>
              </div>
            )}

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
              onClick={() =>
                void (mode === 'password' ? handlePasswordSignIn() : handleOtpSignIn())
              }
              disabled={submitting || sendingCode}
            >
              {submitting ? t('signingIn') : t('signIn')}
            </button>

            {mode === 'password' ? (
              <nav className="portal-login-help-links" aria-label={t('accountHelpAria')}>
                <Link className="portal-login-help-link" to="/login/forgot-student-id">
                  {t('forgotStudentId')}
                </Link>
                <span className="portal-login-help-sep" aria-hidden="true">
                  |
                </span>
                <Link className="portal-login-help-link" to="/login/forgot-password">
                  {t('forgotPassword')}
                </Link>
              </nav>
            ) : null}

            <div className="portal-login-mode-switch">
              <button
                type="button"
                className="portal-login-mode-alt"
                onClick={() => switchMode(mode === 'password' ? 'otp' : 'password')}
                aria-label={
                  mode === 'password' ? t('signInWithCode') : t('signInWithPassword')
                }
              >
                {mode === 'password' ? t('useEmailCodeInstead') : t('usePasswordInstead')}
              </button>
            </div>
          </article>
        </div>
      </div>
      <LoginFooter />
    </div>
  )
}

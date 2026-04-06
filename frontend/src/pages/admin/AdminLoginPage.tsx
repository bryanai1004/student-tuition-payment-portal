import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginFooter } from '../../components/LoginFooter'
import { PortalLoginPasswordInput } from '../../components/PortalLoginPasswordInput'
import { useAdminAuth } from '../../context/AdminAuthContext'

export function AdminLoginPage() {
  const navigate = useNavigate()
  const { isAuthenticated, login } = useAdminAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/admin', { replace: true })
    }
  }, [isAuthenticated, navigate])

  function handleSignIn() {
    setFormError(null)
    const result = login(username, password)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    navigate('/admin', { replace: true })
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
            <h1 className="portal-login-card-title">ADMINISTRATOR PORTAL</h1>
            <div className="portal-login-fields">
              <div className="portal-login-field">
                <label className="portal-login-label" htmlFor="admin-login-username">
                  Username or Email
                </label>
                <input
                  id="admin-login-username"
                  className="portal-login-input"
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="portal-login-field">
                <label className="portal-login-label" htmlFor="admin-login-password">
                  Password
                </label>
                <PortalLoginPasswordInput
                  id="admin-login-password"
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
              onClick={handleSignIn}
            >
              Sign In
            </button>
          </article>
        </div>
      </div>
      <LoginFooter />
    </div>
  )
}

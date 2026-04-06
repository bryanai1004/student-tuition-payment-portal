import { forwardRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from '../context/AccountContext'
import { PORTAL_BRANDING_TITLE } from '../branding'
import { PORTAL_MOBILE_NAV_DRAWER_ID } from './PortalSidebar'
import { AIAssistantMobileDockAnchor } from './ai/AIAssistantMobileDockAnchor'
import { useAIAssistantMobileBreakpoint } from './ai/useAIAssistantMobileBreakpoint'

export const PORTAL_MOBILE_MENU_BUTTON_ID = 'portal-main-menu-button'

const LOGOUT_ICON_SRC = '/logout%20(1).svg'

type TopBarProps = {
  mobileMenuOpen?: boolean
  onMobileMenuToggle?: () => void
  showPortalBanner?: boolean
}

/** Global two-level portal header: school branding bar + myAMU banner (USC-style structure). */
export const TopBar = forwardRef<HTMLButtonElement, TopBarProps>(function TopBar(
  { mobileMenuOpen, onMobileMenuToggle, showPortalBanner = false },
  ref,
) {
  const navigate = useNavigate()
  const { account, loading, isAuthenticated, logout } = useAccount()
  const displayName = !isAuthenticated
    ? 'Student'
    : loading
      ? 'Loading…'
      : (account.student.name?.trim() || 'Student')

  const handleLogout = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const assistantMobile = useAIAssistantMobileBreakpoint()

  return (
    <header className="portal-app-header">
      <div className="portal-branding-bar" aria-label="School branding">
        <div className="portal-branding-bar-inner">
          <div className="portal-branding-bar-start">
            <button
              ref={ref}
              type="button"
              id={PORTAL_MOBILE_MENU_BUTTON_ID}
              className="portal-branding-bar-menu-btn"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen ?? false}
              aria-controls={PORTAL_MOBILE_NAV_DRAWER_ID}
              onClick={onMobileMenuToggle}
            >
              <span className="portal-branding-bar-menu-icon" aria-hidden="true" />
            </button>
            <Link
              to="/dashboard"
              className="portal-branding-bar-logo-link"
              aria-label={`${PORTAL_BRANDING_TITLE} — go to dashboard`}
            >
              <img
                src="/AMULogo.png"
                alt=""
                className="portal-branding-bar-logo"
                decoding="async"
              />
            </Link>
          </div>
          <div className="portal-branding-bar-actions portal-user-actions">
            <Link
              to="/my-account"
              className="portal-user-button"
              title="My account"
            >
              <img
                src="/user-circle.svg"
                alt=""
                className="portal-user-icon"
                width={17}
                height={17}
                decoding="async"
              />
              <span className="portal-user-button__label">{displayName}</span>
            </Link>
            <button
              type="button"
              className="portal-logout-button"
              onClick={handleLogout}
            >
              <img
                src={LOGOUT_ICON_SRC}
                alt=""
                className="portal-user-icon"
                width={17}
                height={17}
                decoding="async"
              />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
      {showPortalBanner ? (
        <div className="portal-portal-banner">
          <div className="portal-portal-banner-inner">
            <p className="portal-myamu-mark">
              <span className="portal-myamu-my">my</span>
              <span className="portal-myamu-amu">AMU</span>
            </p>
            {assistantMobile ? <AIAssistantMobileDockAnchor /> : null}
          </div>
        </div>
      ) : null}
    </header>
  )
})

TopBar.displayName = 'TopBar'

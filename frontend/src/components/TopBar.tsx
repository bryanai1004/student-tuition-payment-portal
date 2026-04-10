import { forwardRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '@/LanguageContext'
import { useAccount } from '../context/AccountContext'
import { PORTAL_BRANDING_TITLE } from '../branding'
import { PORTAL_MOBILE_NAV_DRAWER_ID } from './PortalSidebar'
import { AIAssistantMobileDockAnchor } from './ai/AIAssistantMobileDockAnchor'
import { useAIAssistantMobileBreakpoint } from './ai/useAIAssistantMobileBreakpoint'
import { IconLogout, IconUserCircle } from './icons/PortalModuleIcons'

export const PORTAL_MOBILE_MENU_BUTTON_ID = 'portal-main-menu-button'

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
  const { locale, toggleLanguage } = useLanguage()
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
          <div className="portal-branding-bar-end">
            <div className="portal-branding-bar-actions portal-user-actions">
              <div className="portal-branding-bar-user-cluster">
                <button
                  type="button"
                  className="portal-lang-toggle"
                  onClick={toggleLanguage}
                  aria-label={
                    locale === 'en' ? 'Switch language to 中文' : 'Switch language to English'
                  }
                >
                  <img src="/language.svg" alt="Language" width={18} height={18} decoding="async" />
                </button>
                <Link
                  to="/my-account"
                  className="portal-user-button"
                  title="My account"
                >
                  <span className="portal-user-icon" aria-hidden>
                    <IconUserCircle width={17} height={17} />
                  </span>
                  <span className="portal-user-button__label">{displayName}</span>
                </Link>
              </div>
              <button
                type="button"
                className="portal-logout-button"
                onClick={handleLogout}
              >
                <span className="portal-user-icon" aria-hidden>
                  <IconLogout width={17} height={17} />
                </span>
                <span>Logout</span>
              </button>
            </div>
            {assistantMobile && !showPortalBanner ? (
              <AIAssistantMobileDockAnchor className="portal-branding-bar__ai-dock-anchor" />
            ) : null}
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

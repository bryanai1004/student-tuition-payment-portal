import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../context/AccountContext'
import { PORTAL_BRANDING_TITLE } from '../branding'
import { PORTAL_MOBILE_NAV_DRAWER_ID } from './PortalSidebar'

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
  const { fetchedAccount, loading } = useAccount()
  const displayName = loading
    ? 'Loading…'
    : (fetchedAccount?.student.name?.trim() || 'Student')

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
              to="/login"
              className="portal-branding-bar-logo-link"
              aria-label={`${PORTAL_BRANDING_TITLE} — return to sign in`}
            >
              <img
                src="/AMULogo.png"
                alt=""
                className="portal-branding-bar-logo"
                decoding="async"
              />
            </Link>
          </div>
          <div className="portal-branding-bar-actions">
            <span className="portal-branding-bar-user" title="Signed-in student">
              {displayName}
            </span>
            <Link to="/login" className="portal-branding-bar-logout">
              Log out
            </Link>
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
          </div>
        </div>
      ) : null}
    </header>
  )
})

TopBar.displayName = 'TopBar'

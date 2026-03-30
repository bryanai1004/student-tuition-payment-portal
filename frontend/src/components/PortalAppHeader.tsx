import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { PORTAL_MOBILE_NAV_DRAWER_ID } from './PortalSidebar'

const PORTAL_MOBILE_MENU_BUTTON_ID = 'portal-main-menu-button'

type PortalAppHeaderProps = {
  title: string
  mobileMenuOpen?: boolean
  onMobileMenuToggle?: () => void
}

export const PortalAppHeader = forwardRef<HTMLButtonElement, PortalAppHeaderProps>(
  function PortalAppHeader({ title, mobileMenuOpen, onMobileMenuToggle }, ref) {
    return (
      <header className="portal-app-header">
        <div className="portal-app-header-inner">
          <div className="portal-app-header-leading">
            <button
              ref={ref}
              type="button"
              id={PORTAL_MOBILE_MENU_BUTTON_ID}
              className="portal-app-header-menu-btn"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen ?? false}
              aria-controls={PORTAL_MOBILE_NAV_DRAWER_ID}
              onClick={onMobileMenuToggle}
            >
              <span className="portal-app-header-menu-icon" aria-hidden="true" />
            </button>
            <Link to="/login" className="portal-app-header-logo-link" aria-label="Go to sign in">
              <img className="portal-app-header-logo" src="/AMULogo.png" alt="" />
            </Link>
          </div>
          <h1 className="portal-app-header-page-title">{title}</h1>
          <div className="portal-app-header-utilities">
            <span className="portal-app-header-placeholder" title="Reserved for future links">
              Notifications
            </span>
            <span className="portal-app-header-placeholder" title="Reserved for future links">
              Profile
            </span>
          </div>
        </div>
      </header>
    )
  }
)

PortalAppHeader.displayName = 'PortalAppHeader'

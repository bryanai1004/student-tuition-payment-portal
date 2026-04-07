import { NavLink } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import {
  IconAcademics,
  IconClinical,
  IconDocument,
  IconFinance,
  IconMyAccount,
  IconRegistration,
} from './icons/PortalModuleIcons'

function navClassName(isActive: boolean) {
  return ['portal-nav-link', 'sidebar-item', isActive ? 'portal-nav-link--active' : '']
    .filter(Boolean)
    .join(' ')
}

const MAIN_NAV_ITEMS: readonly {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}[] = [
  { to: '/registration', label: 'Registration', icon: IconRegistration },
  { to: '/finances', label: 'Finances', icon: IconFinance },
  { to: '/academics', label: 'Academics', icon: IconAcademics },
  { to: '/clinical', label: 'Clinical', icon: IconClinical },
  { to: '/documents', label: 'Documents', icon: IconDocument },
  { to: '/profile', label: 'My Account', icon: IconMyAccount },
]

type SidebarNavListProps = {
  onItemClick?: () => void
}

export function SidebarNavList({ onItemClick }: SidebarNavListProps) {
  const handleClick = () => {
    onItemClick?.()
  }

  return (
    <ul className="portal-sidebar-nav-list">
      {MAIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => navClassName(isActive)}
              onClick={handleClick}
            >
              <span className="portal-nav-link-icon">
                <Icon width={20} height={20} />
              </span>
              {item.label}
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}

/** Fixed left sidebar — visible on desktop only (see `portal.css`). */
export function Sidebar() {
  return (
    <aside className="portal-sidebar portal-sidebar--desktop" aria-label="Main navigation">
      <nav className="portal-sidebar-nav" aria-label="Portal modules">
        <SidebarNavList />
      </nav>
    </aside>
  )
}

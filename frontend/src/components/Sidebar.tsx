import { NavLink } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import { useLanguage } from '@/LanguageContext'
import { portalStudentLabel } from '@/lib/portalLocaleStrings'
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

/** `dashboard` = module icons (e.g. entry nav). `internal` = text-only sidebar / drawer. */
export type SidebarNavVariant = 'dashboard' | 'internal'

type SidebarNavListProps = {
  onItemClick?: () => void
  variant?: SidebarNavVariant
}

export function SidebarNavList({ onItemClick, variant = 'internal' }: SidebarNavListProps) {
  const { locale } = useLanguage()
  const handleClick = () => {
    onItemClick?.()
  }

  const listClass = [
    'portal-sidebar-nav-list',
    variant === 'internal' ? 'portal-sidebar-nav-list--text-only' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <ul className={listClass}>
      {MAIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const label =
          item.to === '/registration' ? portalStudentLabel(locale, 'registrationModule') : item.label
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => navClassName(isActive)}
              onClick={handleClick}
            >
              {variant === 'dashboard' ? (
                <span className="portal-nav-link-icon">
                  <Icon width={20} height={20} />
                </span>
              ) : null}
              {label}
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}

type SidebarProps = {
  variant?: SidebarNavVariant
}

/** Fixed left sidebar — visible on desktop only (see `portal.css`). */
export function Sidebar({ variant = 'internal' }: SidebarProps) {
  return (
    <aside
      className={['portal-sidebar', 'portal-sidebar--desktop', `portal-sidebar--nav-${variant}`].join(' ')}
      aria-label="Main navigation"
    >
      <nav className="portal-sidebar-nav" aria-label="Portal modules">
        <SidebarNavList variant={variant} />
      </nav>
    </aside>
  )
}

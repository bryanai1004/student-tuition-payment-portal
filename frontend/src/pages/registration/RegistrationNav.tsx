import { NavLink } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import type { StudentPortalKey } from '@/lib/i18n'

function linkClass(isActive: boolean) {
  return ['portal-tab', isActive ? 'portal-tab--active' : ''].filter(Boolean).join(' ')
}

const ITEMS: { to: string; labelKey: StudentPortalKey }[] = [
  { to: 'offered-timetable', labelKey: 'offeredTimetable' },
  { to: 'course-bin', labelKey: 'myCourseBin' },
]

export function RegistrationNav({ termLinkSearch }: { termLinkSearch: string }) {
  const t = useStudentPortalT()
  return (
    <nav className="portal-registration-nav" aria-label={t('registrationNavAria')}>
      <ul className="portal-tab-group portal-tab-group--registration-sub">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={`${item.to}${termLinkSearch}`}
              className={({ isActive }) => linkClass(isActive)}
            >
              {t(item.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

import { NavLink } from 'react-router-dom'
import { useStudentPortalT } from '../../LanguageContext'

function linkClass(isActive: boolean) {
  return ['portal-tab', isActive ? 'portal-tab--active' : ''].filter(Boolean).join(' ')
}

export function ClinicalNav() {
  const t = useStudentPortalT()
  const ITEMS = [
    { to: 'schedule', labelKey: 'clinicSchedule' as const },
    { to: 'my-schedule', labelKey: 'clinicalMyScheduleNav' as const },
  ]

  return (
    <nav className="portal-clinical-nav" aria-label={t('clinicalNavAria')}>
      <ul className="portal-tab-group">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={({ isActive }) => linkClass(isActive)}>
              {t(item.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

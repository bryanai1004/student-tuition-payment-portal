import { NavLink } from 'react-router-dom'
import { useStudentPortalT } from '../../LanguageContext'

function linkClass(isActive: boolean) {
  return ['portal-tab', isActive ? 'portal-tab--active' : ''].filter(Boolean).join(' ')
}

export function ClinicalNav() {
  const t = useStudentPortalT()
  const ITEMS = [
    { to: 'schedule', labelKey: 'clinicSchedule' as const },
    { to: 'offered-timetable', labelKey: 'clinicalOfferedTimetableNav' as const },
    { to: 'add-drop', labelKey: 'addDropClinic' as const },
    { to: 'exam-practice', labelKey: 'examPractice' as const },
    { to: 'evaluation', labelKey: 'submitEvaluation' as const },
    { to: 'required-hours', labelKey: 'requiredHours' as const },
    { to: 'compliance', labelKey: 'compliance' as const },
  ]

  return (
    <nav className="portal-clinical-nav" aria-label={t('clinicalNavAria')}>
      <ul className="portal-tab-group">
        <li>
          <NavLink to="." end className={({ isActive }) => linkClass(isActive)}>
            {t('navOverview')}
          </NavLink>
        </li>
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

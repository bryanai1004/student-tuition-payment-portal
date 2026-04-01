import { NavLink } from 'react-router-dom'

function linkClass(isActive: boolean) {
  return ['portal-registration-nav-link', isActive ? 'portal-registration-nav-link--active' : '']
    .filter(Boolean)
    .join(' ')
}

const ITEMS = [
  { to: 'search', label: 'Course Search' },
  { to: 'course-bin', label: 'My CourseBin' },
  { to: 'schedule', label: 'My Timetable' },
] as const

export function RegistrationNav() {
  return (
    <nav className="portal-registration-nav" aria-label="Registration">
      <ul className="portal-registration-nav-list">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={({ isActive }) => linkClass(isActive)}>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

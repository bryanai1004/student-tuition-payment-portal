import { NavLink } from 'react-router-dom'

type AdminNavItem = { to: string; label: string; end?: boolean }

const links: AdminNavItem[] = [
  { to: '/admin/students', label: 'Students' },
  { to: '/admin/courses', label: 'Courses' },
  /** `end` avoids highlighting Course Sections when viewing the timetable sub-route. */
  { to: '/admin/course-sections', label: 'Course Sections', end: true },
  { to: '/admin/course-sections/timetable', label: 'Scheduling Timetable' },
  { to: '/admin/finance', label: 'Finance' },
]

export function AdminSidebar() {
  return (
    <aside className="admin-sidebar" aria-label="Administration">
      <div className="admin-sidebar__brand">
        <span className="admin-sidebar__brand-title">Admin</span>
        <span className="admin-sidebar__brand-sub">Navigation</span>
      </div>
      <nav className="admin-sidebar__nav" aria-label="Primary">
        <ul className="admin-sidebar__list">
          {links.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end ?? false}
                className={({ isActive }) =>
                  `admin-sidebar__link${isActive ? ' admin-sidebar__link--active' : ''}`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

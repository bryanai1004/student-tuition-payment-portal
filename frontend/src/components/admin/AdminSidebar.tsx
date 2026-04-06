import { NavLink, useLocation } from 'react-router-dom'

type AdminNavItem = {
  path: string
  label: string
  end?: boolean
  /** Keep `term` / `course` / `q` when switching between Course Sections and Timetable. */
  schedulingContext?: boolean
}

const links: AdminNavItem[] = [
  { path: '/admin/students', label: 'Students' },
  { path: '/admin/courses', label: 'Courses' },
  /** `end` avoids highlighting Course Sections when viewing the timetable sub-route. */
  {
    path: '/admin/course-sections',
    label: 'Course Sections',
    end: true,
    schedulingContext: true,
  },
  {
    path: '/admin/course-sections/timetable',
    label: 'Scheduling Timetable',
    schedulingContext: true,
  },
  { path: '/admin/finance', label: 'Finance' },
]

export function AdminSidebar() {
  const location = useLocation()
  const schedulingSearch = location.pathname.startsWith('/admin/course-sections')
    ? location.search
    : ''

  return (
    <aside className="admin-sidebar" aria-label="Administration">
      <div className="admin-sidebar__brand">
        <span className="admin-sidebar__brand-title">Admin</span>
        <span className="admin-sidebar__brand-sub">Navigation</span>
      </div>
      <nav className="admin-sidebar__nav" aria-label="Primary">
        <ul className="admin-sidebar__list">
          {links.map(({ path, label, end, schedulingContext }) => (
            <li key={path}>
              <NavLink
                to={
                  schedulingContext
                    ? { pathname: path, search: schedulingSearch }
                    : path
                }
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

import { NavLink, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { ADMIN_MODULES, hasAdminModuleAccess } from '../../lib/adminAccess'

function navClassName(isActive: boolean) {
  return ['portal-nav-link', 'sidebar-item', isActive ? 'portal-nav-link--active' : '']
    .filter(Boolean)
    .join(' ')
}

export function AdminSidebar() {
  const location = useLocation()
  const { role } = useAdminAuth()
  const schedulingSearch = location.pathname.startsWith('/admin/course-sections')
    ? location.search
    : ''

  return (
    <aside className="admin-sidebar" aria-label="Administration">
      <nav className="portal-sidebar-nav" aria-label="Primary">
        <ul className="portal-sidebar-nav-list portal-sidebar-nav-list--text-only">
          {ADMIN_MODULES.map(({ key, path, label, end, schedulingContext }) => {
            const isAllowed = role == null ? true : hasAdminModuleAccess(role, key)
            return (
              <li key={path}>
                {isAllowed ? (
                  <NavLink
                    to={
                      schedulingContext
                        ? { pathname: path, search: schedulingSearch }
                        : path
                    }
                    end={end ?? false}
                    className={({ isActive }) => navClassName(isActive)}
                  >
                    {label}
                  </NavLink>
                ) : (
                  <span
                    className="portal-nav-link sidebar-item portal-nav-link--disabled"
                    aria-disabled="true"
                    title={`${label} is unavailable for this account`}
                  >
                    {label}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

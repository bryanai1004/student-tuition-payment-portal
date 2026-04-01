import { Outlet } from 'react-router-dom'
import { BackToDashboardLink } from '../../components/BackToDashboardLink'
import { CourseBinProvider } from './CourseBinContext'
import { RegistrationNav } from './RegistrationNav'

export function RegistrationLayout() {
  return (
    <CourseBinProvider>
      <div className="portal-registration-module">
        <header className="portal-module-header">
          <BackToDashboardLink />
          <h1 className="portal-module-title">Registration</h1>
        </header>
        <RegistrationNav />
        <div className="portal-registration-outlet">
          <Outlet />
        </div>
      </div>
    </CourseBinProvider>
  )
}

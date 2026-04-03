import { Outlet } from 'react-router-dom'
import { BackToDashboardLink } from '../../components/BackToDashboardLink'

export function ClinicalLayout() {
  return (
    <div className="portal-clinical-module">
      <header className="portal-module-header">
        <BackToDashboardLink />
        <h1 className="portal-page-title">Clinical</h1>
      </header>
      <div className="portal-clinical-outlet">
        <Outlet />
      </div>
    </div>
  )
}

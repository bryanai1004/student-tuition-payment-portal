import { Outlet } from 'react-router-dom'
import { BackToDashboardLink } from '../../components/BackToDashboardLink'

export function DocumentsLayout() {
  return (
    <div className="portal-documents-module">
      <div className="portal-documents-content">
        <header className="portal-module-header">
          <BackToDashboardLink />
          <h1 className="portal-page-title">Documents & Forms</h1>
        </header>
        <Outlet />
      </div>
    </div>
  )
}

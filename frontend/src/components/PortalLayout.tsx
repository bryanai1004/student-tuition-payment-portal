import { Outlet, useLocation } from 'react-router-dom'
import { AIAssistantLauncher } from './ai/AIAssistantLauncher'
import { AIAssistantMobileAnchorProvider } from './ai/AIAssistantMobileAnchorContext'
import { AIAssistantProvider } from './ai/AIAssistantProvider'
import { deriveAIAssistantPageContext } from '../data/aiMockReplies'
import { PortalShell } from './PortalShell'

function isDashboardRoute(pathname: string) {
  return pathname === '/dashboard' || pathname === '/dashboard/'
}

/** Layout route wrapper for authenticated portal modules. Finances shows the student account strip. */
export function PortalLayout() {
  const { pathname } = useLocation()
  const isDashboard = isDashboardRoute(pathname)
  const showStudentBar = pathname.startsWith('/finances')
  const showSidebar = !isDashboard
  const showPortalBanner = isDashboard

  const assistantPageContext = deriveAIAssistantPageContext(pathname)

  return (
    <AIAssistantProvider pageContext={assistantPageContext}>
      <AIAssistantMobileAnchorProvider>
        <PortalShell
          showStudentBar={showStudentBar}
          showSidebar={showSidebar}
          showPortalBanner={showPortalBanner}
          dashboardHome={isDashboard}
        >
          <Outlet />
        </PortalShell>
        <AIAssistantLauncher />
      </AIAssistantMobileAnchorProvider>
    </AIAssistantProvider>
  )
}

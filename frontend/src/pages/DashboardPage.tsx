import { DashboardCoursesWidget } from './dashboard/DashboardCoursesWidget'
import { DashboardServiceLauncher } from './dashboard/DashboardServiceLauncher'

export function DashboardPage() {
  return (
    <main className="portal-page portal-dashboard">
      <header className="portal-dashboard-hero">
        <h1 className="portal-dashboard-hero-title">
          <span className="portal-dashboard-hero-welcome">WELCOME,</span>{' '}
          <span className="portal-dashboard-hero-name">Bingchen</span>
        </h1>
        <time className="portal-dashboard-hero-date" dateTime="2026-03-31">
          Monday, March 31, 2026
        </time>
      </header>

      <div className="portal-dashboard-home-grid">
        <div className="portal-dashboard-home-primary">
          <DashboardServiceLauncher />
        </div>
        <div className="portal-dashboard-home-aside">
          <DashboardCoursesWidget />
        </div>
      </div>
    </main>
  )
}

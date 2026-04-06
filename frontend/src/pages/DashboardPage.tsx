import { useAccount } from '../context/AccountContext'
import { DashboardCoursesWidget } from './dashboard/DashboardCoursesWidget'
import { DashboardServiceLauncher } from './dashboard/DashboardServiceLauncher'

/** Prefer given name when legacy uses "Last, First"; otherwise first token of the display name. */
function welcomeNameFromDisplay(name: string): string {
  const t = name.trim()
  if (!t) return 'Student'
  const comma = t.indexOf(',')
  if (comma !== -1) {
    const rest = t.slice(comma + 1).trim()
    return rest || t
  }
  const first = t.split(/\s+/)[0]
  return first ?? t
}

export function DashboardPage() {
  const { account, loading, isAuthenticated } = useAccount()
  const displayName = account.student.name?.trim() ?? ''
  const welcome =
    loading && isAuthenticated ? '…' : welcomeNameFromDisplay(displayName)
  const today = new Date()
  const dateIso = today.toISOString().slice(0, 10)
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <main className="portal-page portal-dashboard">
      <header className="portal-dashboard-hero">
        <div className="portal-dashboard-hero__title-row">
          <h1 className="portal-dashboard-hero-title">
            <span className="portal-dashboard-hero-welcome">WELCOME,</span>{' '}
            <span className="portal-dashboard-hero-name">{welcome}</span>
          </h1>
        </div>
        <time className="portal-dashboard-hero-date" dateTime={dateIso}>
          {dateLabel}
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

import { BackToDashboardLink } from '../components/BackToDashboardLink'
import { useAccount } from '../context/AccountContext'
import { formatMoney } from '../lib/formatMoney'
import type { MahmAccountMock } from '../mock/mahmAccountMock'

function dashText(value: string | null | undefined): string {
  const s = value?.trim() ?? ''
  return s.length > 0 ? s : '—'
}

function termDisplay(account: MahmAccountMock): string {
  const t = (account.student.term ?? '').trim()
  const y = account.student.year
  if (t && typeof y === 'number' && Number.isFinite(y)) {
    return `${t} ${y}`
  }
  if (t) return t
  if (typeof y === 'number' && Number.isFinite(y)) {
    return String(y)
  }
  return '—'
}

function safeFormatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return formatMoney(n)
}

function formatIsoDate(iso: string | null | undefined): string {
  const s = iso?.trim() ?? ''
  if (!s) return '—'
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ProfilePage() {
  const {
    fetchedAccount,
    loading,
    error,
    currentStudentId,
    reload,
  } = useAccount()

  return (
    <main className="portal-page portal-module-page portal-profile-page">
      <header className="portal-module-header">
        <BackToDashboardLink />
        <h1 className="portal-module-title">My Account</h1>
        <p className="portal-module-subtitle">
          Your enrollment and billing snapshot for the signed-in student. Additional
          profile tools will roll out over time.
        </p>
      </header>

      {loading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading your account</p>
          <p className="portal-profile-state__detail">
            Please wait while we load your student information.
          </p>
        </section>
      ) : null}

      {!loading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load your account</p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => reload()}
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {!loading && !error && !fetchedAccount ? (
        <section className="portal-card portal-profile-state">
          <p className="portal-profile-state__title">Account information unavailable</p>
          <p className="portal-profile-state__detail">
            We do not have account details to show right now. Try again, or sign out
            and sign back in if this continues.
          </p>
          <div className="portal-actions portal-profile-state__actions">
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => reload()}
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {!loading && !error && fetchedAccount ? (
        <section
          className="portal-card portal-stack portal-profile-card"
          aria-labelledby="profile-student-heading"
        >
          <h2 id="profile-student-heading" className="portal-section-heading">
            Student profile
          </h2>
          <dl>
            <div className="portal-row">
              <dt>Full name</dt>
              <dd>{dashText(fetchedAccount.student.name)}</dd>
            </div>
            <div className="portal-row">
              <dt>Student ID</dt>
              <dd>
                {dashText(
                  fetchedAccount.student.studentId?.trim() ||
                    currentStudentId?.trim() ||
                    undefined,
                )}
              </dd>
            </div>
            <div className="portal-row">
              <dt>Program</dt>
              <dd>{dashText(fetchedAccount.program)}</dd>
            </div>
            <div className="portal-row">
              <dt>Current term</dt>
              <dd>{termDisplay(fetchedAccount)}</dd>
            </div>
            <div className="portal-row">
              <dt>Outstanding balance</dt>
              <dd className="portal-profile-balance">
                {safeFormatMoney(fetchedAccount.summary.outstandingBalance)}
              </dd>
            </div>
            <div className="portal-row">
              <dt>Billing status</dt>
              <dd>{dashText(fetchedAccount.billingStatus)}</dd>
            </div>
            <div className="portal-row">
              <dt>Term charges effective</dt>
              <dd>{formatIsoDate(fetchedAccount.termChargeEffectiveDate)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </main>
  )
}

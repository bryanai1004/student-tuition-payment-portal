import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFinanceLedgerPanel } from './AdminFinanceLedgerPanel'
import {
  fetchAdminFinanceLedger,
  formatMoney,
  type AdminFinanceBucketSummary,
  type AdminFinanceStudentListItem,
  type AdminFinanceStudentStatus,
} from '../../lib/api'

type DrawerTab = 'summary' | 'ledger'

type Props = {
  student: AdminFinanceStudentListItem
  term: string
  year: number
  quarterLabel: string
  onClose: () => void
  onRosterRefresh: () => void
}

function dueAmount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—'
  return formatMoney(n)
}

function statusLabel(status: AdminFinanceStudentStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid'
    case 'owes':
      return 'Owes'
    case 'overdue':
      return 'Overdue'
    case 'credit':
      return 'Credit'
    default:
      return status
  }
}

function deriveStatusFromBalance(
  balance: number,
): AdminFinanceStudentStatus {
  if (balance < 0) return 'credit'
  if (balance <= 0) return 'paid'
  return 'owes'
}

export function AdminFinanceStudentDrawer({
  student,
  term,
  year,
  quarterLabel,
  onClose,
  onRosterRefresh,
}: Props) {
  const [tab, setTab] = useState<DrawerTab>('summary')
  const [buckets, setBuckets] = useState<AdminFinanceBucketSummary | null>(
    student.bucketsLoaded && student.tuitionDue != null
      ? {
          tuitionDue: student.tuitionDue,
          clinicDue: student.clinicDue ?? 0,
          lateFeeDue: student.lateFeeDue ?? 0,
          examDue: student.examDue ?? 0,
        }
      : null,
  )
  const [summaryBusy, setSummaryBusy] = useState(!student.bucketsLoaded)
  const [summaryErr, setSummaryErr] = useState<string | null>(null)
  const [drawerBalance, setDrawerBalance] = useState(student.balance)
  const studentName = student.name?.trim() || 'Unknown student'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (student.bucketsLoaded && student.tuitionDue != null) {
      setBuckets({
        tuitionDue: student.tuitionDue,
        clinicDue: student.clinicDue ?? 0,
        lateFeeDue: student.lateFeeDue ?? 0,
        examDue: student.examDue ?? 0,
      })
      setSummaryBusy(false)
      setSummaryErr(null)
      return
    }

    const ac = new AbortController()
    setSummaryBusy(true)
    setSummaryErr(null)
    ;(async () => {
      try {
        const ledger = await fetchAdminFinanceLedger(
          student.studentId,
          term,
          year,
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
        setDrawerBalance(ledger.summary.balance)
        setBuckets(ledger.bucketSummary ?? null)
      } catch (e) {
        if (!ac.signal.aborted) {
          setBuckets(null)
          setSummaryErr(
            e instanceof Error ? e.message : 'Could not load finance summary.',
          )
        }
      } finally {
        if (!ac.signal.aborted) setSummaryBusy(false)
      }
    })()
    return () => ac.abort()
  }, [
    student.studentId,
    student.bucketsLoaded,
    student.tuitionDue,
    student.clinicDue,
    student.lateFeeDue,
    student.examDue,
    term,
    year,
  ])

  const displayStatus =
    buckets != null ? student.status : deriveStatusFromBalance(drawerBalance)

  return (
    <div
      className="admin-finance-drawer-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside
        className="admin-finance-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-finance-drawer-title"
      >
        <header className="admin-finance-drawer__header">
          <div className="admin-finance-drawer__header-main">
            <h2 id="admin-finance-drawer-title" className="admin-finance-drawer__title">
              {studentName}
            </h2>
            <p className="admin-finance-drawer__meta portal-text-muted">
              {student.studentId} · {quarterLabel}
            </p>
          </div>
          <div className="admin-finance-drawer__header-actions">
            <Link
              to={`/admin/students/${encodeURIComponent(student.studentId)}`}
              className="portal-btn portal-btn--secondary portal-btn--compact"
            >
              Student profile
            </Link>
            <button
              type="button"
              className="portal-btn portal-btn--secondary portal-btn--compact"
              onClick={onClose}
              aria-label="Close student finance drawer"
            >
              Close
            </button>
          </div>
        </header>

        <div
          className="admin-finance-drawer__tabs"
          role="tablist"
          aria-label="Student finance views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'summary'}
            className={`admin-finance-drawer__tab${tab === 'summary' ? ' admin-finance-drawer__tab--active' : ''}`}
            onClick={() => setTab('summary')}
          >
            Summary
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ledger'}
            className={`admin-finance-drawer__tab${tab === 'ledger' ? ' admin-finance-drawer__tab--active' : ''}`}
            onClick={() => setTab('ledger')}
          >
            Ledger
          </button>
        </div>

        <div className="admin-finance-drawer__body">
          {tab === 'summary' ? (
            <div className="admin-finance-drawer-summary" role="tabpanel">
              <div className="admin-finance-drawer-summary__status-row">
                <span
                  className={`admin-finance-status-badge admin-finance-status-badge--${displayStatus}`}
                >
                  {statusLabel(displayStatus)}
                </span>
                <p className="admin-finance-drawer-summary__net portal-text-muted">
                  Net balance{' '}
                  <strong>{formatMoney(drawerBalance)}</strong>
                </p>
              </div>

              {summaryBusy ? (
                <p className="portal-text-muted" aria-live="polite">
                  Loading bucket breakdown…
                </p>
              ) : null}

              {summaryErr != null ? (
                <p className="admin-form-message" role="alert">
                  {summaryErr}
                </p>
              ) : null}

              {!summaryBusy && buckets != null ? (
                <div className="admin-finance-bucket-grid">
                  <article className="admin-finance-bucket-card">
                    <p className="admin-finance-bucket-card__label">Tuition due</p>
                    <p className="admin-finance-bucket-card__amount">
                      {dueAmount(buckets.tuitionDue)}
                    </p>
                  </article>
                  <article className="admin-finance-bucket-card">
                    <p className="admin-finance-bucket-card__label">Clinic due</p>
                    <p className="admin-finance-bucket-card__amount">
                      {dueAmount(buckets.clinicDue)}
                    </p>
                  </article>
                  <article className="admin-finance-bucket-card">
                    <p className="admin-finance-bucket-card__label">Late fee</p>
                    <p className="admin-finance-bucket-card__amount">
                      {dueAmount(buckets.lateFeeDue)}
                    </p>
                  </article>
                  <article className="admin-finance-bucket-card">
                    <p className="admin-finance-bucket-card__label">Exam due</p>
                    <p className="admin-finance-bucket-card__amount">
                      {dueAmount(buckets.examDue)}
                    </p>
                  </article>
                </div>
              ) : null}

              <p className="admin-finance-drawer-summary__hint portal-text-muted">
                Open the Ledger tab to post charges, record payments, or review
                line items for this quarter.
              </p>
            </div>
          ) : (
            <AdminFinanceLedgerPanel
              studentId={student.studentId}
              term={term}
              year={year}
              quarterLabel={quarterLabel}
              onRosterRefresh={onRosterRefresh}
              variant="drawer"
            />
          )}
        </div>
      </aside>
    </div>
  )
}

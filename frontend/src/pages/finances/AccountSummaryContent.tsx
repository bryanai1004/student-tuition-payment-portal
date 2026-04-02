import { useAccount } from '../../context/AccountContext'
import {
  installmentPlanDisplayLabel,
  nextInstallmentRow,
  paymentsFromRecentActivity,
  portalTermLabel,
  toInstallmentRows,
} from '../../lib/accountDisplay'
import { formatMoney } from '../../lib/formatMoney'

/** Account summary body shared by Finances overview and legacy `/overview` flows. */
export function AccountSummaryContent() {
  const { account } = useAccount()
  const { summary, installmentPlan, billingStatus } = account
  const otherTotal = summary.otherTotal ?? 0
  const installmentRows = toInstallmentRows(installmentPlan.schedule)
  const nextDueRow = nextInstallmentRow(installmentRows)
  const payments = paymentsFromRecentActivity(account.recentActivity)
  const lastPayment = [...payments].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))[0]
  const lastUpdateRaw = lastPayment?.paidAt ?? account.termChargeEffectiveDate
  const lastUpdate =
    typeof lastUpdateRaw === 'string' && lastUpdateRaw.trim() !== '' ? lastUpdateRaw.trim() : null
  const planLabel = installmentPlanDisplayLabel(installmentPlan)
  const termLabel = portalTermLabel(account)

  return (
    <>
      <section
        className="portal-card portal-stack portal-account-summary"
        aria-labelledby="account-summary-heading"
      >
        <h2 id="account-summary-heading" className="portal-section-heading">
          Student account summary
        </h2>
        <dl>
          <div className="portal-row">
            <dt>Program</dt>
            <dd>{account.program}</dd>
          </div>
          <div className="portal-row">
            <dt>Term</dt>
            <dd>{termLabel}</dd>
          </div>
          <div className="portal-row">
            <dt>Billing status</dt>
            <dd>{billingStatus}</dd>
          </div>
          <div className="portal-row">
            <dt>Tuition (didactic / lab)</dt>
            <dd>{formatMoney(summary.tuitionTotal)}</dd>
          </div>
          <div className="portal-row">
            <dt>Clinical</dt>
            <dd>{formatMoney(summary.clinicalTotal)}</dd>
          </div>
          <div className="portal-row">
            <dt>Fees</dt>
            <dd>{formatMoney(summary.feesTotal)}</dd>
          </div>
          {otherTotal > 0 ? (
            <div className="portal-row">
              <dt>Other charges</dt>
              <dd>{formatMoney(otherTotal)}</dd>
            </div>
          ) : null}
          <div className="portal-row portal-account-summary__divider" role="presentation">
            <dt>Total charges</dt>
            <dd>{formatMoney(summary.totalCharges)}</dd>
          </div>
          <div className="portal-row">
            <dt>Payments</dt>
            <dd>{formatMoney(summary.payments)}</dd>
          </div>
          <div className="portal-row portal-payment-total portal-account-summary__balance">
            <dt>Total outstanding balance</dt>
            <dd>{formatMoney(summary.outstandingBalance)}</dd>
          </div>
          <div className="portal-row">
            <dt>Next due date</dt>
            <dd>
              {nextDueRow
                ? `${nextDueRow.dueDate} (${formatMoney(nextDueRow.amount)} due)`
                : 'No upcoming installment'}
            </dd>
          </div>
          <div className="portal-row">
            <dt>Installment plan</dt>
            <dd>{planLabel}</dd>
          </div>
          <div className="portal-row">
            <dt>Last account update</dt>
            <dd>
              {lastUpdate
                ? new Date(`${lastUpdate}T12:00:00`).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
            </dd>
          </div>
        </dl>
      </section>
    </>
  )
}

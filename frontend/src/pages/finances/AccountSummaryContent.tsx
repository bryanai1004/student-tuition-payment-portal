import { useAccount } from '../../context/AccountContext'
import {
  installmentPlanDisplayLabel,
  nextInstallmentRow,
  paymentsFromRecentActivity,
  portalTermLabel,
  toInstallmentRows,
} from '../../lib/accountDisplay'
import { formatMoney } from '../../lib/formatMoney'

function dashCell(value: number | null) {
  if (value == null) return '—'
  return String(value)
}

/** Account summary body shared by Finances overview and legacy `/overview` flows. */
export function AccountSummaryContent() {
  const { account } = useAccount()
  const { summary, lineItems, scheduleRows, installmentPlan, billingStatus } = account
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

      <section className="portal-stack" aria-labelledby="itemized-heading">
        <h2 id="itemized-heading" className="portal-section-heading">
          Itemized charges ({termLabel})
        </h2>
        <div className="portal-table-wrap">
          <table className="portal-table portal-table--courses">
            <caption className="visually-hidden">Posted charges by category for the current term</caption>
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((row, index) => (
                <tr key={`${index}-${row.description}`}>
                  <td>{row.description}</td>
                  <td className="portal-table-cell-capitalize">{row.category}</td>
                  <td>{formatMoney(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="portal-stack" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="portal-section-heading">
          Term schedule and charges
        </h2>
        <div className="portal-table-wrap">
          <table className="portal-table portal-table--courses">
            <caption className="visually-hidden">
              Enrolled courses with units, clinical hours, and computed charges
            </caption>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col">Units</th>
                <th scope="col">Hours</th>
                <th scope="col">Charge</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((row) => (
                <tr key={row.courseCode}>
                  <td>
                    {row.title} ({row.courseCode})
                  </td>
                  <td>{dashCell(row.units)}</td>
                  <td>{dashCell(row.hours)}</td>
                  <td>{formatMoney(row.charge)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Course subtotal (tuition + clinical)</th>
                <td>—</td>
                <td>—</td>
                <td>{formatMoney(summary.tuitionTotal + summary.clinicalTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  )
}

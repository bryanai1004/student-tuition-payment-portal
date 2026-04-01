import { Link } from 'react-router-dom'
import { PageLayout } from '../components/PageLayout'
import { useAccount } from '../context/AccountContext'
import { installmentPlanDisplayLabel, portalTermLabel } from '../lib/accountDisplay'
import { formatMoney } from '../lib/formatMoney'

export function PaymentPlanPage() {
  const { account } = useAccount()
  const { installmentPlan, installmentPolicy, program } = account
  const planLabel = installmentPlanDisplayLabel(installmentPlan)
  const termLabel = portalTermLabel(account)

  return (
    <PageLayout>
      <main className="portal-page">
        <p className="portal-page-lede">
          {termLabel} installment schedule for {program.trim() ? program : 'your program'}. Your plan:{' '}
          {planLabel}. Amounts and dates follow
          catalog rules (up to three installments per quarter); confirm details on official bursar
          communications.
        </p>

        <div className="portal-table-wrap">
          <table className="portal-table portal-table--plan">
            <caption className="visually-hidden">Installment payment schedule</caption>
            <thead>
              <tr>
                <th scope="col">Installment</th>
                <th scope="col">Due Date</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {installmentPlan.schedule.map((row, i) => (
                <tr key={row.dueDate}>
                  <td>{i + 1}</td>
                  <td>{row.dueDate}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="portal-plan-terms" aria-labelledby="plan-terms-heading">
          <h2 id="plan-terms-heading" className="portal-section-heading">
            Plan terms
          </h2>
          <ul className="portal-plan-terms-list">
            {installmentPolicy.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <nav className="portal-actions portal-actions--spaced" aria-label="Page actions">
          <Link className="portal-btn portal-btn--secondary" to="/finances/overview">
            Back to Overview
          </Link>
          <Link className="portal-btn portal-btn--primary" to="/finances/payment">
            Go to Make Payment
          </Link>
        </nav>
      </main>
    </PageLayout>
  )
}

import { Link } from 'react-router-dom'
import { PageLayout } from '../components/PageLayout'

const installments = [
  {
    n: 1,
    due: 'Sep 15, 2026',
    amount: '$4,612.50',
  },
  {
    n: 2,
    due: 'Oct 15, 2026',
    amount: '$4,612.50',
  },
  {
    n: 3,
    due: 'Nov 15, 2026',
    amount: '$4,612.50',
  },
  {
    n: 4,
    due: 'Dec 15, 2026',
    amount: '$4,612.50',
  },
] as const

export function PaymentPlanPage() {
  return (
    <PageLayout>
      <main className="portal-page">
        <p className="portal-page-lede">
          Fall 2026 installment schedule for your MD program. Amounts and dates reflect your
          current four-payment plan; confirm details on official bursar communications.
        </p>

        <div className="portal-table-wrap">
          <table className="portal-table portal-table--plan">
            <caption className="visually-hidden">Installment payment schedule</caption>
            <thead>
              <tr>
                <th scope="col">Installment</th>
                <th scope="col">Due Date</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((row) => (
                <tr key={row.n}>
                  <td>{row.n}</td>
                  <td>{row.due}</td>
                  <td>{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="portal-plan-terms" aria-labelledby="plan-terms-heading">
          <h2 id="plan-terms-heading" className="portal-section-heading">
            Plan Terms
          </h2>
          <ul className="portal-plan-terms-list">
            <li>Installments are due monthly on the dates shown.</li>
            <li>A late fee may apply if payment is not received by the due date.</li>
            <li>Missed or delinquent payments may affect enrollment standing.</li>
          </ul>
        </section>

        <nav className="portal-actions portal-actions--spaced" aria-label="Page actions">
          <Link className="portal-btn portal-btn--secondary" to="/overview">
            Back to Overview
          </Link>
          <Link className="portal-btn portal-btn--primary" to="/payment">
            Go to Make Payment
          </Link>
        </nav>
      </main>
    </PageLayout>
  )
}

import { AccountingLedgerSection } from './AccountingLedgerSection'

export function FinancesOverviewPage() {
  return (
    <main className="portal-page portal-stack portal-finances-overview">
      <h2 className="portal-page-title portal-finances-overview__title">Overview</h2>
      <AccountingLedgerSection />
    </main>
  )
}

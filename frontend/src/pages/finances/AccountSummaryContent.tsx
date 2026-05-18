import { useStudentPortalT } from '@/LanguageContext'
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
  const t = useStudentPortalT()
  const { account } = useAccount()
  const { summary, installmentPlan, billingStatus } = account
  const otherTotal = summary.otherTotal ?? 0
  const examTotal = summary.examTotal ?? 0
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
          {t('studentAccountSummary')}
        </h2>
        <dl>
          <div className="portal-row">
            <dt>{t('program')}</dt>
            <dd>{account.program}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('term')}</dt>
            <dd>{termLabel}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('billingStatus')}</dt>
            <dd>{billingStatus}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('tuitionDidacticLab')}</dt>
            <dd>{formatMoney(summary.tuitionTotal)}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('clinicalCharges')}</dt>
            <dd>{formatMoney(summary.clinicalTotal)}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('fees')}</dt>
            <dd>{formatMoney(summary.feesTotal)}</dd>
          </div>
          {examTotal > 0 ? (
            <div className="portal-row">
              <dt>{t('examFee')}</dt>
              <dd>{formatMoney(examTotal)}</dd>
            </div>
          ) : null}
          {otherTotal > 0 ? (
            <div className="portal-row">
              <dt>{t('otherCharges')}</dt>
              <dd>{formatMoney(otherTotal)}</dd>
            </div>
          ) : null}
          <div className="portal-row portal-account-summary__divider" role="presentation">
            <dt>{t('totalCharges')}</dt>
            <dd>{formatMoney(summary.totalCharges)}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('payments')}</dt>
            <dd>{formatMoney(summary.payments)}</dd>
          </div>
          <div className="portal-row portal-payment-total portal-account-summary__balance">
            <dt>{t('totalOutstandingBalance')}</dt>
            <dd>{formatMoney(summary.outstandingBalance)}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('nextDueDate')}</dt>
            <dd>
              {nextDueRow
                ? `${nextDueRow.dueDate} (${formatMoney(nextDueRow.amount)} ${t('dueInParens')})`
                : t('noUpcomingInstallment')}
            </dd>
          </div>
          <div className="portal-row">
            <dt>{t('installmentPlan')}</dt>
            <dd>{planLabel}</dd>
          </div>
          <div className="portal-row">
            <dt>{t('lastAccountUpdate')}</dt>
            <dd>
              {lastUpdate
                ? new Date(`${lastUpdate}T12:00:00`).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : t('dashEm')}
            </dd>
          </div>
        </dl>
      </section>
    </>
  )
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '@/context/AccountContext'
import { PaymentCardForm } from '@/components/finance/PaymentCardForm'
import { ApplePayButton } from '@/components/finance/ApplePayButton'
import { PaymentSummaryCard, type PaymentBreakdownLine } from '@/components/finance/PaymentSummaryCard'
import { portalTermLabel } from '@/lib/accountDisplay'
import { dispatchAcceptData, loadAcceptJs } from '@/lib/authorizeNet'
import {
  fetchAccountingQuarters,
  fetchAuthorizeTuitionSummary,
  postAuthorizeNetTuitionCharge,
  type TuitionBillingSummaryResponse,
} from '@/lib/api'
import { formatMoney } from '@/lib/formatMoney'
import { calculateInstallmentSchedule, type PaymentPlan } from '@/lib/paymentPlan'
import { cardBinPrefixFromPan, inferCardFundingFromPan } from '@/lib/cardFundingFromBin'
import {
  computeCreditCardProcessingFee,
  roundMoney,
  totalWithProcessingFee,
} from '@/lib/creditCardProcessingFee'
import {
  formatBillingZipInput,
  isValidCardholderName,
  normalizeBillingZip,
  normalizeCardholderName,
} from '@/lib/paymentBillingFields'
import {
  applePayDisplayName,
  canShowApplePayButton,
  requestApplePayPayment,
} from '@/lib/applePaySession'

function normalizeAmountInput(v: string): string {
  const trimmed = v.trim()
  if (trimmed === '') return ''
  const normalized = trimmed.replace(/[^0-9.]/g, '')
  const parts = normalized.split('.')
  if (parts.length <= 1) return normalized
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
}

function normalizeExpirationInput(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

function splitExpirationDate(expirationDate: string): { month: string; year: string } | null {
  const match = expirationDate.match(/^(\d{2})\/(\d{2})$/)
  if (match == null) return null
  const [, month, shortYear] = match
  const monthNumber = Number(month)
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) return null
  return {
    month,
    year: `20${shortYear}`,
  }
}

function termCodeFromQuarter(term: string, year: number): string {
  const upper = term.trim().toUpperCase()
  const suffix =
    upper.startsWith('SPR') ? 'SPR'
    : upper.startsWith('SUM') ? 'SUM'
    : upper.startsWith('FAL') ? 'FAL'
    : upper.startsWith('WIN') ? 'WIN'
    : upper.slice(0, 3) || 'TRM'
  return `${year}-${suffix}`
}

export function FinancesPaymentPage() {
  const t = useStudentPortalT()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { account, currentStudentId, authToken, isAuthenticated } = useAccount()
  const [term, setTerm] = useState(() => searchParams.get('term')?.trim() ?? '')
  const [year, setYear] = useState(() => Number(searchParams.get('year') ?? NaN))
  const [termLabel, setTermLabel] = useState(() => searchParams.get('label')?.trim() ?? '')
  const [billingSummary, setBillingSummary] = useState<TuitionBillingSummaryResponse | null>(null)
  const [selectedChargeType, setSelectedChargeType] = useState<'tuition' | 'late_fee'>('tuition')
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>('full')
  const [amount, setAmount] = useState('0.00')
  const [cardholderName, setCardholderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [cvv, setCvv] = useState('')
  const [billingZip, setBillingZip] = useState('')
  const [scriptReady, setScriptReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [applePaySubmitting, setApplePaySubmitting] = useState(false)
  const [applePayAvailable, setApplePayAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const studentId = currentStudentId?.trim() ?? ''
  const installmentCount = 3
  const serviceFeePerInstallment = 15
  const installmentEligible = selectedChargeType === 'tuition'
  const selectedChargeDue = Math.max(
    0,
    selectedChargeType === 'tuition'
      ? billingSummary?.tuitionCharge.amountDue ?? 0
      : billingSummary?.lateFeeCharge.amountDue ?? 0,
  )
  const tuitionDue = Math.max(0, billingSummary?.tuitionCharge.amountDue ?? 0)
  const lateFeeDue = Math.max(0, billingSummary?.lateFeeCharge.amountDue ?? 0)

  const amountNum = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) ? roundMoney(n) : Number.NaN
  }, [amount])

  const cardFunding = useMemo(() => inferCardFundingFromPan(cardNumber), [cardNumber])
  const processingFee = useMemo(
    () => (Number.isFinite(amountNum) ? computeCreditCardProcessingFee(amountNum, cardFunding) : 0),
    [amountNum, cardFunding],
  )
  const totalCharged = useMemo(
    () => (Number.isFinite(amountNum) ? totalWithProcessingFee(amountNum, cardFunding) : 0),
    [amountNum, cardFunding],
  )

  const scheduleTotals = useMemo(
    () => calculateInstallmentSchedule(tuitionDue, installmentCount, serviceFeePerInstallment),
    [tuitionDue],
  )
  const installmentSchedule = scheduleTotals.schedule
  const firstInstallment = installmentSchedule[0] ?? null

  const paymentBreakdownLines = useMemo((): PaymentBreakdownLine[] => {
    if (!Number.isFinite(amountNum)) return []
    if (selectedChargeType === 'tuition') {
      if (paymentPlan === 'installment' && firstInstallment != null) {
        const rows: PaymentBreakdownLine[] = [
          { key: 'tuition', label: t('paymentBreakdownTuition'), amount: firstInstallment.tuitionAmount },
        ]
        if (firstInstallment.serviceFee > 0) {
          rows.push({
            key: 'svc',
            label: t('installmentServiceFeeLine'),
            amount: firstInstallment.serviceFee,
          })
        }
        return rows
      }
      return [{ key: 'tuition', label: t('paymentBreakdownTuition'), amount: amountNum }]
    }
    return [
      { key: 'tuition', label: t('paymentBreakdownTuition'), amount: 0 },
      { key: 'late', label: t('paymentBreakdownLateFee'), amount: amountNum },
    ]
  }, [amountNum, firstInstallment, paymentPlan, selectedChargeType, t])

  const cardFundingNote = useMemo(() => {
    const digits = cardNumber.replace(/\D/g, '')
    if (digits.length < 6) return null
    if (cardFunding === 'debit') return t('cardFundingDebitDetected')
    if (cardFunding === 'credit') return t('cardFundingCreditDetected')
    return t('cardFundingUnknown')
  }, [cardFunding, cardNumber, t])

  const remainingAfterToday = useMemo(() => {
    if (firstInstallment == null) return 0
    return roundMoney(Math.max(0, scheduleTotals.totalPayableAmount - firstInstallment.totalDue))
  }, [firstInstallment, scheduleTotals.totalPayableAmount])
  const amountDueToday = useMemo(() => {
    if (!installmentEligible || paymentPlan === 'full') return roundMoney(selectedChargeDue)
    return roundMoney(firstInstallment?.totalDue ?? 0)
  }, [firstInstallment, installmentEligible, paymentPlan, selectedChargeDue])
  const submitLabel = useMemo(() => {
    if (selectedChargeType === 'late_fee') return t('payLateFee')
    return paymentPlan === 'installment'
      ? t('continueToInstallmentPayment')
      : t('continueToFullPayment')
  }, [paymentPlan, selectedChargeType, t])
  const lockedAmountNote = useMemo(() => {
    if (selectedChargeType === 'late_fee') {
      return t('amountFixedForLateFee')
    }
    return paymentPlan === 'installment'
      ? t('amountIncludesFirstInstallmentAndFee')
      : t('amountMatchesFullTuition')
  }, [paymentPlan, selectedChargeType, t])

  const studentName = account.student.name?.trim() || t('studentFallback')
  const displayStudentId = account.student.studentId?.trim() || studentId || '—'

  useEffect(() => {
    setCardholderName((prev) => {
      if (prev.trim() !== '') return prev
      return account.student.name?.trim() ?? ''
    })
  }, [account.student.name])
  const displayTerm = termLabel || portalTermLabel(account) || t('selectedTerm')
  const termCode = termCodeFromQuarter(term, year)

  useEffect(() => {
    setApplePayAvailable(canShowApplePayButton())
  }, [])

  useEffect(() => {
    if (!installmentEligible && paymentPlan !== 'full') {
      setPaymentPlan('full')
    }
  }, [installmentEligible, paymentPlan])

  useEffect(() => {
    setAmount(amountDueToday.toFixed(2))
  }, [amountDueToday])

  useEffect(() => {
    if (!isAuthenticated || studentId === '') {
      navigate('/finances/overview', { replace: true })
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        let nextTerm = term
        let nextYear = year
        let nextLabel = termLabel
        if (nextTerm === '' || !Number.isFinite(nextYear) || nextYear <= 0) {
          const quartersRes = await fetchAccountingQuarters(studentId, { signal: ac.signal })
          if (ac.signal.aborted) return
          const newest = quartersRes.quarters[0]
          if (newest == null) {
            throw new Error(t('noPayableTermFound'))
          }
          nextTerm = newest.term
          nextYear = newest.year
          nextLabel = newest.label
          setTerm(nextTerm)
          setYear(nextYear)
          setTermLabel(nextLabel)
        }

        const summary = await fetchAuthorizeTuitionSummary(nextTerm, nextYear, {
          signal: ac.signal,
          authToken: authToken?.trim() || undefined,
        })
        if (ac.signal.aborted) return
        setBillingSummary(summary)
        setSelectedChargeType(
          summary.tuitionCharge.amountDue > 0
            ? 'tuition'
            : summary.lateFeeCharge.amountDue > 0
              ? 'late_fee'
              : 'tuition',
        )
        if (nextLabel.trim() === '') {
          setTermLabel(`${summary.term} ${summary.year}`.trim())
        }
      } catch (e) {
        if (ac.signal.aborted) return
        setError(e instanceof Error ? e.message : t('unableToLoadPaymentDetails'))
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()

    return () => ac.abort()
  }, [authToken, isAuthenticated, navigate, studentId, term, termLabel, year, t])

  useEffect(() => {
    let mounted = true
    setScriptReady(false)
    void loadAcceptJs()
      .then(() => {
        if (!mounted) return
        setScriptReady(true)
      })
      .catch((e) => {
        if (!mounted) return
        setError(e instanceof Error ? e.message : t('unableToLoadPaymentScript'))
      })
    return () => {
      mounted = false
    }
  }, [t])

  const validateChargeAmount = (): string | null => {
    if (term.trim() === '' || !Number.isFinite(year)) {
      return t('billingTermUnavailable')
    }
    if (selectedChargeDue <= 0) {
      return t('noOutstandingBalanceForCharge')
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return t('enterValidPaymentAmount')
    }
    const maxAllowedAmount = roundMoney(
      selectedChargeType === 'tuition' && paymentPlan === 'installment'
        ? selectedChargeDue + serviceFeePerInstallment
        : selectedChargeDue,
    )
    if (amountNum > maxAllowedAmount) {
      return t('paymentAmountExceedsCharge')
    }
    return null
  }

  const navigateAfterSuccessfulPayment = (result: { amount: string; providerTransactionId: string }) => {
    const successText = t('tuitionPaymentSuccess')
      .replace('{amount}', formatMoney(Number(result.amount)))
      .replace('{reference}', result.providerTransactionId)
    setSuccessMessage(successText)
    window.setTimeout(() => {
      navigate('/finances/overview', {
        replace: true,
        state: {
          financePaymentToast: successText,
          financePaymentRefresh: true,
        },
      })
    }, 900)
  }

  const handleApplePayPay = async () => {
    if (submitting || applePaySubmitting || loading) return

    const amountError = validateChargeAmount()
    if (amountError != null) {
      setError(amountError)
      return
    }

    setApplePaySubmitting(true)
    setError(null)
    try {
      const applePayFee = computeCreditCardProcessingFee(amountNum, 'credit')
      const applePayTotal = totalWithProcessingFee(amountNum, 'credit')
      const lineItems = paymentBreakdownLines.map((line) => ({
        label: line.label,
        amount: line.amount.toFixed(2),
      }))
      if (applePayFee > 0) {
        lineItems.push({
          label: t('creditCardProcessingFeeLabel'),
          amount: applePayFee.toFixed(2),
        })
      }

      const { opaqueData, cardholderName: walletName, billingZip: walletZip } =
        await requestApplePayPayment({
          lineItems,
          total: {
            label: applePayDisplayName(),
            amount: applePayTotal.toFixed(2),
          },
        })

      const resolvedName = normalizeCardholderName(
        walletName.trim() !== '' ? walletName : studentName,
      )
      if (!isValidCardholderName(resolvedName)) {
        throw new Error(t('cardholderNameInvalid'))
      }
      const resolvedZip = normalizeBillingZip(walletZip.trim() !== '' ? walletZip : billingZip)
      if (resolvedZip == null) {
        throw new Error(t('billingZipInvalid'))
      }

      const result = await postAuthorizeNetTuitionCharge(
        {
          term: termCode,
          amount: amountNum.toFixed(2),
          chargeType: selectedChargeType,
          paymentPlan: selectedChargeType === 'tuition' ? paymentPlan : 'full',
          installmentCount:
            selectedChargeType === 'tuition' && paymentPlan === 'installment' ? installmentCount : 1,
          opaqueData,
          cardholderName: resolvedName,
          billingZip: resolvedZip,
        },
        { authToken: authToken?.trim() || undefined },
      )
      navigateAfterSuccessfulPayment(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('paymentCouldNotBeProcessed'))
    } finally {
      setApplePaySubmitting(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || applePaySubmitting || loading) return

    const apiLoginId = String(import.meta.env.VITE_AUTHORIZE_API_LOGIN_ID ?? '').trim()
    const clientKey = String(import.meta.env.VITE_AUTHORIZE_CLIENT_KEY ?? '').trim()

    if (apiLoginId === '' || clientKey === '') {
      setError(t('paymentConfigurationUnavailable'))
      setCvv('')
      return
    }
    if (!scriptReady) {
      setError(t('securePaymentFormStillLoading'))
      setCvv('')
      return
    }
    const amountError = validateChargeAmount()
    if (amountError != null) {
      setError(amountError)
      setCvv('')
      return
    }
    if (!/^\d{13,19}$/.test(cardNumber)) {
      setError(t('cardNumberDigitsError'))
      setCvv('')
      return
    }
    const cardBinPrefix = cardBinPrefixFromPan(cardNumber)
    if (cardBinPrefix == null) {
      setError(t('cardBinPrefixInvalid'))
      setCvv('')
      return
    }
    const expirationParts = splitExpirationDate(expirationDate)
    if (expirationParts == null) {
      setError(t('expirationFormatError'))
      setCvv('')
      return
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      setError(t('cvvDigitsError'))
      setCvv('')
      return
    }
    if (!isValidCardholderName(cardholderName)) {
      setError(t('cardholderNameInvalid'))
      setCvv('')
      return
    }
    const normalizedZip = normalizeBillingZip(billingZip)
    if (normalizedZip == null) {
      setError(t('billingZipInvalid'))
      setCvv('')
      return
    }
    const normalizedCardholderName = normalizeCardholderName(cardholderName)

    setSubmitting(true)
    setError(null)
    try {
      const opaqueData = await dispatchAcceptData({
        authData: { apiLoginID: apiLoginId, clientKey },
        cardData: {
          cardNumber,
          month: expirationParts.month,
          year: expirationParts.year,
          cardCode: cvv,
          fullName: normalizedCardholderName,
          zip: normalizedZip,
        },
      })
      const result = await postAuthorizeNetTuitionCharge(
        {
          term: termCode,
          amount: amountNum.toFixed(2),
          chargeType: selectedChargeType,
          paymentPlan: selectedChargeType === 'tuition' ? paymentPlan : 'full',
          installmentCount:
            selectedChargeType === 'tuition' && paymentPlan === 'installment' ? installmentCount : 1,
          opaqueData,
          cardBinPrefix,
          cardholderName: normalizedCardholderName,
          billingZip: normalizedZip,
        },
        { authToken: authToken?.trim() || undefined },
      )
      setCvv('')
      navigateAfterSuccessfulPayment(result)
    } catch (e) {
      setCvv('')
      setError(e instanceof Error ? e.message : t('paymentCouldNotBeProcessed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="portal-page portal-finance-checkout-page">
      <header className="portal-finance-checkout-page__header">
        <Link to="/finances/overview" className="portal-finance-checkout-page__back-link">
          <ChevronLeft size={16} aria-hidden="true" />
          <span>{t('backToFinances')}</span>
        </Link>
        <h2 className="portal-page-title portal-finance-checkout-page__title">
          {t('payTuition')}
        </h2>
      </header>

      {loading ? (
        <p className="portal-inline-note portal-inline-note--flush" role="status">
          {t('loadingPaymentDetails')}
        </p>
      ) : null}

      {successMessage ? (
        <p className="portal-inline-note portal-inline-note--flush portal-finance-checkout-page__success" role="status">
          {successMessage}
        </p>
      ) : null}

      {!loading ? (
        <>
          {billingSummary != null ? (
            <section className="portal-card portal-finance-payment-option" aria-label={t('tuitionPaymentSettingsAria')}>
              <dl className="portal-finance-checkout-summary">
                <div className="portal-finance-checkout-summary__row">
                  <dt>{t('tuitionDue')}</dt>
                  <dd>{formatMoney(billingSummary.tuitionCharge.amountDue)}</dd>
                </div>
                {lateFeeDue > 0 ? (
                  <div className="portal-finance-checkout-summary__row">
                    <dt>{t('lateFeeDue')}</dt>
                    <dd>{formatMoney(lateFeeDue)}</dd>
                  </div>
                ) : null}
                <div className="portal-finance-checkout-summary__row portal-finance-checkout-summary__row--strong">
                  <dt>{t('amountDueToday')}</dt>
                  <dd>{formatMoney(amountDueToday)}</dd>
                </div>
              </dl>
              {selectedChargeType === 'tuition' ? (
                <div className="portal-finance-payment-option__cards" role="radiogroup" aria-label={t('tuitionPaymentModeAria')}>
                  <button
                    type="button"
                    className={`portal-finance-payment-option__card ${paymentPlan === 'full' ? 'is-selected' : ''}`}
                    onClick={() => setPaymentPlan('full')}
                    disabled={billingSummary.tuitionCharge.amountDue <= 0}
                  >
                    <span className="portal-finance-payment-option__card-title">{t('payInFull')}</span>
                  </button>
                  <button
                    type="button"
                    className={`portal-finance-payment-option__card ${paymentPlan === 'installment' ? 'is-selected' : ''}`}
                    onClick={() => setPaymentPlan('installment')}
                    disabled={billingSummary.tuitionCharge.amountDue <= 0}
                  >
                    <span className="portal-finance-payment-option__card-title">{t('payByInstallments')}</span>
                  </button>
                </div>
              ) : null}
              {selectedChargeType === 'tuition' &&
              paymentPlan === 'installment' &&
              tuitionDue > 0 &&
              firstInstallment != null ? (
                <section className="portal-finance-installment-schedule" aria-labelledby="installment-breakdown-heading">
                  <h3 id="installment-breakdown-heading" className="portal-section-heading">
                    {t('installmentPlanBreakdown')}
                  </h3>
                  <dl className="portal-finance-checkout-summary">
                    <div className="portal-finance-checkout-summary__row portal-finance-checkout-summary__row--strong">
                      <dt>{t('totalDueToday')}</dt>
                      <dd>{formatMoney(firstInstallment.totalDue)}</dd>
                    </div>
                    <div className="portal-finance-checkout-summary__row">
                      <dt>{t('remainingAfterToday')}</dt>
                      <dd>{formatMoney(remainingAfterToday)}</dd>
                    </div>
                    <div className="portal-finance-checkout-summary__row">
                      <dt>{t('totalInstallmentServiceFees')}</dt>
                      <dd>{formatMoney(scheduleTotals.totalServiceFees)}</dd>
                    </div>
                  </dl>
                  <ol className="portal-finance-installment-plan__list">
                    {installmentSchedule.map((row) => (
                      <li key={row.installmentNumber} className="portal-finance-installment-plan__item">
                        <div className="portal-finance-installment-plan__item-header">
                          <span>{t('paymentN').replace('{n}', String(row.installmentNumber))}</span>
                          <strong>{formatMoney(row.totalDue)}</strong>
                        </div>
                        <p className="portal-finance-installment-plan__item-note">
                          {t('installmentItemBreakdown')
                            .replace('{tuition}', formatMoney(row.tuitionAmount))
                            .replace('{fee}', formatMoney(row.serviceFee))}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </section>
          ) : null}
          {billingSummary != null && billingSummary.tuitionTotalDue <= 0 ? (
            <p className="portal-inline-note portal-inline-note--flush" role="status">
              {t('tuitionAndLateFeePaid')}
            </p>
          ) : null}
          <div className="portal-finance-checkout-layout">
            <div className="portal-finance-checkout-layout__col">
              <PaymentSummaryCard
                studentName={studentName}
                studentId={displayStudentId}
                termLabel={displayTerm}
                balanceDue={selectedChargeDue}
                breakdownLines={paymentBreakdownLines}
                creditCardFee={processingFee}
                totalCharged={totalCharged}
                cardFundingNote={cardFundingNote}
              />
            </div>
            <div className="portal-finance-checkout-layout__col">
              {applePayAvailable ? (
                <>
                  <section
                    className="portal-card portal-finance-checkout-card"
                    aria-label={t('applePayPayWith')}
                  >
                    <ApplePayButton
                      busy={applePaySubmitting}
                      disabled={submitting || loading || selectedChargeDue <= 0}
                      onClick={() => void handleApplePayPay()}
                    />
                  </section>
                  <div className="portal-finance-checkout-form__divider" aria-hidden="true">
                    {t('applePayOrCardDivider')}
                  </div>
                </>
              ) : null}
              <PaymentCardForm
                amount={amount}
                cardholderName={cardholderName}
                cardNumber={cardNumber}
                expirationDate={expirationDate}
                cvv={cvv}
                billingZip={billingZip}
                allowPartialPayment={false}
                lockedAmountNote={lockedAmountNote}
                disclosureNote={t('creditCardProcessingFeeDisclosure')}
                submitLabel={submitLabel}
                busy={submitting || applePaySubmitting}
                scriptReady={scriptReady}
                error={error}
                onAmountChange={(next) => setAmount(normalizeAmountInput(next))}
                onCardholderNameChange={setCardholderName}
                onCardNumberChange={(next) => setCardNumber(next.replace(/\D/g, ''))}
                onExpirationDateChange={(next) => setExpirationDate(normalizeExpirationInput(next))}
                onCvvChange={(next) => setCvv(next.replace(/\D/g, ''))}
                onBillingZipChange={(next) => setBillingZip(formatBillingZipInput(next))}
                onSubmit={(event) => void handleSubmit(event)}
                onCancel={() => navigate('/finances/overview')}
              />
            </div>
          </div>
        </>
      ) : null}
    </main>
  )
}

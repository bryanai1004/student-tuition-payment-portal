import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { postAuthorizeNetCharge } from '@/lib/api'
import { formatMoney } from '@/lib/formatMoney'

type FinancePaymentModalProps = {
  isOpen: boolean
  termCode: string
  termLabel: string
  balanceDue: number
  authToken: string | null
  onCancel: () => void
  onPaymentSuccess: (payload: { amount: number; transactionId: string; invoiceNumber: string }) => void
}

type AcceptOpaqueData = {
  dataDescriptor: string
  dataValue: string
}

type AcceptResponseMessage = {
  code?: string
  text?: string
}

type AcceptDispatchSuccessResponse = {
  opaqueData?: AcceptOpaqueData
  messages?: {
    resultCode?: 'Ok' | 'Error'
    message?: AcceptResponseMessage[]
  }
}

declare global {
  interface Window {
    Accept?: {
      dispatchData: (
        secureData: {
          authData: {
            apiLoginID: string
            clientKey: string
          }
          cardData: {
            cardNumber: string
            month: string
            year: string
            cardCode: string
          }
        },
        callback: (response: AcceptDispatchSuccessResponse) => void,
      ) => void
    }
  }
}

const ACCEPT_SCRIPT_SANDBOX = 'https://jstest.authorize.net/v1/Accept.js'
const ACCEPT_SCRIPT_PRODUCTION = 'https://js.authorize.net/v1/Accept.js'

let acceptScriptLoader: Promise<void> | null = null

function buildTermDisplay(termCode: string, termLabel: string): string {
  const trimmed = termCode.trim()
  if (trimmed !== '') return trimmed
  return termLabel.trim()
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizeAmountInput(v: string): string {
  const trimmed = v.trim()
  if (trimmed === '') return ''
  const normalized = trimmed.replace(/[^0-9.]/g, '')
  const parts = normalized.split('.')
  if (parts.length <= 1) return normalized
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
}

function loadAcceptJs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Accept?.dispatchData) return Promise.resolve()
  if (acceptScriptLoader != null) return acceptScriptLoader

  const src = import.meta.env.PROD ? ACCEPT_SCRIPT_PRODUCTION : ACCEPT_SCRIPT_SANDBOX
  acceptScriptLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (existing != null) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Unable to load payment security script.')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load payment security script.'))
    document.head.appendChild(script)
  })

  return acceptScriptLoader
}

function dispatchAcceptData(secureData: {
  authData: { apiLoginID: string; clientKey: string }
  cardData: { cardNumber: string; month: string; year: string; cardCode: string }
}): Promise<AcceptOpaqueData> {
  return new Promise((resolve, reject) => {
    if (!window.Accept?.dispatchData) {
      reject(new Error('Authorize.net Accept.js is not available.'))
      return
    }
    window.Accept.dispatchData(secureData, (response) => {
      if (response.messages?.resultCode === 'Error') {
        const msg = response.messages.message?.map((m) => m.text?.trim() || '').filter(Boolean).join(' ')
        reject(new Error(msg || 'Unable to validate card details.'))
        return
      }
      if (!response.opaqueData?.dataDescriptor || !response.opaqueData?.dataValue) {
        reject(new Error('Payment tokenization failed. Please try again.'))
        return
      }
      resolve(response.opaqueData)
    })
  })
}

export function FinancePaymentModal({
  isOpen,
  termCode,
  termLabel,
  balanceDue,
  authToken,
  onCancel,
  onPaymentSuccess,
}: FinancePaymentModalProps) {
  const [amount, setAmount] = useState(() => roundMoney(Math.max(0, balanceDue)).toFixed(2))
  const [cardNumber, setCardNumber] = useState('')
  const [expMonth, setExpMonth] = useState('')
  const [expYear, setExpYear] = useState('')
  const [cvv, setCvv] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setAmount(roundMoney(Math.max(0, balanceDue)).toFixed(2))
    setCardNumber('')
    setExpMonth('')
    setExpYear('')
    setCvv('')
    setError(null)
    setSubmitting(false)
    setScriptReady(false)
    void loadAcceptJs()
      .then(() => setScriptReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load payment script.'))
  }, [isOpen, balanceDue])

  const amountNum = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) ? roundMoney(n) : Number.NaN
  }, [amount])

  const amountValidationError = useMemo(() => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return 'Enter a valid payment amount greater than 0.'
    }
    if (amountNum > roundMoney(balanceDue)) {
      return 'Payment amount cannot exceed your current balance due.'
    }
    return null
  }, [amountNum, balanceDue])

  if (!isOpen) {
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const apiLoginId = String(import.meta.env.VITE_AUTHORIZE_API_LOGIN_ID ?? '').trim()
    const clientKey = String(import.meta.env.VITE_AUTHORIZE_CLIENT_KEY ?? '').trim()
    if (!apiLoginId || !clientKey) {
      setError('Payment configuration is unavailable. Please contact support.')
      setCvv('')
      return
    }
    if (!scriptReady || !window.Accept?.dispatchData) {
      setError('Secure payment form is still loading. Please wait a moment and try again.')
      setCvv('')
      return
    }
    if (amountValidationError != null) {
      setError(amountValidationError)
      setCvv('')
      return
    }
    if (!/^\d{13,19}$/.test(cardNumber)) {
      setError('Card number must be 13 to 19 digits.')
      setCvv('')
      return
    }
    if (!/^\d{2}$/.test(expMonth) || Number(expMonth) < 1 || Number(expMonth) > 12) {
      setError('Expiration month must be a valid MM value.')
      setCvv('')
      return
    }
    if (!/^\d{4}$/.test(expYear)) {
      setError('Expiration year must be in YYYY format.')
      setCvv('')
      return
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      setError('CVV must be 3 or 4 digits.')
      setCvv('')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const opaqueData = await dispatchAcceptData({
        authData: {
          apiLoginID: apiLoginId,
          clientKey,
        },
        cardData: {
          cardNumber,
          month: expMonth,
          year: expYear,
          cardCode: cvv,
        },
      })
      const result = await postAuthorizeNetCharge(
        {
          term: buildTermDisplay(termCode, termLabel),
          amount: amountNum.toFixed(2),
          opaqueData,
        },
        { authToken: authToken?.trim() || undefined },
      )
      setCvv('')
      onPaymentSuccess({
        amount: Number(result.amount),
        transactionId: result.providerTransactionId,
        invoiceNumber: result.invoiceNumber,
      })
    } catch (e) {
      setCvv('')
      setError(e instanceof Error ? e.message : 'Payment could not be processed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="portal-offered-section-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!submitting && event.target === event.currentTarget) {
          onCancel()
        }
      }}
    >
      <form
        className="portal-offered-section-modal portal-finance-payment-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finance-payment-modal-title"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <h2 id="finance-payment-modal-title" className="portal-offered-section-modal__title">
          Make Payment
        </h2>

        <p className="portal-finance-payment-modal__term">Term: {buildTermDisplay(termCode, termLabel)}</p>

        <label className="portal-finance-payment-modal__field">
          <span>Balance Due</span>
          <input type="text" value={formatMoney(balanceDue)} readOnly />
        </label>

        <label className="portal-finance-payment-modal__field">
          <span>Amount to Pay</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(normalizeAmountInput(e.target.value))}
            autoComplete="off"
            disabled={submitting}
            required
          />
        </label>

        <label className="portal-finance-payment-modal__field">
          <span>Card Number</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            maxLength={19}
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
            disabled={submitting}
            required
          />
        </label>

        <div className="portal-finance-payment-modal__expiry-row">
          <label className="portal-finance-payment-modal__field">
            <span>Expiration Month (MM)</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp-month"
              maxLength={2}
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, ''))}
              disabled={submitting}
              required
            />
          </label>
          <label className="portal-finance-payment-modal__field">
            <span>Expiration Year (YYYY)</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="cc-exp-year"
              maxLength={4}
              value={expYear}
              onChange={(e) => setExpYear(e.target.value.replace(/\D/g, ''))}
              disabled={submitting}
              required
            />
          </label>
        </div>

        <label className="portal-finance-payment-modal__field">
          <span>CVV</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={4}
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
            disabled={submitting}
            required
          />
        </label>

        <p className="portal-inline-note portal-inline-note--flush">
          Your payment information is securely transmitted to Authorize.net.
        </p>

        {error ? (
          <p className="portal-inline-note portal-inline-note--flush portal-finance-payment-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="portal-offered-section-modal__actions">
          <button
            type="button"
            className="portal-btn portal-btn--secondary"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="portal-btn portal-btn--primary"
            disabled={submitting || amountValidationError != null}
          >
            {submitting ? 'Processing...' : 'Pay Now'}
          </button>
        </div>
      </form>
    </div>
  )
}

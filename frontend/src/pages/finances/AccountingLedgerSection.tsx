import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../../context/AccountContext'
import {
  fetchAccountingLedger,
  fetchAccountingQuarters,
  type AccountingLedgerResponse,
  type AccountingQuarterOption,
} from '../../lib/api'
import { formatMoney } from '../../lib/formatMoney'

function dashText(value: string): string {
  return value.trim() !== '' ? value : '—'
}

function ledgerChargeCell(debit: number): string {
  if (debit === 0) return '—'
  return formatMoney(debit)
}

function ledgerPaymentCell(credit: number): string {
  if (credit === 0) return '—'
  return formatMoney(credit)
}

function formatLedgerDate(iso: string): string {
  if (!iso || iso.trim() === '') return '—'
  const d = new Date(`${iso.trim()}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.trim()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function quarterKey(q: AccountingQuarterOption): string {
  return `${q.year}:${q.term}`
}

/**
 * Quarter selector + legacy `accounting` detail table (real students only; hidden when no quarters).
 */
export function AccountingLedgerSection() {
  const { currentStudentId, isAuthenticated } = useAccount()
  const [quarters, setQuarters] = useState<AccountingQuarterOption[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [ledger, setLedger] = useState<AccountingLedgerResponse | null>(null)
  const [loadingQuarters, setLoadingQuarters] = useState(false)
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const studentId = currentStudentId?.trim() ?? ''

  useEffect(() => {
    if (!isAuthenticated || studentId === '') {
      setQuarters([])
      setSelectedKey(null)
      setLedger(null)
      setError(null)
      return
    }

    const ac = new AbortController()
    setLoadingQuarters(true)
    setError(null)

    ;(async () => {
      try {
        const res = await fetchAccountingQuarters(studentId, { signal: ac.signal })
        if (ac.signal.aborted) return
        setQuarters(res.quarters)
        // API returns quarters newest-first; default selection is the latest term/year.
        const newest = res.quarters[0]
        setSelectedKey(newest ? quarterKey(newest) : null)
        setLedger(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setQuarters([])
        setSelectedKey(null)
        setLedger(null)
        setError(
          e instanceof Error ? e.message : 'Could not load accounting quarters.',
        )
      } finally {
        if (!ac.signal.aborted) setLoadingQuarters(false)
      }
    })()

    return () => ac.abort()
  }, [isAuthenticated, studentId])

  const selectedQuarter = useMemo(() => {
    if (selectedKey == null) return null
    return quarters.find((q) => quarterKey(q) === selectedKey) ?? null
  }, [quarters, selectedKey])

  useEffect(() => {
    if (selectedQuarter == null || studentId === '') {
      setLedger(null)
      return
    }
    const ac = new AbortController()
    setLoadingLedger(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetchAccountingLedger(
          studentId,
          selectedQuarter.term,
          selectedQuarter.year,
          { signal: ac.signal },
        )
        if (!ac.signal.aborted) setLedger(res)
      } catch (e) {
        if (!ac.signal.aborted) {
          setLedger(null)
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load ledger for this quarter.',
          )
        }
      } finally {
        if (!ac.signal.aborted) setLoadingLedger(false)
      }
    })()
    return () => ac.abort()
  }, [selectedQuarter, studentId])

  if (!isAuthenticated || studentId === '') {
    return null
  }

  if (loadingQuarters && quarters.length === 0) {
    return (
      <section className="portal-stack" aria-busy="true" aria-live="polite">
        <p className="portal-inline-note portal-inline-note--flush">Loading accounting quarters…</p>
      </section>
    )
  }

  if (!loadingQuarters && quarters.length === 0) {
    if (error) {
      return (
        <section className="portal-stack" aria-live="polite">
          <h2 className="portal-section-heading">Accounting ledger by quarter</h2>
          <p className="portal-inline-note portal-inline-note--flush" role="alert">
            Could not load accounting quarters. {error}
          </p>
        </section>
      )
    }
    return null
  }

  const makePaymentEnabled =
    ledger != null && !loadingLedger && ledger.summary.balance > 0
  const showMakePaymentControl = selectedQuarter != null && quarters.length > 0

  return (
    <section
      className="portal-stack"
      aria-labelledby="accounting-ledger-heading"
    >
      <div className="portal-account-ledger__toolbar">
        <h2 id="accounting-ledger-heading" className="portal-section-heading">
          Accounting ledger by quarter
        </h2>
        <div className="portal-account-ledger__toolbar-actions">
          {showMakePaymentControl ? (
            makePaymentEnabled ? (
              <Link
                to="/plan"
                className="portal-btn portal-btn--primary portal-account-ledger__pay-btn"
              >
                Make Payment
              </Link>
            ) : (
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-account-ledger__pay-btn"
                disabled={loadingLedger || ledger === null}
              >
                Make Payment
              </button>
            )
          ) : null}
          <label className="portal-account-ledger__quarter-label" htmlFor="accounting-quarter-select">
            <span className="visually-hidden">Quarter</span>
            <select
              id="accounting-quarter-select"
              className="portal-account-ledger__select"
              value={selectedKey ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setSelectedKey(v === '' ? null : v)
              }}
              disabled={loadingQuarters}
            >
              {quarters.map((q) => (
                <option key={quarterKey(q)} value={quarterKey(q)}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <p className="portal-inline-note portal-inline-note--flush" role="alert">
          Ledger could not be loaded. {error}
        </p>
      ) : null}

      {loadingLedger && ledger == null ? (
        <p className="portal-inline-note portal-inline-note--flush" aria-busy="true">
          Loading ledger…
        </p>
      ) : ledger ? (
        <>
          <div className="portal-table-wrap">
            <table className="portal-table portal-table--courses">
              <caption className="visually-hidden">
                Detailed accounting entries for {ledger.term} {ledger.year}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Type</th>
                  <th scope="col">Code</th>
                  <th scope="col">Description</th>
                  <th scope="col">Charge</th>
                  <th scope="col">Payment</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((row, index) => (
                  <tr key={`${row.date}-${index}-${row.memo}`}>
                    <td>{formatLedgerDate(row.date)}</td>
                    <td className="portal-table-cell-capitalize">{dashText(row.type)}</td>
                    <td>{dashText(row.code)}</td>
                    <td>{dashText(row.memo)}</td>
                    <td>{ledgerChargeCell(row.debit)}</td>
                    <td>{ledgerPaymentCell(row.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={4}>
                    Total charges
                  </th>
                  <td>{formatMoney(ledger.summary.totalCharges)}</td>
                  <td>—</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={4}>
                    Total payments
                  </th>
                  <td>—</td>
                  <td>{formatMoney(ledger.summary.totalPayments)}</td>
                </tr>
                <tr>
                  <th scope="row" colSpan={4}>
                    Balance
                  </th>
                  <td colSpan={2}>{formatMoney(ledger.summary.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}

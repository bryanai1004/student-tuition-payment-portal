import { useEffect, useState, type ReactNode } from 'react'
import {
  deleteAdminFinanceCharge,
  deleteAdminFinancePayment,
  fetchAdminFinanceLedger,
  postAdminFinanceCharge,
  postAdminFinancePayment,
  putAdminFinanceCharge,
  putAdminFinancePayment,
  type AccountingLedgerResponse,
  type AccountingLedgerRow,
  type TuitionPayFlowLedgerSummary,
} from '../../lib/api'
import { formatMoney } from '../../lib/formatMoney'

type Props = {
  studentId: string
  term: string
  year: number
  quarterLabel: string
  onRosterRefresh: () => void
  /** When `drawer`, omits inline expand padding and quarter label. */
  variant?: 'inline' | 'drawer'
}

function moneyColumn(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '—'
  return formatMoney(n)
}

function textOrDash(s: string): string {
  const t = s.trim()
  return t === '' ? '—' : t
}

function tuitionPayFlowFootRow(
  summary: TuitionPayFlowLedgerSummary | null | undefined,
): ReactNode {
  if (summary == null) return null
  return (
    <tr>
      <td colSpan={4} className="admin-finance-totals__label">
        <strong>Pay Tuition balance</strong>
        <span className="portal-text-muted" style={{ fontWeight: 'normal', marginLeft: 8 }}>
          (tuition + late fee; matches student portal)
        </span>
      </td>
      <td className="admin-table-numeric" colSpan={3}>
        <strong>{formatMoney(summary.tuitionBalanceDue)}</strong>
      </td>
    </tr>
  )
}

type ChargeCategory = 'fees' | 'other' | 'tuition' | 'clinical' | 'exam'

function rowStableKey(r: AccountingLedgerRow, idx: number): string {
  const id = r.sourceId
  if (id != null && String(id) !== '') {
    return `${r.sourceType ?? 'row'}-${String(id)}`
  }
  return `${r.date}-${r.type}-${r.code}-${r.memo}-${idx}`
}

function isManualCharge(r: AccountingLedgerRow): boolean {
  return r.sourceType === 'manual_charge'
}

function isManualPayment(r: AccountingLedgerRow): boolean {
  return r.sourceType === 'manual_payment'
}

function chargeNumericAmount(r: AccountingLedgerRow): number {
  if (r.debit > 0) return r.debit
  if (r.credit > 0) return -r.credit
  return 0
}

export function AdminFinanceLedgerPanel({
  studentId,
  term,
  year,
  quarterLabel,
  onRosterRefresh,
  variant = 'inline',
}: Props) {
  const [ledger, setLedger] = useState<AccountingLedgerResponse | null>(null)
  const [lBusy, setLBusy] = useState(false)
  const [lErr, setLErr] = useState<string | null>(null)

  const [chargeOpen, setChargeOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)

  const [chargeDesc, setChargeDesc] = useState('')
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeCategory, setChargeCategory] = useState<ChargeCategory>('tuition')
  const [chargeErr, setChargeErr] = useState<string | null>(null)
  const [chargeSubmitting, setChargeSubmitting] = useState(false)

  const [payAmount, setPayAmount] = useState('')
  const [payPaidAt, setPayPaidAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [payMethod, setPayMethod] = useState('admin')
  const [payDescription, setPayDescription] = useState(
    'Admin recorded payment',
  )
  const [payErr, setPayErr] = useState<string | null>(null)
  const [paySubmitting, setPaySubmitting] = useState(false)

  const [editChargeId, setEditChargeId] = useState<number | null>(null)
  const [editChargeDesc, setEditChargeDesc] = useState('')
  const [editChargeAmount, setEditChargeAmount] = useState('')
  const [editChargeCategory, setEditChargeCategory] =
    useState<ChargeCategory>('fees')
  const [editChargeErr, setEditChargeErr] = useState<string | null>(null)
  const [editChargeBusy, setEditChargeBusy] = useState(false)

  const [editPayId, setEditPayId] = useState<number | null>(null)
  const [editPayAmount, setEditPayAmount] = useState('')
  const [editPayPaidAt, setEditPayPaidAt] = useState('')
  const [editPayMethod, setEditPayMethod] = useState('')
  const [editPayDescription, setEditPayDescription] = useState('')
  const [editPayErr, setEditPayErr] = useState<string | null>(null)
  const [editPayBusy, setEditPayBusy] = useState(false)

  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLBusy(true)
    setLErr(null)
    setLedger(null)
    ;(async () => {
      try {
        const led = await fetchAdminFinanceLedger(studentId, term, year)
        if (cancelled) return
        setLedger(led)
      } catch (e) {
        if (cancelled) return
        setLedger(null)
        setLErr(
          e instanceof Error
            ? e.message
            : 'Could not load ledger for this quarter.',
        )
      } finally {
        if (!cancelled) setLBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [studentId, term, year])

  async function reloadLedger() {
    setLBusy(true)
    setLErr(null)
    try {
      const led = await fetchAdminFinanceLedger(studentId, term, year)
      setLedger(led)
    } catch (e) {
      setLedger(null)
      setLErr(
        e instanceof Error ? e.message : 'Could not load ledger for this quarter.',
      )
    } finally {
      setLBusy(false)
    }
  }

  function openChargeModal() {
    setChargeErr(null)
    setChargeDesc('')
    setChargeAmount('')
    setChargeCategory('fees')
    setChargeOpen(true)
  }

  function openPaymentModal() {
    setPayErr(null)
    setPayAmount('')
    setPayPaidAt(new Date().toISOString().slice(0, 10))
    setPayMethod('admin')
    setPayDescription('Admin recorded payment')
    setPaymentOpen(true)
  }

  function openEditCharge(r: AccountingLedgerRow) {
    const id = r.sourceId
    if (typeof id !== 'number' || !Number.isFinite(id)) return
    setEditChargeErr(null)
    setEditChargeId(id)
    setEditChargeDesc(r.memo.trim() || '')
    setEditChargeAmount(String(chargeNumericAmount(r)))
    setEditChargeCategory('fees')
  }

  function openEditPayment(r: AccountingLedgerRow) {
    const id = r.sourceId
    if (typeof id !== 'number' || !Number.isFinite(id)) return
    setEditPayErr(null)
    setEditPayId(id)
    setEditPayAmount(String(r.credit > 0 ? r.credit : 0))
    setEditPayPaidAt(
      /^\d{4}-\d{2}-\d{2}$/.test(r.date.trim())
        ? r.date.trim().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    )
    setEditPayMethod(r.code.trim() || 'admin')
    setEditPayDescription(
      r.memo.trim() && r.memo.trim() !== 'Payment'
        ? r.memo.trim()
        : 'Admin recorded payment',
    )
  }

  async function submitCharge() {
    setChargeErr(null)
    const desc = chargeDesc.trim()
    const amt = Number(chargeAmount)
    if (desc === '') {
      setChargeErr('Description is required.')
      return
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setChargeErr('Amount must be a number greater than zero.')
      return
    }
    setChargeSubmitting(true)
    try {
      await postAdminFinanceCharge({
        studentId,
        term,
        year,
        description: desc,
        amount: amt,
        category: chargeCategory,
      })
      setChargeOpen(false)
      onRosterRefresh()
      await reloadLedger()
    } catch (e) {
      setChargeErr(
        e instanceof Error ? e.message : 'Could not post charge.',
      )
    } finally {
      setChargeSubmitting(false)
    }
  }

  async function submitPayment() {
    setPayErr(null)
    const amt = Number(payAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayErr('Amount must be a number greater than zero.')
      return
    }
    const paid = payPaidAt.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paid)) {
      setPayErr('Paid date must be YYYY-MM-DD.')
      return
    }
    const method = payMethod.trim()
    if (method === '') {
      setPayErr('Method is required.')
      return
    }
    setPaySubmitting(true)
    try {
      await postAdminFinancePayment({
        studentId,
        term,
        year,
        amount: amt,
        paidAt: paid,
        method,
        description: payDescription.trim() || 'Admin recorded payment',
      })
      setPaymentOpen(false)
      onRosterRefresh()
      await reloadLedger()
    } catch (e) {
      setPayErr(
        e instanceof Error ? e.message : 'Could not record payment.',
      )
    } finally {
      setPaySubmitting(false)
    }
  }

  async function submitEditCharge() {
    if (editChargeId == null) return
    setEditChargeErr(null)
    const desc = editChargeDesc.trim()
    const amt = Number(editChargeAmount)
    if (desc === '') {
      setEditChargeErr('Description is required.')
      return
    }
    if (!Number.isFinite(amt) || amt === 0) {
      setEditChargeErr('Amount must be non-zero.')
      return
    }
    setRowBusyKey(String(editChargeId))
    setEditChargeBusy(true)
    try {
      await putAdminFinanceCharge(
        editChargeId,
        studentId,
        term,
        year,
        {
          description: desc,
          amount: amt,
          category: editChargeCategory,
        },
      )
      setEditChargeId(null)
      onRosterRefresh()
      await reloadLedger()
    } catch (e) {
      setEditChargeErr(
        e instanceof Error ? e.message : 'Could not update charge.',
      )
    } finally {
      setEditChargeBusy(false)
      setRowBusyKey(null)
    }
  }

  async function submitEditPayment() {
    if (editPayId == null) return
    setEditPayErr(null)
    const amt = Number(editPayAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditPayErr('Amount must be a number greater than zero.')
      return
    }
    const paid = editPayPaidAt.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paid)) {
      setEditPayErr('Paid date must be YYYY-MM-DD.')
      return
    }
    const method = editPayMethod.trim()
    if (method === '') {
      setEditPayErr('Method is required.')
      return
    }
    setRowBusyKey(`p${editPayId}`)
    setEditPayBusy(true)
    try {
      await putAdminFinancePayment(editPayId, studentId, term, year, {
        amount: amt,
        paidAt: paid,
        method,
        description: editPayDescription.trim() || null,
      })
      setEditPayId(null)
      onRosterRefresh()
      await reloadLedger()
    } catch (e) {
      setEditPayErr(
        e instanceof Error ? e.message : 'Could not update payment.',
      )
    } finally {
      setEditPayBusy(false)
      setRowBusyKey(null)
    }
  }

  async function confirmDeleteCharge(r: AccountingLedgerRow) {
    const id = r.sourceId
    if (typeof id !== 'number' || !Number.isFinite(id)) return
    if (
      !window.confirm(
        'Delete this manual charge? This cannot be undone.',
      )
    ) {
      return
    }
    setRowBusyKey(String(id))
    try {
      await deleteAdminFinanceCharge(id, studentId, term, year)
      onRosterRefresh()
      await reloadLedger()
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : 'Could not delete charge.',
      )
    } finally {
      setRowBusyKey(null)
    }
  }

  async function confirmDeletePayment(r: AccountingLedgerRow) {
    const id = r.sourceId
    if (typeof id !== 'number' || !Number.isFinite(id)) return
    if (
      !window.confirm(
        'Delete this payment record? This cannot be undone.',
      )
    ) {
      return
    }
    setRowBusyKey(`p${id}`)
    try {
      await deleteAdminFinancePayment(id, studentId, term, year)
      onRosterRefresh()
      await reloadLedger()
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : 'Could not delete payment.',
      )
    } finally {
      setRowBusyKey(null)
    }
  }

  function renderActions(r: AccountingLedgerRow): ReactNode {
    const sid = typeof r.sourceId === 'number' ? r.sourceId : null
    let busy = false
    if (sid != null) {
      if (isManualCharge(r)) busy = rowBusyKey === String(sid)
      else if (isManualPayment(r)) busy = rowBusyKey === `p${sid}`
    }
    const canManual =
      (isManualCharge(r) || isManualPayment(r)) &&
      r.isEditable === true &&
      r.isDeletable === true &&
      typeof r.sourceId === 'number'

    if (!canManual) {
      return <span className="admin-finance-ledger-actions-muted">—</span>
    }

    return (
      <div className="admin-finance-ledger-actions">
        <button
          type="button"
          className="portal-btn portal-btn--secondary portal-btn--compact portal-btn--tiny"
          disabled={busy || lBusy}
          onClick={() =>
            isManualCharge(r)
              ? openEditCharge(r)
              : openEditPayment(r)
          }
        >
          Edit
        </button>
        <button
          type="button"
          className="portal-btn portal-btn--secondary portal-btn--compact portal-btn--tiny"
          disabled={busy || lBusy}
          onClick={() =>
            isManualCharge(r)
              ? void confirmDeleteCharge(r)
              : void confirmDeletePayment(r)
          }
        >
          Delete
        </button>
      </div>
    )
  }

  const panelBusy = lBusy
  const rootClass =
    variant === 'drawer'
      ? 'admin-finance-drawer-ledger'
      : 'admin-finance-expand'

  return (
    <div className={rootClass}>
      <div className="admin-finance-expand__toolbar">
        {variant === 'inline' ? (
          <p className="admin-finance-expand__quarter-label portal-text-muted admin-form-hint">
            Ledger: <strong>{quarterLabel}</strong>
          </p>
        ) : null}
        <button
          type="button"
          className="portal-btn portal-btn--secondary portal-btn--compact"
          disabled={panelBusy}
          onClick={openChargeModal}
        >
          Post Charge
        </button>
        <button
          type="button"
          className="portal-btn portal-btn--primary portal-btn--compact"
          disabled={panelBusy}
          onClick={openPaymentModal}
        >
          Record Payment
        </button>
      </div>

      {lErr != null ? (
        <p className="admin-form-message" role="alert">
          {lErr}
        </p>
      ) : null}

      {panelBusy && !lErr ? (
        <p className="portal-text-muted" aria-live="polite">
          Loading ledger…
        </p>
      ) : null}

      {!panelBusy && ledger != null ? (
        <div className="portal-table-wrap admin-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Type</th>
                <th scope="col">Code</th>
                <th scope="col">Description</th>
                <th scope="col" className="admin-table-numeric">
                  Charge
                </th>
                <th scope="col" className="admin-table-numeric">
                  Payment
                </th>
                <th scope="col" className="admin-finance-actions-col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="portal-text-muted">
                    No rows for this quarter.
                  </td>
                </tr>
              ) : (
                ledger.rows.map((r, idx) => (
                  <tr key={rowStableKey(r, idx)}>
                    <td>{textOrDash(r.date)}</td>
                    <td>{textOrDash(r.type)}</td>
                    <td>
                      <code className="admin-code">{textOrDash(r.code)}</code>
                    </td>
                    <td>{textOrDash(r.memo)}</td>
                    <td className="admin-table-numeric">{moneyColumn(r.debit)}</td>
                    <td className="admin-table-numeric">
                      {moneyColumn(r.credit)}
                    </td>
                    <td className="admin-finance-actions-cell">
                      {renderActions(r)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="admin-finance-totals__label">
                  <strong>Total Charges</strong>
                </td>
                <td className="admin-table-numeric">
                  <strong>{formatMoney(ledger.summary.totalCharges)}</strong>
                </td>
                <td className="admin-table-numeric">—</td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="admin-finance-totals__label">
                  <strong>Total Payments</strong>
                </td>
                <td className="admin-table-numeric">—</td>
                <td className="admin-table-numeric">
                  <strong>{formatMoney(ledger.summary.totalPayments)}</strong>
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className="admin-finance-totals__label">
                  <strong>Balance</strong>
                </td>
                <td className="admin-table-numeric" colSpan={3}>
                  <strong>{formatMoney(ledger.summary.balance)}</strong>
                </td>
              </tr>
              {tuitionPayFlowFootRow(ledger.tuitionPayFlowSummary)}
            </tfoot>
          </table>
        </div>
      ) : null}

      {chargeOpen ? (
        <div
          className="admin-section-detail-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setChargeOpen(false)
          }}
        >
          <div
            className="admin-section-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-finance-charge-title"
          >
            <h2
              id="admin-finance-charge-title"
              className="admin-section-detail-modal__title"
            >
              Post charge
            </h2>
            <p className="portal-text-muted admin-form-hint" style={{ marginTop: 0 }}>
              Posts to <code className="admin-code">portal_billing_adjustments</code>{' '}
              for {quarterLabel}.
            </p>
            {chargeErr != null ? (
              <p className="admin-form-message" role="alert">
                {chargeErr}
              </p>
            ) : null}
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-charge-desc">Description</label>
              <input
                id="admin-finance-charge-desc"
                className="admin-input"
                value={chargeDesc}
                onChange={(e) => setChargeDesc(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-charge-amt">Amount (USD)</label>
              <input
                id="admin-finance-charge-amt"
                className="admin-input"
                type="number"
                min={0}
                step="0.01"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-charge-cat">Category</label>
              <select
                id="admin-finance-charge-cat"
                className="admin-input"
                value={chargeCategory}
                onChange={(e) =>
                  setChargeCategory(e.target.value as ChargeCategory)
                }
              >
                <option value="fees">fees</option>
                <option value="tuition">tuition</option>
                <option value="clinical">clinical</option>
                <option value="exam">exam</option>
                <option value="other">other</option>
              </select>
            </div>
            <div className="admin-section-detail-modal__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={chargeSubmitting}
                onClick={() => setChargeOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--compact"
                disabled={chargeSubmitting}
                onClick={() => void submitCharge()}
              >
                {chargeSubmitting ? 'Saving…' : 'Post charge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentOpen ? (
        <div
          className="admin-section-detail-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPaymentOpen(false)
          }}
        >
          <div
            className="admin-section-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-finance-pay-title"
          >
            <h2
              id="admin-finance-pay-title"
              className="admin-section-detail-modal__title"
            >
              Record payment
            </h2>
            <p className="portal-text-muted admin-form-hint" style={{ marginTop: 0 }}>
              Inserts into <code className="admin-code">portal_payments</code> for{' '}
              {quarterLabel}.
            </p>
            {payErr != null ? (
              <p className="admin-form-message" role="alert">
                {payErr}
              </p>
            ) : null}
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-pay-amt">Amount (USD)</label>
              <input
                id="admin-finance-pay-amt"
                className="admin-input"
                type="number"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-pay-date">Paid date</label>
              <input
                id="admin-finance-pay-date"
                className="admin-input"
                type="date"
                value={payPaidAt}
                onChange={(e) => setPayPaidAt(e.target.value)}
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-pay-method">Method</label>
              <input
                id="admin-finance-pay-method"
                className="admin-input"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-pay-desc">Description</label>
              <input
                id="admin-finance-pay-desc"
                className="admin-input"
                value={payDescription}
                onChange={(e) => setPayDescription(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="admin-section-detail-modal__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={paySubmitting}
                onClick={() => setPaymentOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--compact"
                disabled={paySubmitting}
                onClick={() => void submitPayment()}
              >
                {paySubmitting ? 'Saving…' : 'Record payment'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editChargeId != null ? (
        <div
          className="admin-section-detail-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditChargeId(null)
          }}
        >
          <div
            className="admin-section-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-finance-edit-charge-title"
          >
            <h2
              id="admin-finance-edit-charge-title"
              className="admin-section-detail-modal__title"
            >
              Edit charge
            </h2>
            <p className="portal-text-muted admin-form-hint" style={{ marginTop: 0 }}>
              Updates manual row in{' '}
              <code className="admin-code">portal_billing_adjustments</code> for{' '}
              {quarterLabel}. Set category if the original value was not preserved in
              the ledger.
            </p>
            {editChargeErr != null ? (
              <p className="admin-form-message" role="alert">
                {editChargeErr}
              </p>
            ) : null}
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-edit-charge-desc">Description</label>
              <input
                id="admin-finance-edit-charge-desc"
                className="admin-input"
                value={editChargeDesc}
                onChange={(e) => setEditChargeDesc(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-edit-charge-amt">Amount (USD)</label>
              <input
                id="admin-finance-edit-charge-amt"
                className="admin-input"
                type="number"
                step="0.01"
                value={editChargeAmount}
                onChange={(e) => setEditChargeAmount(e.target.value)}
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-edit-charge-cat">Category</label>
              <select
                id="admin-finance-edit-charge-cat"
                className="admin-input"
                value={editChargeCategory}
                onChange={(e) =>
                  setEditChargeCategory(e.target.value as ChargeCategory)
                }
              >
                <option value="fees">fees</option>
                <option value="tuition">tuition</option>
                <option value="clinical">clinical</option>
                <option value="exam">exam</option>
                <option value="other">other</option>
              </select>
            </div>
            <div className="admin-section-detail-modal__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={editChargeBusy}
                onClick={() => setEditChargeId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--compact"
                disabled={editChargeBusy}
                onClick={() => void submitEditCharge()}
              >
                {editChargeBusy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editPayId != null ? (
        <div
          className="admin-section-detail-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditPayId(null)
          }}
        >
          <div
            className="admin-section-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-finance-edit-pay-title"
          >
            <h2
              id="admin-finance-edit-pay-title"
              className="admin-section-detail-modal__title"
            >
              Edit payment
            </h2>
            <p className="portal-text-muted admin-form-hint" style={{ marginTop: 0 }}>
              Updates <code className="admin-code">portal_payments</code> for{' '}
              {quarterLabel}.
            </p>
            {editPayErr != null ? (
              <p className="admin-form-message" role="alert">
                {editPayErr}
              </p>
            ) : null}
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-edit-pay-amt">Amount (USD)</label>
              <input
                id="admin-finance-edit-pay-amt"
                className="admin-input"
                type="number"
                min={0}
                step="0.01"
                value={editPayAmount}
                onChange={(e) => setEditPayAmount(e.target.value)}
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-edit-pay-date">Paid date</label>
              <input
                id="admin-finance-edit-pay-date"
                className="admin-input"
                type="date"
                value={editPayPaidAt}
                onChange={(e) => setEditPayPaidAt(e.target.value)}
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-edit-pay-method">Method</label>
              <input
                id="admin-finance-edit-pay-method"
                className="admin-input"
                value={editPayMethod}
                onChange={(e) => setEditPayMethod(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="portal-course-feedback-modal__field">
              <label htmlFor="admin-finance-edit-pay-desc">Description</label>
              <input
                id="admin-finance-edit-pay-desc"
                className="admin-input"
                value={editPayDescription}
                onChange={(e) => setEditPayDescription(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="admin-section-detail-modal__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={editPayBusy}
                onClick={() => setEditPayId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--compact"
                disabled={editPayBusy}
                onClick={() => void submitEditPayment()}
              >
                {editPayBusy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

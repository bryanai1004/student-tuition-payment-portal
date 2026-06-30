import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminFinanceLateFeePreview,
  fetchAdminFinanceQuarterSettings,
  postAdminFinanceReconcileLateFees,
  postAdminFinanceRunLateFeeCheck,
  putAdminFinanceQuarterSettings,
  type AdminFinanceGlobalQuarter,
  type AdminFinanceLateFeePreview,
  type AdminFinanceQuarterSettings,
} from '../../lib/api'

type Props = {
  quarter: AdminFinanceGlobalQuarter
  onSettingsSaved: () => void
}

function formatDueDate(iso: string | null): string {
  if (iso == null || iso.trim() === '') return 'Not set'
  const d = new Date(`${iso.trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function AdminFinanceQuarterPanel({ quarter, onSettingsSaved }: Props) {
  const [settings, setSettings] = useState<AdminFinanceQuarterSettings | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dueDateDraft, setDueDateDraft] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const [preview, setPreview] = useState<AdminFinanceLateFeePreview | null>(
    null,
  )
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewErr, setPreviewErr] = useState<string | null>(null)

  const [reconcileBusy, setReconcileBusy] = useState(false)
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null)
  const [reconcileErr, setReconcileErr] = useState<string | null>(null)

  const [runBusy, setRunBusy] = useState(false)
  const [runMsg, setRunMsg] = useState<string | null>(null)
  const [runErr, setRunErr] = useState<string | null>(null)

  const loadSettings = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const s = await fetchAdminFinanceQuarterSettings(
          quarter.term,
          quarter.year,
          { signal },
        )
        if (signal?.aborted) return
        setSettings(s)
        setDueDateDraft(s.paymentDueDate ?? '')
      } catch (e) {
        if (signal?.aborted) return
        setSettings(null)
        setError(
          e instanceof Error ? e.message : 'Could not load quarter settings.',
        )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [quarter.term, quarter.year],
  )

  useEffect(() => {
    const ac = new AbortController()
    void loadSettings(ac.signal)
    return () => ac.abort()
  }, [loadSettings])

  async function loadPreview() {
    setPreviewBusy(true)
    setPreviewErr(null)
    try {
      const p = await fetchAdminFinanceLateFeePreview(
        quarter.term,
        quarter.year,
      )
      setPreview(p)
    } catch (e) {
      setPreview(null)
      setPreviewErr(
        e instanceof Error ? e.message : 'Could not load late fee preview.',
      )
    } finally {
      setPreviewBusy(false)
    }
  }

  async function saveDueDate() {
    setSaveBusy(true)
    setSaveErr(null)
    setSaveMsg(null)
    try {
      const paymentDueDate =
        dueDateDraft.trim() === '' ? null : dueDateDraft.trim().slice(0, 10)
      const saved = await putAdminFinanceQuarterSettings({
        term: quarter.term,
        year: quarter.year,
        paymentDueDate,
      })
      setSettings(saved)
      setDueDateDraft(saved.paymentDueDate ?? '')
      setSaveMsg('Payment due date saved.')
      onSettingsSaved()
    } catch (e) {
      setSaveErr(
        e instanceof Error ? e.message : 'Could not save payment due date.',
      )
    } finally {
      setSaveBusy(false)
    }
  }

  async function reconcileLateFees() {
    if (
      !window.confirm(
        'Reconcile system late fees for this quarter? This may add or reverse late fee charges.',
      )
    ) {
      return
    }
    setReconcileBusy(true)
    setReconcileErr(null)
    setReconcileMsg(null)
    try {
      const result = await postAdminFinanceReconcileLateFees({
        term: quarter.term,
        year: quarter.year,
      })
      setReconcileMsg(
        `Done: ${result.insertedCount} added, ${result.reversedCount} reversed, ${result.protectedSettledCount} protected.`,
      )
      onSettingsSaved()
      void loadPreview()
    } catch (e) {
      setReconcileErr(
        e instanceof Error ? e.message : 'Late fee reconciliation failed.',
      )
    } finally {
      setReconcileBusy(false)
    }
  }

  async function runLateFeeCheck() {
    setRunBusy(true)
    setRunErr(null)
    setRunMsg(null)
    try {
      const result = await postAdminFinanceRunLateFeeCheck({
        term: quarter.term,
        year: quarter.year,
      })
      setRunMsg(result.message ?? (result.ok ? 'Late fee check completed.' : 'Late fee check finished.'))
      onSettingsSaved()
    } catch (e) {
      setRunErr(
        e instanceof Error ? e.message : 'Late fee check failed.',
      )
    } finally {
      setRunBusy(false)
    }
  }

  if (loading) {
    return (
      <section className="portal-card portal-profile-state" aria-busy="true">
        <p className="portal-profile-state__title">Loading quarter settings</p>
      </section>
    )
  }

  if (error != null) {
    return (
      <section
        className="portal-card portal-profile-state portal-profile-state--error"
        role="alert"
      >
        <p className="portal-profile-state__title">Could not load settings</p>
        <p className="portal-profile-state__detail">{error}</p>
      </section>
    )
  }

  return (
    <div className="admin-finance-quarter-panel">
      <section className="portal-card admin-finance-quarter-card">
        <h2 className="admin-finance-quarter-card__title">Payment due date</h2>
        <p className="portal-text-muted admin-finance-quarter-card__lead">
          Current due date:{' '}
          <strong>{formatDueDate(settings?.paymentDueDate ?? null)}</strong>
        </p>
        {settings?.ddlSaveNote != null ? (
          <p className="admin-form-message admin-finance-quarter-card__note">
            {settings.ddlSaveNote}{' '}
            <Link to="/admin/academic-terms">Academic Terms</Link>
          </p>
        ) : null}
        <div className="admin-finance-quarter-card__form">
          <label className="admin-finance-page-controls__field">
            <span className="portal-text-muted admin-form-hint">
              Payment due date
            </span>
            <input
              type="date"
              className="admin-input"
              value={dueDateDraft}
              disabled={saveBusy || settings?.ddlPersistenceAvailable === false}
              onChange={(e) => setDueDateDraft(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="portal-btn portal-btn--primary portal-btn--compact"
            disabled={
              saveBusy || settings?.ddlPersistenceAvailable === false
            }
            onClick={() => void saveDueDate()}
          >
            Save due date
          </button>
        </div>
        {saveErr != null ? (
          <p className="admin-form-message" role="alert">
            {saveErr}
          </p>
        ) : null}
        {saveMsg != null ? (
          <p className="admin-form-message admin-form-message--success">
            {saveMsg}
          </p>
        ) : null}
      </section>

      <section className="portal-card admin-finance-quarter-card">
        <h2 className="admin-finance-quarter-card__title">Late fees</h2>
        <p className="portal-text-muted admin-finance-quarter-card__lead">
          System late fee: ${settings?.lateFeeAmount ?? 30} when tuition remains
          unpaid after the due date.
        </p>
        <div className="admin-finance-quarter-card__actions">
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-btn--compact"
            disabled={previewBusy}
            onClick={() => void loadPreview()}
          >
            {previewBusy ? 'Loading preview…' : 'Preview reconciliation'}
          </button>
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-btn--compact"
            disabled={reconcileBusy}
            onClick={() => void reconcileLateFees()}
          >
            {reconcileBusy ? 'Reconciling…' : 'Reconcile late fees'}
          </button>
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-btn--compact"
            disabled={runBusy}
            onClick={() => void runLateFeeCheck()}
          >
            {runBusy ? 'Running…' : 'Run late fee check'}
          </button>
        </div>
        {previewErr != null ? (
          <p className="admin-form-message" role="alert">
            {previewErr}
          </p>
        ) : null}
        {preview != null ? (
          <dl className="admin-finance-quarter-preview">
            <div>
              <dt>Students scanned</dt>
              <dd>{preview.studentsScanned}</dd>
            </div>
            <div>
              <dt>Would add late fee</dt>
              <dd>{preview.wouldAddSystemLateFeeCount}</dd>
            </div>
            <div>
              <dt>Would reverse invalid</dt>
              <dd>{preview.wouldReverseInvalidSystemLateFeeCount}</dd>
            </div>
            <div>
              <dt>Needs manual review</dt>
              <dd>{preview.wouldRequireManualReviewCount}</dd>
            </div>
          </dl>
        ) : null}
        {reconcileErr != null ? (
          <p className="admin-form-message" role="alert">
            {reconcileErr}
          </p>
        ) : null}
        {reconcileMsg != null ? (
          <p className="admin-form-message admin-form-message--success">
            {reconcileMsg}
          </p>
        ) : null}
        {runErr != null ? (
          <p className="admin-form-message" role="alert">
            {runErr}
          </p>
        ) : null}
        {runMsg != null ? (
          <p className="admin-form-message admin-form-message--success">
            {runMsg}
          </p>
        ) : null}
      </section>
    </div>
  )
}

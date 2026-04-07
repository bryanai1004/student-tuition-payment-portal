import { Fragment, useEffect, useMemo, useState } from 'react'
import { AdminFinanceLedgerPanel } from '../../components/admin/AdminFinanceLedgerPanel'
import {
  fetchAdminFinanceStudents,
  fetchFinanceQuarterSettings,
  fetchGlobalFinanceQuarters,
  formatMoney,
  postAdminRunLateFee,
  putFinanceQuarterSettings,
  type AdminFinanceGlobalQuarter,
  type AdminFinanceStudentRow,
  type FinanceQuarterSettingsResponse,
} from '../../lib/api'

export function AdminFinancePage() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminFinanceStudentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [quarters, setQuarters] = useState<AdminFinanceGlobalQuarter[]>([])
  const [quartersErr, setQuartersErr] = useState<string | null>(null)
  const [qi, setQi] = useState(0)
  const [settings, setSettings] = useState<FinanceQuarterSettingsResponse | null>(
    null,
  )
  const [ddlInput, setDdlInput] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [saveDdlBusy, setSaveDdlBusy] = useState(false)
  const [lateFeeBusy, setLateFeeBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setQuartersErr(null)
    ;(async () => {
      try {
        const list = await fetchGlobalFinanceQuarters({ signal: ac.signal })
        if (ac.signal.aborted) return
        setQuarters(list)
        setQi(0)
      } catch (e) {
        if (!ac.signal.aborted) {
          setQuarters([])
          setQuartersErr(
            e instanceof Error ? e.message : 'Could not load quarter list.',
          )
        }
      }
    })()
    return () => ac.abort()
  }, [])

  const safeQi = Math.min(qi, Math.max(0, quarters.length - 1))
  const selectedQuarter = quarters[safeQi] ?? null

  useEffect(() => {
    if (selectedQuarter == null) {
      setSettings(null)
      setDdlInput('')
      return
    }
    const ac = new AbortController()
    setSettingsBusy(true)
    ;(async () => {
      try {
        const s = await fetchFinanceQuarterSettings(
          selectedQuarter.term,
          selectedQuarter.year,
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
        setSettings(s)
        setDdlInput(s.paymentDueDate ?? '')
      } catch (e) {
        if (!ac.signal.aborted) {
          setSettings(null)
          setDdlInput('')
        }
      } finally {
        if (!ac.signal.aborted) setSettingsBusy(false)
      }
    })()
    return () => ac.abort()
  }, [selectedQuarter?.term, selectedQuarter?.year])

  useEffect(() => {
    const ac = new AbortController()
    if (selectedQuarter == null) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setRows(null)
    ;(async () => {
      try {
        const data = await fetchAdminFinanceStudents(
          selectedQuarter.term,
          selectedQuarter.year,
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
        setRows(data)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRows(null)
        setError(
          e instanceof Error ? e.message : 'Could not load finance students.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()
    return () => ac.abort()
  }, [reloadKey, selectedQuarter?.term, selectedQuarter?.year])

  const filtered = useMemo(() => {
    if (rows == null) return []
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(
      (r) =>
        r.studentId.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s),
    )
  }, [q, rows])

  const sectionLoading = loading && rows === null && error === null
  const noQuarter = quarters.length === 0 && quartersErr == null
  const canSaveDdl =
    settings?.ddlPersistenceAvailable === true &&
    selectedQuarter != null &&
    quartersErr == null
  const hasPaymentDdl = Boolean(settings?.paymentDueDate?.trim())
  const canRunLateFee =
    selectedQuarter != null &&
    quartersErr == null &&
    hasPaymentDdl

  function toggleLedger(studentId: string) {
    setExpandedId((cur) => (cur === studentId ? null : studentId))
  }

  function bumpRoster() {
    setReloadKey((k) => k + 1)
  }

  async function saveDdl() {
    if (selectedQuarter == null) return
    setSaveDdlBusy(true)
    setBanner(null)
    try {
      const paymentDueDate =
        ddlInput.trim() === '' ? null : ddlInput.trim().slice(0, 10)
      const putRes = await putFinanceQuarterSettings({
        term: selectedQuarter.term,
        year: selectedQuarter.year,
        paymentDueDate,
        lateFeeEnabled: settings?.lateFeeEnabled ?? true,
        lateFeeAmount: settings?.lateFeeAmount ?? 30,
      })
      if (!putRes.ok) {
        setBanner(putRes.message)
        return
      }
      setBanner('Payment due date saved.')
      const s = await fetchFinanceQuarterSettings(
        selectedQuarter.term,
        selectedQuarter.year,
      )
      setSettings(s)
      setDdlInput(s.paymentDueDate ?? '')
    } catch (e) {
      setBanner(
        e instanceof Error ? e.message : 'Could not save payment due date.',
      )
    } finally {
      setSaveDdlBusy(false)
    }
  }

  async function runLateFee() {
    if (selectedQuarter == null) return
    setLateFeeBusy(true)
    setBanner(null)
    try {
      const res = await postAdminRunLateFee(
        selectedQuarter.term,
        selectedQuarter.year,
      )
      const parts = [
        `Inserted: ${res.insertedCount}`,
        `Skipped: ${res.skippedCount}`,
      ]
      if (res.message) parts.push(res.message)
      setBanner(parts.join(' · '))
      bumpRoster()
    } catch (e) {
      setBanner(
        e instanceof Error ? e.message : 'Late fee check failed.',
      )
    } finally {
      setLateFeeBusy(false)
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar admin-page__toolbar--finance">
        <h1 className="admin-page__title admin-page__title--inline">Finance</h1>
        <div className="admin-finance-page-controls">
          <label className="admin-finance-page-controls__field">
            <span className="portal-text-muted admin-form-hint">Quarter</span>
            <select
              className="admin-input"
              value={quarters.length === 0 ? '' : String(safeQi)}
              disabled={quarters.length === 0 || quartersErr != null}
              onChange={(e) => setQi(Number(e.target.value))}
              aria-label="Select quarter for finance roster"
            >
              {quarters.map((opt, i) => (
                <option key={`${opt.term}-${opt.year}`} value={String(i)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-finance-page-controls__field">
            <span className="portal-text-muted admin-form-hint">
              Payment due (DDL)
            </span>
            <input
              type="date"
              className="admin-input"
              value={ddlInput}
              onChange={(e) => setDdlInput(e.target.value)}
              disabled={
                selectedQuarter == null || settingsBusy || quartersErr != null
              }
              aria-label="Payment due date for selected quarter"
            />
          </label>
          <div className="admin-finance-page-controls__actions">
            <button
              type="button"
              className="portal-btn portal-btn--secondary portal-btn--compact"
              disabled={
                !canSaveDdl || saveDdlBusy || settingsBusy
              }
              onClick={() => void saveDdl()}
            >
              {saveDdlBusy ? 'Saving…' : 'Save DDL'}
            </button>
            <button
              type="button"
              className="portal-btn portal-btn--secondary portal-btn--compact"
              disabled={
                !canRunLateFee || lateFeeBusy || settingsBusy
              }
              onClick={() => void runLateFee()}
              title={
                canRunLateFee
                  ? undefined
                  : 'Set a payment due date for this academic term before running late fee check.'
              }
            >
              {lateFeeBusy ? 'Running…' : 'Run Late Fee Check'}
            </button>
          </div>
          {settings != null &&
          settings.ddlSaveNote != null &&
          settings.ddlSaveNote !== '' ? (
            <p className="portal-text-muted admin-form-hint">
              {settings.ddlSaveNote}
            </p>
          ) : null}
          {settings != null &&
          !hasPaymentDdl &&
          selectedQuarter != null &&
          quartersErr == null &&
          !settingsBusy ? (
            <p className="portal-text-muted admin-form-hint">
              Set a payment due date for this academic term before running late
              fee check.
            </p>
          ) : null}
          <div className="admin-page__toolbar-actions admin-page__toolbar-actions--wrap admin-finance-page-controls__search">
            <input
              type="search"
              className="admin-input admin-input--search"
              placeholder="Search by student ID or name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search finance records"
              disabled={sectionLoading || Boolean(error) || noQuarter}
            />
          </div>
        </div>
      </div>

      {quartersErr != null ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
        >
          <p className="portal-profile-state__title">Could not load quarters</p>
          <p className="portal-profile-state__detail">{quartersErr}</p>
        </section>
      ) : null}

      {banner != null && quartersErr == null ? (
        <p
          className="admin-finance-banner portal-text-muted"
          role="status"
        >
          {banner}
        </p>
      ) : null}

      {noQuarter && quartersErr == null ? (
        <section className="portal-card portal-profile-state">
          <p className="portal-profile-state__title">No finance quarters yet</p>
          <p className="portal-profile-state__detail">
            Quarters come from academic terms plus enrollments, legacy accounting,
            or portal billing activity. Configure terms under Academic Terms; payment
            due dates attach to those rows when supported by the database.
          </p>
        </section>
      ) : null}

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading finance roster</p>
          <p className="portal-profile-state__detail">
            Fetching finance roster for {selectedQuarter?.label ?? 'the selected quarter'}.
          </p>
        </section>
      ) : null}

      {!sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
        >
          <p className="portal-profile-state__title">Could not load data</p>
          <p className="portal-profile-state__detail">{error}</p>
        </section>
      ) : null}

      {!sectionLoading && !error && !noQuarter && selectedQuarter != null ? (
        <div className="portal-table-wrap admin-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">Student ID</th>
                <th scope="col">Name</th>
                <th scope="col" className="admin-table-numeric">
                  Balance
                </th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="portal-text-muted">
                    No students match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <Fragment key={r.studentId}>
                    <tr>
                      <td>
                        <code className="admin-code">{r.studentId}</code>
                      </td>
                      <td>{r.name}</td>
                      <td className="admin-table-numeric">
                        {r.balance == null ? '—' : formatMoney(r.balance)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="portal-btn portal-btn--secondary portal-btn--compact"
                          onClick={() => toggleLedger(r.studentId)}
                          aria-expanded={expandedId === r.studentId}
                        >
                          {expandedId === r.studentId
                            ? 'Hide ledger'
                            : 'View Ledger'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === r.studentId ? (
                      <tr className="admin-finance-expand-row">
                        <td colSpan={4} className="admin-finance-expand-cell">
                          <AdminFinanceLedgerPanel
                            studentId={r.studentId}
                            term={selectedQuarter.term}
                            year={selectedQuarter.year}
                            quarterLabel={selectedQuarter.label}
                            onRosterRefresh={bumpRoster}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  )
}

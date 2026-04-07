import { Fragment, useEffect, useMemo, useState } from 'react'
import { AdminFinanceLedgerPanel } from '../../components/admin/AdminFinanceLedgerPanel'
import {
  fetchAdminFinanceStudents,
  fetchGlobalFinanceQuarters,
  formatMoney,
  type AdminFinanceGlobalQuarter,
  type AdminFinanceStudentRow,
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

  function toggleLedger(studentId: string) {
    setExpandedId((cur) => (cur === studentId ? null : studentId))
  }

  function bumpRoster() {
    setReloadKey((k) => k + 1)
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

      {noQuarter && quartersErr == null ? (
        <section className="portal-card portal-profile-state">
          <p className="portal-profile-state__title">No finance quarters yet</p>
          <p className="portal-profile-state__detail">
            Quarters come from academic terms plus enrollments, legacy accounting,
            or portal billing activity. Configure academic terms under Academic Terms.
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
                      <td className="admin-finance-student-id-cell">
                        {r.studentId}
                      </td>
                      <td>{r.name}</td>
                      <td className="admin-table-numeric">
                        {Number.isFinite(r.balance)
                          ? formatMoney(r.balance)
                          : '—'}
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

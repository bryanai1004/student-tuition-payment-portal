import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { AdminFinanceLedgerPanel } from '../../components/admin/AdminFinanceLedgerPanel'
import {
  fetchAdminFinanceStudents,
  formatMoney,
  type AdminFinanceStudentRow,
} from '../../lib/api'

export function AdminFinancePage() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminFinanceStudentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const firstLoadRef = useRef(true)

  useEffect(() => {
    const ac = new AbortController()
    if (firstLoadRef.current) {
      setLoading(true)
    }
    setError(null)
    ;(async () => {
      try {
        const data = await fetchAdminFinanceStudents({ signal: ac.signal })
        if (ac.signal.aborted) return
        setRows(data)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        if (firstLoadRef.current) {
          setRows(null)
        }
        setError(
          e instanceof Error ? e.message : 'Could not load finance students.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
          firstLoadRef.current = false
        }
      }
    })()
    return () => ac.abort()
  }, [reloadKey])

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

  function toggleLedger(studentId: string) {
    setExpandedId((cur) => (cur === studentId ? null : studentId))
  }

  function bumpRoster() {
    setReloadKey((k) => k + 1)
  }

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">Finance</h1>
        <div className="admin-page__toolbar-actions admin-page__toolbar-actions--wrap">
          <input
            type="search"
            className="admin-input admin-input--search"
            placeholder="Search by student ID or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search finance records"
            disabled={sectionLoading || Boolean(error)}
          />
        </div>
      </div>

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading finance roster</p>
          <p className="portal-profile-state__detail">
            Fetching students and latest-quarter balances from the server.
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

      {!sectionLoading && !error ? (
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
                        {formatMoney(r.balance)}
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

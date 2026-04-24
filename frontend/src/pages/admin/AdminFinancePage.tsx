import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFinanceLedgerPanel } from '../../components/admin/AdminFinanceLedgerPanel'
import {
  fetchAdminFinanceStudents,
  fetchGlobalFinanceQuarters,
  formatMoney,
  type AdminFinanceGlobalQuarter,
  type AdminFinanceStudentListItem,
} from '../../lib/api'

type BalanceFilter = 'all' | 'positive' | 'negative' | 'zero'

const DEFAULT_PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 300

export function AdminFinancePage() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('all')
  const [rows, setRows] = useState<AdminFinanceStudentListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [pageRefreshing, setPageRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [quarters, setQuarters] = useState<AdminFinanceGlobalQuarter[]>([])
  const [quartersErr, setQuartersErr] = useState<string | null>(null)
  const [qi, setQi] = useState(0)

  const hasTableDataRef = useRef(false)
  const prevQuarterKeyRef = useRef<string | null>(null)
  const prevListFilterKeyRef = useRef<string>('')

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [q])

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
    setExpandedId(null)
  }, [page, debouncedQ, balanceFilter, selectedQuarter?.term, selectedQuarter?.year])

  useEffect(() => {
    const ac = new AbortController()
    if (selectedQuarter == null) {
      setRows([])
      setTotal(0)
      setLoading(false)
      setPageRefreshing(false)
      setError(null)
      prevQuarterKeyRef.current = null
      prevListFilterKeyRef.current = ''
      hasTableDataRef.current = false
      return
    }

    const term = selectedQuarter.term
    const year = selectedQuarter.year
    const quarterKey = `${term}\0${year}`
    const listFilterKey = `${quarterKey}\0${balanceFilter}\0${debouncedQ}`

    const quarterChanged = prevQuarterKeyRef.current !== quarterKey
    if (quarterChanged) {
      prevQuarterKeyRef.current = quarterKey
      hasTableDataRef.current = false
      setRows(null)
      setLoading(true)
      setPageRefreshing(false)
    }

    const listFiltersChanged = prevListFilterKeyRef.current !== listFilterKey
    if (listFiltersChanged && page !== 1) {
      setPage(1)
      return
    }
    if (listFiltersChanged) {
      prevListFilterKeyRef.current = listFilterKey
    }

    if (!quarterChanged) {
      if (hasTableDataRef.current) {
        setPageRefreshing(true)
      }
    }

    setError(null)

    ;(async () => {
      try {
        const data = await fetchAdminFinanceStudents(term, year, {
          signal: ac.signal,
          query: {
            page,
            pageSize,
            search: debouncedQ,
            balance: balanceFilter,
          },
        })
        if (ac.signal.aborted) return
        setRows(data.items)
        setTotal(data.total)
        setPageSize(data.pageSize)
        hasTableDataRef.current = data.items.length > 0 || data.total > 0
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRows(null)
        setTotal(0)
        hasTableDataRef.current = false
        setError(
          e instanceof Error ? e.message : 'Could not load finance students.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
          setPageRefreshing(false)
        }
      }
    })()
    return () => ac.abort()
  }, [
    reloadKey,
    selectedQuarter,
    page,
    pageSize,
    debouncedQ,
    balanceFilter,
  ])

  const sectionLoading = loading && rows === null && error === null
  const noQuarter = quarters.length === 0 && quartersErr == null

  const canPrev = page > 1
  const canNext = page * pageSize < total

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
              onChange={(e) => {
                setQi(Number(e.target.value))
                setPage(1)
              }}
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
            <label className="admin-finance-page-controls__field admin-finance-page-controls__field--balance-filter">
              <span className="portal-text-muted admin-form-hint">Balance</span>
              <select
                className="admin-input"
                value={balanceFilter}
                onChange={(e) => {
                  setBalanceFilter(e.target.value as BalanceFilter)
                  setPage(1)
                }}
                aria-label="Filter roster by balance sign"
                disabled={sectionLoading || Boolean(error) || noQuarter}
              >
                <option value="all">All balances</option>
                <option value="positive">Positive balance</option>
                <option value="negative">Negative balance</option>
                <option value="zero">Zero balance</option>
              </select>
            </label>
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
        <>
          <div
            className={`portal-table-wrap admin-table-wrap${pageRefreshing ? ' admin-table-wrap--refreshing' : ''}`}
            aria-busy={pageRefreshing}
          >
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
                {rows != null && rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="portal-text-muted">
                      No students match your filters.
                    </td>
                  </tr>
                ) : null}
                {rows != null && rows.length > 0
                  ? rows.map((r) => {
                      const studentName = r.name?.trim() || 'Unknown student'
                      return (
                        <Fragment key={r.studentId}>
                          <tr>
                            <td className="admin-finance-student-id-cell">
                              {r.studentId}
                            </td>
                            <td>
                              <Link
                                to={`/admin/students/${encodeURIComponent(r.studentId)}`}
                                className="admin-student-name-link"
                              >
                                {studentName}
                              </Link>
                            </td>
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
                      )
                    })
                  : null}
              </tbody>
            </table>
          </div>

          <nav
            className="admin-finance-pagination"
            aria-label="Finance roster pagination"
          >
            <p className="admin-finance-pagination__meta portal-text-muted">
              {total === 0
                ? 'No results'
                : `${total} student${total === 1 ? '' : 's'} total · Page ${page}`}
            </p>
            <div className="admin-finance-pagination__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={!canPrev || pageRefreshing}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={!canNext || pageRefreshing}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      ) : null}
    </main>
  )
}

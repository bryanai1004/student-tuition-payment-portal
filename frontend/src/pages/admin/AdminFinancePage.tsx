import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminFinanceQuarterPanel } from '../../components/admin/AdminFinanceQuarterPanel'
import { AdminFinanceStudentDrawer } from '../../components/admin/AdminFinanceStudentDrawer'
import {
  fetchAdminFinanceQuarterSummary,
  fetchAdminFinanceStudents,
  fetchGlobalFinanceQuarters,
  formatMoney,
  type AdminFinanceGlobalQuarter,
  type AdminFinanceQuarterSummary,
  type AdminFinanceStudentListItem,
  type AdminFinanceStudentStatus,
} from '../../lib/api'

type PageTab = 'students' | 'quarter'
type StatusFilter = 'all' | 'owes' | 'paid' | 'late_fee' | 'clinic_unpaid'
type RosterScope = 'quarter' | 'all'

const DEFAULT_PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 300

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'owes', label: 'Owes' },
  { id: 'paid', label: 'Paid' },
  { id: 'late_fee', label: 'Late fee' },
  { id: 'clinic_unpaid', label: 'Clinic unpaid' },
]

function statusLabel(status: AdminFinanceStudentStatus): string {
  switch (status) {
    case 'paid':
      return 'Paid'
    case 'owes':
      return 'Owes'
    case 'overdue':
      return 'Overdue'
    case 'credit':
      return 'Credit'
    default:
      return status
  }
}

function formatSummaryDueDate(iso: string | null): string {
  if (iso == null || iso.trim() === '') return 'Not set'
  const d = new Date(`${iso.trim().slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function AdminFinancePage() {
  const [pageTab, setPageTab] = useState<PageTab>('students')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [rosterScope, setRosterScope] = useState<RosterScope>('quarter')
  const [rows, setRows] = useState<AdminFinanceStudentListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [pageRefreshing, setPageRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedStudent, setSelectedStudent] =
    useState<AdminFinanceStudentListItem | null>(null)

  const [quarters, setQuarters] = useState<AdminFinanceGlobalQuarter[]>([])
  const [quartersErr, setQuartersErr] = useState<string | null>(null)
  const [qi, setQi] = useState(0)

  const [quarterSummary, setQuarterSummary] =
    useState<AdminFinanceQuarterSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryErr, setSummaryErr] = useState<string | null>(null)
  const [summaryReloadKey, setSummaryReloadKey] = useState(0)

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
    setSelectedStudent(null)
  }, [page, debouncedQ, statusFilter, rosterScope, selectedQuarter?.term, selectedQuarter?.year])

  useEffect(() => {
    const ac = new AbortController()
    if (selectedQuarter == null) {
      setQuarterSummary(null)
      setSummaryLoading(false)
      setSummaryErr(null)
      return
    }
    setSummaryLoading(true)
    setSummaryErr(null)
    ;(async () => {
      try {
        const summary = await fetchAdminFinanceQuarterSummary(
          selectedQuarter.term,
          selectedQuarter.year,
          { signal: ac.signal },
        )
        if (ac.signal.aborted) return
        setQuarterSummary(summary)
      } catch (e) {
        if (!ac.signal.aborted) {
          setQuarterSummary(null)
          setSummaryErr(
            e instanceof Error ? e.message : 'Could not load quarter summary.',
          )
        }
      } finally {
        if (!ac.signal.aborted) setSummaryLoading(false)
      }
    })()
    return () => ac.abort()
  }, [
    selectedQuarter?.term,
    selectedQuarter?.year,
    summaryReloadKey,
    reloadKey,
  ])

  useEffect(() => {
    const ac = new AbortController()
    if (selectedQuarter == null || pageTab !== 'students') {
      if (selectedQuarter == null) {
        setRows([])
        setTotal(0)
        setLoading(false)
        setPageRefreshing(false)
        setError(null)
        prevQuarterKeyRef.current = null
        prevListFilterKeyRef.current = ''
        hasTableDataRef.current = false
      }
      return
    }

    const term = selectedQuarter.term
    const year = selectedQuarter.year
    const quarterKey = `${term}\0${year}`
    const listFilterKey = `${quarterKey}\0${statusFilter}\0${rosterScope}\0${debouncedQ}`

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

    if (!quarterChanged && hasTableDataRef.current) {
      setPageRefreshing(true)
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
            status: statusFilter,
            rosterScope,
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
    statusFilter,
    rosterScope,
    pageTab,
  ])

  const sectionLoading = loading && rows === null && error === null
  const noQuarter = quarters.length === 0 && quartersErr == null
  const canPrev = page > 1
  const canNext = page * pageSize < total

  function bumpRoster() {
    setReloadKey((k) => k + 1)
    setSummaryReloadKey((k) => k + 1)
  }

  function openStudent(row: AdminFinanceStudentListItem) {
    setSelectedStudent(row)
  }

  return (
    <main className="admin-page admin-finance-page">
      <div className="admin-page__toolbar admin-page__toolbar--finance">
        <div className="admin-finance-page__heading">
          <h1 className="admin-page__title admin-page__title--inline">Finance</h1>
          <div
            className="admin-finance-page-tabs"
            role="tablist"
            aria-label="Finance sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={pageTab === 'students'}
              className={`admin-finance-page-tab${pageTab === 'students' ? ' admin-finance-page-tab--active' : ''}`}
              onClick={() => setPageTab('students')}
            >
              Students
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pageTab === 'quarter'}
              className={`admin-finance-page-tab${pageTab === 'quarter' ? ' admin-finance-page-tab--active' : ''}`}
              onClick={() => setPageTab('quarter')}
            >
              Quarter
            </button>
          </div>
        </div>

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

          {pageTab === 'students' ? (
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
          ) : null}
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
            or portal billing activity. Configure academic terms under{' '}
            <Link to="/admin/academic-terms">Academic Terms</Link>.
          </p>
        </section>
      ) : null}

      {!noQuarter && selectedQuarter != null ? (
        <>
          {pageTab === 'students' ? (
            <>
              <section
                className="admin-finance-quarter-summary-bar"
                aria-label="Quarter finance summary"
              >
                <div className="admin-finance-quarter-summary-bar__item">
                  <span className="admin-finance-quarter-summary-bar__label">
                    Payment due
                  </span>
                  <strong>
                    {summaryLoading
                      ? '…'
                      : formatSummaryDueDate(
                          quarterSummary?.paymentDueDate ?? null,
                        )}
                  </strong>
                </div>
                <div className="admin-finance-quarter-summary-bar__item">
                  <span className="admin-finance-quarter-summary-bar__label">
                    Students owing
                  </span>
                  <strong>
                    {summaryLoading
                      ? '…'
                      : (quarterSummary?.studentsOwing ?? 0)}
                  </strong>
                </div>
                <div className="admin-finance-quarter-summary-bar__item">
                  <span className="admin-finance-quarter-summary-bar__label">
                    Total outstanding
                  </span>
                  <strong>
                    {summaryLoading
                      ? '…'
                      : formatMoney(quarterSummary?.totalOutstanding ?? 0)}
                  </strong>
                </div>
              </section>
              {summaryErr != null ? (
                <p className="admin-finance-banner portal-text-muted" role="status">
                  {summaryErr}
                </p>
              ) : null}

              {rosterScope === 'all' && statusFilter !== 'all' ? (
                <p className="admin-finance-banner admin-finance-banner--warn" role="status">
                  All students + status filters scan the full roster (~900+). Use{' '}
                  <strong>This quarter</strong> for faster daily work.
                </p>
              ) : null}

              {rosterScope === 'all' && statusFilter === 'all' ? (
                <p className="admin-finance-banner portal-text-muted" role="status">
                  Showing all historical students. Switch to{' '}
                  <strong>This quarter</strong> to load only students with activity
                  in {selectedQuarter.label}.
                </p>
              ) : null}

              <div className="admin-finance-roster-scope">
                <span className="admin-finance-roster-scope__label portal-text-muted">
                  Show
                </span>
                <div
                  className="admin-finance-status-chips admin-finance-status-chips--inline"
                  role="group"
                  aria-label="Roster scope"
                >
                  <button
                    type="button"
                    className={`admin-finance-status-chip${rosterScope === 'quarter' ? ' admin-finance-status-chip--active' : ''}`}
                    aria-pressed={rosterScope === 'quarter'}
                    disabled={sectionLoading || Boolean(error)}
                    onClick={() => {
                      setRosterScope('quarter')
                      setPage(1)
                    }}
                  >
                    This quarter
                  </button>
                  <button
                    type="button"
                    className={`admin-finance-status-chip${rosterScope === 'all' ? ' admin-finance-status-chip--active' : ''}`}
                    aria-pressed={rosterScope === 'all'}
                    disabled={sectionLoading || Boolean(error)}
                    onClick={() => {
                      setRosterScope('all')
                      setPage(1)
                    }}
                  >
                    All students
                  </button>
                </div>
              </div>

              <div
                className="admin-finance-status-chips"
                role="group"
                aria-label="Filter by payment status"
              >
                {STATUS_FILTERS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={`admin-finance-status-chip${statusFilter === chip.id ? ' admin-finance-status-chip--active' : ''}`}
                    aria-pressed={statusFilter === chip.id}
                    disabled={sectionLoading || Boolean(error)}
                    onClick={() => {
                      setStatusFilter(chip.id)
                      setPage(1)
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {sectionLoading ? (
                <section
                  className="portal-card portal-profile-state"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <p className="portal-profile-state__title">
                    Loading finance roster
                  </p>
                  <p className="portal-profile-state__detail">
                    Fetching students for {selectedQuarter.label}.
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
                <>
                  <div
                    className={`portal-table-wrap admin-table-wrap admin-finance-table-wrap${pageRefreshing ? ' admin-table-wrap--refreshing' : ''}`}
                    aria-busy={pageRefreshing}
                  >
                    <table className="portal-table admin-finance-table">
                      <thead>
                        <tr>
                          <th scope="col">Student</th>
                          <th scope="col" className="admin-table-numeric">
                            Balance
                          </th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows != null && rows.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="portal-text-muted">
                              No students match your filters.
                            </td>
                          </tr>
                        ) : null}
                        {rows != null && rows.length > 0
                          ? rows.map((r) => {
                              const studentName =
                                r.name?.trim() || 'Unknown student'
                              const isSelected =
                                selectedStudent?.studentId === r.studentId
                              return (
                                <tr
                                  key={r.studentId}
                                  className={`admin-finance-table-row${isSelected ? ' admin-finance-table-row--selected' : ''}`}
                                  tabIndex={0}
                                  onClick={() => openStudent(r)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      openStudent(r)
                                    }
                                  }}
                                  aria-selected={isSelected}
                                >
                                  <td>
                                    <div className="admin-finance-table-student">
                                      <Link
                                        to={`/admin/students/${encodeURIComponent(r.studentId)}`}
                                        className="admin-student-name-link"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {studentName}
                                      </Link>
                                      <span className="admin-finance-table-student__id portal-text-muted">
                                        {r.studentId}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="admin-table-numeric">
                                    {formatMoney(r.balance)}
                                  </td>
                                  <td>
                                    <span
                                      className={`admin-finance-status-badge admin-finance-status-badge--${r.status}`}
                                    >
                                      {statusLabel(r.status)}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })
                          : null}
                      </tbody>
                    </table>
                  </div>

                  <p className="admin-finance-table-hint portal-text-muted">
                    Click a row to open the bucket breakdown and ledger.
                  </p>

                  <nav
                    className="admin-finance-pagination"
                    aria-label="Finance roster pagination"
                  >
                    <p className="admin-finance-pagination__meta portal-text-muted">
                      {total === 0
                        ? 'No results'
                        : `${total} student${total === 1 ? '' : 's'}${rosterScope === 'quarter' ? ' this quarter' : ''} · Page ${page}`}
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
            </>
          ) : (
            <AdminFinanceQuarterPanel
              quarter={selectedQuarter}
              onSettingsSaved={bumpRoster}
            />
          )}
        </>
      ) : null}

      {selectedStudent != null && selectedQuarter != null ? (
        <AdminFinanceStudentDrawer
          student={selectedStudent}
          term={selectedQuarter.term}
          year={selectedQuarter.year}
          quarterLabel={selectedQuarter.label}
          onClose={() => setSelectedStudent(null)}
          onRosterRefresh={bumpRoster}
        />
      ) : null}
    </main>
  )
}

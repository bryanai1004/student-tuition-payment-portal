import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteSelectedAdminStudents,
  fetchAdminStudents,
  type AdminStudentsProgramFilter,
  type AdminStudentListItem,
} from '../../lib/api'

const PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 300

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function displayCell(value: string | null): string {
  if (value == null || value.trim() === '') return '—'
  return value
}

/** Display ISO `YYYY-MM-DD` as MM/DD/YYYY for table cells. */
function formatTableDate(iso: string | null): string {
  if (iso == null || iso.trim() === '') return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (m) {
    const [, y, mo, d] = m
    return `${mo}/${d}/${y}`
  }
  return displayCell(iso)
}

export function AdminStudentsPage() {
  const [q, setQ] = useState('')
  const [program, setProgram] = useState<AdminStudentsProgramFilter>('all')
  const debouncedSearch = useDebouncedValue(q.trim(), SEARCH_DEBOUNCE_MS)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminStudentListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deleteSummary, setDeleteSummary] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const debouncedSearchPrev = useRef<string | null>(null)
  useEffect(() => {
    if (debouncedSearchPrev.current === null) {
      debouncedSearchPrev.current = debouncedSearch
      return
    }
    if (debouncedSearchPrev.current !== debouncedSearch) {
      debouncedSearchPrev.current = debouncedSearch
      setPage(1)
    }
  }, [debouncedSearch])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetchAdminStudents({
          signal: ac.signal,
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          program,
        })
        if (ac.signal.aborted) return
        setRows(res.items)
        setTotal(res.total)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRows(null)
        setTotal(0)
        setError(
          e instanceof Error ? e.message : 'Could not load students.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()
    return () => ac.abort()
  }, [page, debouncedSearch, program, reloadKey])

  const items = rows ?? []

  const visibleIdSet = useMemo(
    () => new Set(items.map((r) => r.studentId)),
    [items],
  )

  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (visibleIdSet.has(id)) next.add(id)
        else changed = true
      }
      if (!changed && next.size === prev.size) return prev
      return next
    })
  }, [visibleIdSet])

  const selectedInViewCount = useMemo(() => {
    let n = 0
    for (const id of selectedIds) {
      if (visibleIdSet.has(id)) n += 1
    }
    return n
  }, [selectedIds, visibleIdSet])

  const allVisibleSelected =
    items.length > 0 && selectedInViewCount === items.length

  const sectionLoading = loading && rows === null && error === null

  const canGoPrev = page > 1 && !sectionLoading && !error
  const canGoNext =
    !sectionLoading &&
    !error &&
    page * PAGE_SIZE < total

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        for (const r of items) {
          next.add(r.studentId)
        }
      } else {
        for (const r of items) {
          next.delete(r.studentId)
        }
      }
      return next
    })
  }

  async function onDeleteSelected() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const ok = window.confirm(
      `Delete ${ids.length} selected student${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
    )
    if (!ok) return
    setDeleting(true)
    setDeleteSummary(null)
    try {
      const res = await deleteSelectedAdminStudents(ids)
      const parts: string[] = []
      if (res.deletedStudentIds.length > 0) {
        parts.push(`Deleted: ${res.deletedStudentIds.join(', ')}`)
      }
      if (res.blocked.length > 0) {
        const lines = res.blocked.map((b) => `${b.studentId} — ${b.reason}`)
        parts.push(`Not deleted:\n${lines.join('\n')}`)
      }
      if (parts.length === 0) {
        parts.push('No changes were made.')
      }
      setDeleteSummary(parts.join('\n\n'))
      setSelectedIds(new Set())
      setReloadKey((k) => k + 1)
    } catch (e) {
      setDeleteSummary(
        e instanceof Error ? e.message : 'Delete request failed.',
      )
    } finally {
      setDeleting(false)
    }
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">Students</h1>
        <div className="admin-page__toolbar-actions">
          <input
            type="search"
            className="admin-input admin-input--search"
            placeholder="Search by student ID, name, email, or program"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search students"
            disabled={sectionLoading || Boolean(error)}
          />
          <select
            className="admin-input"
            value={program}
            onChange={(e) => {
              setProgram(e.target.value as AdminStudentsProgramFilter)
              setPage(1)
            }}
            aria-label="Filter students by program"
            disabled={sectionLoading || Boolean(error)}
          >
            <option value="all">All</option>
            <option value="dahm">DAHM</option>
            <option value="mahm">MAHM</option>
          </select>
          <button
            type="button"
            className="portal-btn portal-btn--secondary"
            disabled={
              sectionLoading ||
              Boolean(error) ||
              selectedIds.size === 0 ||
              deleting
            }
            onClick={() => void onDeleteSelected()}
          >
            {deleting ? 'Deleting…' : 'Delete Selected'}
          </button>
          <Link
            to="/admin/students/new"
            className="portal-btn portal-btn--primary"
          >
            Add Student
          </Link>
        </div>
      </div>

      {deleteSummary && !sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          role="status"
          aria-live="polite"
          style={{ marginBottom: '1rem' }}
        >
          <p className="portal-profile-state__title" style={{ marginTop: 0 }}>
            Delete result
          </p>
          <pre
            className="portal-profile-state__detail"
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
            }}
          >
            {deleteSummary}
          </pre>
        </section>
      ) : null}

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading students</p>
          <p className="portal-profile-state__detail">
            Please wait while we load the student roster from the school database.
          </p>
        </section>
      ) : null}

      {!sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load students</p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {!sectionLoading && !error && rows != null ? (
        <>
          <div className="portal-table-wrap admin-table-wrap">
            <table className="portal-table portal-data-table admin-students-table--center">
              <thead>
                <tr>
                  <th scope="col" className="admin-students-table__select">
                    <input
                      type="checkbox"
                      aria-label="Select all visible students"
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      disabled={items.length === 0 || deleting}
                    />
                  </th>
                  <th scope="col">Student ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Division</th>
                  <th scope="col">Email</th>
                  <th scope="col">Program</th>
                  <th scope="col">Signed Date</th>
                  <th scope="col">Latest Registration Term</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="portal-card-note">
                      {total === 0 && debouncedSearch === '' && program === 'all'
                        ? 'No students on file.'
                        : 'No students match your filters.'}
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr key={r.studentId}>
                      <td className="admin-students-table__select">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.studentId}`}
                          checked={selectedIds.has(r.studentId)}
                          onChange={(e) =>
                            toggleRow(r.studentId, e.target.checked)
                          }
                          disabled={deleting}
                        />
                      </td>
                      <td>{r.studentId}</td>
                      <td>
                        <Link
                          to={`/admin/students/${encodeURIComponent(r.studentId)}`}
                          className="admin-student-name-link"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td>{r.division}</td>
                      <td>{displayCell(r.email)}</td>
                      <td>{r.program}</td>
                      <td>{formatTableDate(r.signedDate)}</td>
                      <td>{displayCell(r.latestRegistrationTerm)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            className="portal-actions"
            style={{
              marginTop: '1rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.75rem 1rem',
            }}
          >
            <span className="portal-card-note" style={{ marginRight: 'auto' }}>
              {total === 0
                ? '0 results'
                : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
            </span>
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              disabled={!canGoPrev || deleting}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="portal-card-note" aria-current="page">
              Page {page}
            </span>
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              disabled={!canGoNext || deleting}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </main>
  )
}

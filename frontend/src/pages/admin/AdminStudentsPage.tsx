import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteSelectedAdminStudents,
  fetchAdminStudents,
  type AdminStudentListItem,
} from '../../lib/api'

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
  const [rows, setRows] = useState<AdminStudentListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deleteSummary, setDeleteSummary] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const data = await fetchAdminStudents({ signal: ac.signal })
        if (ac.signal.aborted) return
        setRows(data)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRows(null)
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
  }, [reloadKey])

  const filtered = useMemo(() => {
    if (rows == null) return []
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter(
      (r) =>
        r.studentId.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s) ||
        (r.email ?? '').toLowerCase().includes(s),
    )
  }, [q, rows])

  const filteredIdSet = useMemo(
    () => new Set(filtered.map((r) => r.studentId)),
    [filtered],
  )

  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (filteredIdSet.has(id)) next.add(id)
        else changed = true
      }
      if (!changed && next.size === prev.size) return prev
      return next
    })
  }, [filteredIdSet])

  const selectedInViewCount = useMemo(() => {
    let n = 0
    for (const id of selectedIds) {
      if (filteredIdSet.has(id)) n += 1
    }
    return n
  }, [selectedIds, filteredIdSet])

  const allFilteredSelected =
    filtered.length > 0 && selectedInViewCount === filtered.length

  const sectionLoading = loading && rows === null && error === null

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
        for (const r of filtered) {
          next.add(r.studentId)
        }
      } else {
        for (const r of filtered) {
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

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">Students</h1>
        <div className="admin-page__toolbar-actions">
          <input
            type="search"
            className="admin-input admin-input--search"
            placeholder="Search by student ID, name, or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search students"
            disabled={sectionLoading || Boolean(error)}
          />
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
        <div className="portal-table-wrap admin-table-wrap">
          <table className="portal-table portal-data-table admin-students-table--center">
            <thead>
              <tr>
                <th scope="col" className="admin-students-table__select">
                  <input
                    type="checkbox"
                    aria-label="Select all visible students"
                    checked={allFilteredSelected}
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    disabled={filtered.length === 0 || deleting}
                  />
                </th>
                <th scope="col">Student ID</th>
                <th scope="col">Division</th>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Signed Date</th>
                <th scope="col">Latest Registration Term</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="portal-card-note">
                    {rows.length === 0
                      ? 'No students on file.'
                      : 'No students match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
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
                    <td>{r.division}</td>
                    <td>{r.name}</td>
                    <td>{displayCell(r.email)}</td>
                    <td>{formatTableDate(r.signedDate)}</td>
                    <td>{displayCell(r.latestRegistrationTerm)}</td>
                    <td>
                      <div className="admin-table-actions">
                        <Link
                          to={`/admin/students/${encodeURIComponent(r.studentId)}`}
                          className="portal-btn portal-btn--secondary portal-btn--compact"
                        >
                          View
                        </Link>
                        <Link
                          to={`/admin/students/${encodeURIComponent(r.studentId)}/edit`}
                          className="portal-btn portal-btn--secondary portal-btn--compact"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  fetchAdminStudents,
  formatMoney,
  type AdminStudentListItem,
} from '../../lib/api'

function displayCell(value: string | null): string {
  if (value == null || value.trim() === '') return '—'
  return value
}

export function AdminStudentsPage() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminStudentListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

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

  const sectionLoading = loading && rows === null && error === null

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
          <button type="button" className="portal-btn portal-btn--primary">
            Add Student
          </button>
        </div>
      </div>

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
          <table className="portal-table">
            <thead>
              <tr>
                <th scope="col">Student ID</th>
                <th scope="col">Name</th>
                <th scope="col">Program</th>
                <th scope="col">Status</th>
                <th scope="col">Email</th>
                <th scope="col">Balance</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="portal-card-note">
                    {rows.length === 0
                      ? 'No students on file.'
                      : 'No students match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.studentId}</td>
                    <td>{r.name}</td>
                    <td>{displayCell(r.program)}</td>
                    <td>{displayCell(r.status)}</td>
                    <td>{displayCell(r.email)}</td>
                    <td>
                      {r.balance != null && Number.isFinite(r.balance)
                        ? formatMoney(r.balance)
                        : '—'}
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="portal-btn portal-btn--secondary portal-btn--compact"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="portal-btn portal-btn--secondary portal-btn--compact"
                        >
                          Edit
                        </button>
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

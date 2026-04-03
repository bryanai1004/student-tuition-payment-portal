import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
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
          <Link
            to="/admin/students/new"
            className="portal-btn portal-btn--primary"
          >
            Add Student
          </Link>
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
          <table className="portal-table portal-data-table admin-students-table--center">
            <thead>
              <tr>
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

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAdminStudentDetail,
  type AdminStudentDetail,
} from '../../lib/api'

function dashText(value: string | null | undefined): string {
  const s = value?.trim() ?? ''
  return s.length > 0 ? s : '—'
}

function formatUsMdY(iso: string | null | undefined): string {
  const s = iso?.trim() ?? ''
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    return `${mo}/${d}/${y}`
  }
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = d.getFullYear()
  return `${mm}/${dd}/${yy}`
}

function formatEntryYear(y: number | null | undefined): string {
  if (y == null || !Number.isFinite(y)) return '—'
  return String(Math.trunc(y))
}

export function AdminStudentDetailPage() {
  const { studentId: studentIdParam } = useParams<{ studentId: string }>()
  const studentId = studentIdParam ?? ''

  const [detail, setDetail] = useState<AdminStudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!studentId.trim()) {
      setDetail(null)
      setLoading(false)
      setError('Missing student id.')
      return
    }

    const ac = new AbortController()
    setDetail(null)
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const d = await fetchAdminStudentDetail(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setDetail(d)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setDetail(null)
        setError(
          e instanceof Error ? e.message : 'Could not load student.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [studentId, reloadKey])

  const sectionLoading = loading && detail === null && error === null

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <div>
          <Link
            to="/admin/students"
            className="portal-text-muted"
            style={{ fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Students
          </Link>
          <h1 className="admin-page__title admin-page__title--inline">
            {detail?.name ?? 'Student'}
          </h1>
        </div>
        {detail ? (
          <div className="admin-page__toolbar-actions">
            <Link
              to={`/admin/students/${encodeURIComponent(detail.studentId)}/edit`}
              className="portal-btn portal-btn--primary"
            >
              Edit
            </Link>
          </div>
        ) : null}
      </div>

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading student</p>
          <p className="portal-profile-state__detail">
            Please wait while we load this record from the school database.
          </p>
        </section>
      ) : null}

      {!sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load this student</p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
            <Link to="/admin/students" className="portal-btn portal-btn--secondary">
              Back to list
            </Link>
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

      {!sectionLoading && !error && detail ? (
        <div className="portal-stack" style={{ gap: '1.25rem' }}>
          <section
            className="portal-card portal-stack"
            aria-labelledby="admin-student-identity"
          >
            <h2 id="admin-student-identity" className="portal-section-heading">
              Identity
            </h2>
            <dl>
              <div className="portal-row">
                <dt>Student ID</dt>
                <dd>{dashText(detail.studentId)}</dd>
              </div>
              <div className="portal-row">
                <dt>Division</dt>
                <dd>{dashText(detail.division)}</dd>
              </div>
              <div className="portal-row">
                <dt>Name</dt>
                <dd>{dashText(detail.name)}</dd>
              </div>
              <div className="portal-row">
                <dt>Gender</dt>
                <dd>{dashText(detail.gender)}</dd>
              </div>
              <div className="portal-row">
                <dt>Email</dt>
                <dd>{dashText(detail.email)}</dd>
              </div>
            </dl>
          </section>

          <section
            className="portal-card portal-stack"
            aria-labelledby="admin-student-academic"
          >
            <h2 id="admin-student-academic" className="portal-section-heading">
              Academic profile
            </h2>
            <dl>
              <div className="portal-row">
                <dt>Requirements ID</dt>
                <dd>{dashText(detail.requirementsId)}</dd>
              </div>
              <div className="portal-row">
                <dt>Highest degree</dt>
                <dd>{dashText(detail.highestDegree)}</dd>
              </div>
              <div className="portal-row">
                <dt>Background school</dt>
                <dd>{dashText(detail.backgroundSchool)}</dd>
              </div>
              <div className="portal-row">
                <dt>Latest registration term</dt>
                <dd>{dashText(detail.latestRegistrationTerm)}</dd>
              </div>
            </dl>
          </section>

          <section
            className="portal-card portal-stack"
            aria-labelledby="admin-student-entry"
          >
            <h2 id="admin-student-entry" className="portal-section-heading">
              Entry information
            </h2>
            <dl>
              <div className="portal-row">
                <dt>Signed date</dt>
                <dd>{formatUsMdY(detail.signedDate)}</dd>
              </div>
              <div className="portal-row">
                <dt>Enroll start date</dt>
                <dd>{formatUsMdY(detail.enrollStartDate)}</dd>
              </div>
              <div className="portal-row">
                <dt>Resolved entry date</dt>
                <dd>{formatUsMdY(detail.resolvedEntryDate)}</dd>
              </div>
              <div className="portal-row">
                <dt>Entry year</dt>
                <dd>{formatEntryYear(detail.entryYear)}</dd>
              </div>
            </dl>
          </section>

          <section
            className="portal-card portal-stack"
            aria-labelledby="admin-student-contact"
          >
            <h2 id="admin-student-contact" className="portal-section-heading">
              Contact information
            </h2>
            <dl>
              <div className="portal-row">
                <dt>Address</dt>
                <dd>{dashText(detail.address)}</dd>
              </div>
              <div className="portal-row">
                <dt>City</dt>
                <dd>{dashText(detail.city)}</dd>
              </div>
              <div className="portal-row">
                <dt>State</dt>
                <dd>{dashText(detail.state)}</dd>
              </div>
              <div className="portal-row">
                <dt>Zip</dt>
                <dd>{dashText(detail.zip)}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </main>
  )
}

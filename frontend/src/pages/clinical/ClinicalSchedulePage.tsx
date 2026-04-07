import { useEffect, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentClinicalSchedule,
  type ClinicalScheduleSession,
} from '../../lib/api'

function formatScheduleDate(isoYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoYmd.trim())
  if (!m) return isoYmd
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return isoYmd
  }
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function dashText(value: string | null | undefined): string {
  if (value == null) return '—'
  const t = String(value).trim()
  return t === '' ? '—' : t
}

type TableRow = {
  key: string
  date: string
  session: string
  site: string
  faculty: string
  status: string
}

function mapSessionToRow(s: ClinicalScheduleSession): TableRow {
  return {
    key: String(s.id),
    date: formatScheduleDate(s.sessionDate),
    session: dashText(s.sessionName),
    site: dashText(s.site),
    faculty: dashText(s.faculty),
    status: s.status.trim() || 'Scheduled',
  }
}

export function ClinicalSchedulePage() {
  const { currentStudentId } = useAccount()
  const [rows, setRows] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }

    const ac = new AbortController()
    setRows([])
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const sessions = await fetchStudentClinicalSchedule(id, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setRows(sessions.map(mapSessionToRow))
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRows([])
        setError(
          e instanceof Error ? e.message : 'Could not load clinic schedule.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId])

  const id = currentStudentId?.trim()
  const showEmptyAccount = !id
  const sectionLoading = loading && rows.length === 0 && error === null

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">Clinic schedule</h2>
      <p className="portal-page-lede">
        Your published clinic and rotation assignments appear below. Supervisors and sites may update as
        the term approaches—check back for the official schedule released by the clinical affairs office.
      </p>
      {showEmptyAccount ? (
        <p className="portal-page-lede" role="status">
          Sign in to view your clinic schedule.
        </p>
      ) : null}
      {error ? (
        <p className="portal-page-lede" role="alert">
          {error}
        </p>
      ) : null}
      {sectionLoading ? (
        <p className="portal-page-lede" aria-live="polite">
          Loading schedule…
        </p>
      ) : null}
      <section className="portal-module-panel" aria-labelledby="clinic-schedule-table-heading">
        <h3 id="clinic-schedule-table-heading" className="portal-module-panel-heading">
          Upcoming assignments
        </h3>
        <div className="portal-table-wrap">
          <table className="portal-table portal-table--clinical-schedule">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Session</th>
                <th scope="col">Clinic / site</th>
                <th scope="col">Supervising faculty</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.date}</td>
                  <td>{row.session}</td>
                  <td>{row.site}</td>
                  <td>{row.faculty}</td>
                  <td>
                    <span
                      className={
                        row.status === 'Confirmed'
                          ? 'portal-status portal-status--paid'
                          : row.status === 'Tentative'
                            ? 'portal-status portal-status--upcoming'
                            : 'portal-status portal-status--pending'
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../../context/AccountContext'
import {
  deleteStudentClinicalEnrollment,
  fetchStudentClinicalEnrollments,
  fetchStudentOpenClinicalEnrollmentSlots,
  postStudentClinicalEnrollment,
  type StudentClinicalEnrollmentRow,
  type StudentOpenClinicalEnrollmentSlot,
} from '../../lib/api'

function dashText(value: string | null | undefined): string {
  if (value == null) return '—'
  const t = String(value).trim()
  return t === '' ? '—' : t
}

function capDisplay(slot: StudentOpenClinicalEnrollmentSlot): string {
  return slot.capacity == null ? '—' : String(slot.capacity)
}

function remainingDisplay(slot: StudentOpenClinicalEnrollmentSlot): string {
  return slot.remainingSeats == null ? '—' : String(slot.remainingSeats)
}

function enrollDisabled(slot: StudentOpenClinicalEnrollmentSlot): boolean {
  if (slot.alreadyEnrolled) return true
  if (slot.remainingSeats != null && slot.remainingSeats <= 0) return true
  return false
}

export function ClinicalAddDropPage() {
  const { currentStudentId } = useAccount()
  const sid = currentStudentId?.trim() ?? ''

  const [filterTerm, setFilterTerm] = useState('')
  const [filterYear, setFilterYear] = useState('')

  const [openSlots, setOpenSlots] = useState<StudentOpenClinicalEnrollmentSlot[]>([])
  const [enrollments, setEnrollments] = useState<StudentClinicalEnrollmentRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [busyTimetableId, setBusyTimetableId] = useState<number | null>(null)
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<number | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!sid) {
      setOpenSlots([])
      setEnrollments([])
      setLoading(false)
      setError(null)
      return
    }
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const term = filterTerm.trim() !== '' ? filterTerm.trim() : undefined
        const yearRaw = filterYear.trim()
        const year =
          yearRaw !== '' && Number.isFinite(Number(yearRaw))
            ? Number(yearRaw)
            : undefined
        const [open, mine] = await Promise.all([
          fetchStudentOpenClinicalEnrollmentSlots(sid, { term, year }),
          fetchStudentClinicalEnrollments(sid, { term, year }),
        ])
        if (cancelled) return
        setOpenSlots(open)
        setEnrollments(mine)
      } catch (e) {
        if (cancelled) return
        setOpenSlots([])
        setEnrollments([])
        setError(
          e instanceof Error ? e.message : 'Could not load clinic enrollment data.',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sid, filterTerm, filterYear])

  const activeEnrollments = useMemo(
    () =>
      enrollments.filter((r) => r.status.trim().toLowerCase() === 'enrolled'),
    [enrollments],
  )

  async function handleEnroll(timetableId: number) {
    if (!sid) return
    setActionMessage(null)
    setActionError(null)
    setBusyTimetableId(timetableId)
    try {
      await postStudentClinicalEnrollment(sid, { timetableId })
      setActionMessage('You are enrolled in that clinic slot. It will appear on your clinic schedule.')
      const term = filterTerm.trim() !== '' ? filterTerm.trim() : undefined
      const yearRaw = filterYear.trim()
      const year =
        yearRaw !== '' && Number.isFinite(Number(yearRaw))
          ? Number(yearRaw)
          : undefined
      const [open, mine] = await Promise.all([
        fetchStudentOpenClinicalEnrollmentSlots(sid, { term, year }),
        fetchStudentClinicalEnrollments(sid, { term, year }),
      ])
      setOpenSlots(open)
      setEnrollments(mine)
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Could not complete enrollment.',
      )
    } finally {
      setBusyTimetableId(null)
    }
  }

  async function handleDrop(enrollmentId: number) {
    if (!sid) return
    setActionMessage(null)
    setActionError(null)
    setBusyEnrollmentId(enrollmentId)
    try {
      await deleteStudentClinicalEnrollment(sid, enrollmentId)
      setActionMessage('Clinic enrollment dropped.')
      const term = filterTerm.trim() !== '' ? filterTerm.trim() : undefined
      const yearRaw = filterYear.trim()
      const year =
        yearRaw !== '' && Number.isFinite(Number(yearRaw))
          ? Number(yearRaw)
          : undefined
      const [open, mine] = await Promise.all([
        fetchStudentOpenClinicalEnrollmentSlots(sid, { term, year }),
        fetchStudentClinicalEnrollments(sid, { term, year }),
      ])
      setOpenSlots(open)
      setEnrollments(mine)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not drop enrollment.')
    } finally {
      setBusyEnrollmentId(null)
    }
  }

  const showEmptyAccount = !sid
  const anyBusy = busyTimetableId != null || busyEnrollmentId != null

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">Add / drop clinic</h2>
      <p className="portal-page-lede">
        Enroll directly in open weekly clinic slots when seats are available. This is the usual path for
        clinic placement. If you need a special exception, you can still{' '}
        <Link to="/clinical/schedule">request a slot for approval</Link>
        {' '}from your clinic schedule page; staff may also assign placements manually when needed.
      </p>

      {showEmptyAccount ? (
        <p className="portal-page-lede" role="status">
          Sign in to add or drop clinic enrollments.
        </p>
      ) : null}

      {!showEmptyAccount ? (
        <section
          className="portal-module-panel portal-stack"
          aria-labelledby="clinical-enroll-filters-heading"
          style={{ marginBottom: '1.25rem' }}
        >
          <h3
            id="clinical-enroll-filters-heading"
            className="portal-module-panel-heading"
          >
            Term filters
          </h3>
          <p className="portal-inline-note portal-inline-note--flush">
            Leave blank to load all published timetable slots. Narrow by term and year to shorten the list.
          </p>
          <div
            className="portal-actions"
            style={{
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: '0.75rem 1rem',
            }}
          >
            <label
              className="portal-card-note"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            >
              <span>Term</span>
              <input
                type="text"
                className="portal-registration-search-input"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                placeholder="e.g. Spring"
                aria-label="Filter clinic slots by term"
              />
            </label>
            <label
              className="portal-card-note"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            >
              <span>Year</span>
              <input
                type="text"
                className="portal-registration-search-input"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                placeholder="e.g. 2026"
                aria-label="Filter clinic slots by year"
              />
            </label>
          </div>
        </section>
      ) : null}

      {actionError ? (
        <p className="portal-page-lede" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="portal-page-lede" role="status">
          {actionMessage}
        </p>
      ) : null}

      {error ? (
        <p className="portal-page-lede" role="alert">
          {error}
        </p>
      ) : null}
      {!showEmptyAccount && loading ? (
        <p className="portal-page-lede" aria-live="polite">
          Loading clinic slots…
        </p>
      ) : null}

      {!showEmptyAccount ? (
        <section
          className="portal-module-panel portal-stack"
          aria-labelledby="clinical-open-slots-heading"
          style={{ marginBottom: '1.5rem' }}
        >
          <h3
            id="clinical-open-slots-heading"
            className="portal-module-panel-heading"
          >
            Available clinic slots
          </h3>
          <div className="portal-table-wrap">
            <table className="portal-table portal-table--clinical-schedule">
              <thead>
                <tr>
                  <th scope="col">Term / year</th>
                  <th scope="col">Slot</th>
                  <th scope="col">Faculty</th>
                  <th scope="col">Site</th>
                  <th scope="col">Capacity</th>
                  <th scope="col">Enrolled</th>
                  <th scope="col">Remaining</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {openSlots.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8}>
                      <span className="portal-inline-note portal-inline-note--flush">
                        No timetable slots match these filters.
                      </span>
                    </td>
                  </tr>
                ) : null}
                {openSlots.map((slot) => (
                  <tr key={slot.timetableId}>
                    <td>
                      {slot.term} {slot.year}
                    </td>
                    <td>{dashText(slot.slotLabel)}</td>
                    <td>{dashText(slot.faculty)}</td>
                    <td>{dashText(slot.site)}</td>
                    <td>{capDisplay(slot)}</td>
                    <td>{slot.enrolledCount}</td>
                    <td>{remainingDisplay(slot)}</td>
                    <td>
                      <button
                        type="button"
                        className="portal-btn portal-btn--primary"
                        disabled={enrollDisabled(slot) || anyBusy}
                        onClick={() => void handleEnroll(slot.timetableId)}
                      >
                        {busyTimetableId === slot.timetableId
                          ? 'Enrolling…'
                          : slot.alreadyEnrolled
                            ? 'Enrolled'
                            : 'Enroll'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!showEmptyAccount ? (
        <section
          className="portal-module-panel portal-stack"
          aria-labelledby="clinical-my-enrollments-heading"
        >
          <h3
            id="clinical-my-enrollments-heading"
            className="portal-module-panel-heading"
          >
            My clinic enrollments
          </h3>
          <div className="portal-table-wrap">
            <table className="portal-table portal-table--clinical-schedule">
              <thead>
                <tr>
                  <th scope="col">Term / year</th>
                  <th scope="col">Slot</th>
                  <th scope="col">Faculty</th>
                  <th scope="col">Site</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {activeEnrollments.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6}>
                      <span className="portal-inline-note portal-inline-note--flush">
                        No active clinic enrollments for these filters.
                      </span>
                    </td>
                  </tr>
                ) : null}
                {activeEnrollments.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.term} {row.year}
                    </td>
                    <td>{dashText(row.slotLabel)}</td>
                    <td>{dashText(row.faculty)}</td>
                    <td>{dashText(row.site)}</td>
                    <td>
                      <span className="portal-status portal-status--paid">
                        {row.status.trim() || 'enrolled'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary"
                        disabled={anyBusy}
                        onClick={() => void handleDrop(row.id)}
                      >
                        {busyEnrollmentId === row.id ? 'Dropping…' : 'Drop'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {enrollments.some((r) => r.status.trim().toLowerCase() === 'dropped') ? (
            <p className="portal-inline-note" style={{ marginTop: '0.75rem' }}>
              Dropped enrollments stay on file for records but are hidden from this table.
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

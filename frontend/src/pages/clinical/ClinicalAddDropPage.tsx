import { useEffect, useMemo, useState } from 'react'
import { useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '../../context/AccountContext'
import {
  deleteStudentClinicalEnrollment,
  fetchAdminClinicalTimetable,
  fetchStudentClinicalEnrollments,
  type AdminClinicalTimetableSlot,
  type StudentClinicalEnrollmentRow,
} from '../../lib/api'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'

function dashText(value: string | null | undefined): string {
  if (value == null) return '—'
  const s = String(value).trim()
  return s === '' ? '—' : s
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase()
}

function timeRangeForSlot(slot: AdminClinicalTimetableSlot | undefined): string {
  if (!slot) return '—'
  const start = slot.startTime ? formatTimeHmsForDisplay(slot.startTime) : '—'
  const end = slot.endTime ? formatTimeHmsForDisplay(slot.endTime) : '—'
  return `${start} - ${end}`
}

export function ClinicalAddDropPage() {
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const sid = currentStudentId?.trim() ?? ''

  const [selectedTermFilter, setSelectedTermFilter] = useState('')
  const [enrollments, setEnrollments] = useState<StudentClinicalEnrollmentRow[]>([])
  const [timetableSlots, setTimetableSlots] = useState<AdminClinicalTimetableSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!sid) {
      setEnrollments([])
      setTimetableSlots([])
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const [bundle, timetable] = await Promise.all([
          fetchStudentClinicalEnrollments(sid),
          fetchAdminClinicalTimetable(),
        ])
        if (cancelled) return
        setEnrollments(bundle.enrollments)
        setTimetableSlots(timetable)
      } catch (e) {
        if (cancelled) return
        setEnrollments([])
        setTimetableSlots([])
        setError(
          e instanceof Error ? e.message : t('clinicalCouldNotLoadEnrollmentData'),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sid, t, reloadKey])

  const activeEnrollments = useMemo(
    () =>
      enrollments.filter((row) => row.status.trim().toLowerCase() === 'enrolled'),
    [enrollments],
  )

  const termOptions = useMemo(() => {
    const seen = new Set<string>()
    const rows: { key: string; label: string; year: number; term: string }[] = []
    for (const row of activeEnrollments) {
      const key = `${row.year}::${normalizeTerm(row.term)}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        label: `${row.term} ${row.year}`,
        year: row.year,
        term: row.term,
      })
    }
    rows.sort((a, b) => b.year - a.year || a.term.localeCompare(b.term))
    return rows
  }, [activeEnrollments])

  useEffect(() => {
    if (selectedTermFilter.trim() === '') return
    if (!termOptions.some((opt) => opt.key === selectedTermFilter)) {
      setSelectedTermFilter('')
    }
  }, [selectedTermFilter, termOptions])

  const activeTimetableById = useMemo(() => {
    const map = new Map<number, AdminClinicalTimetableSlot>()
    for (const row of timetableSlots) {
      map.set(row.id, row)
    }
    return map
  }, [timetableSlots])

  const filteredEnrollments = useMemo(() => {
    if (selectedTermFilter.trim() === '') return activeEnrollments
    return activeEnrollments.filter(
      (row) => `${row.year}::${normalizeTerm(row.term)}` === selectedTermFilter,
    )
  }, [activeEnrollments, selectedTermFilter])

  async function handleDrop(enrollmentId: number) {
    if (!sid) return
    setActionMessage(null)
    setActionError(null)
    setBusyEnrollmentId(enrollmentId)
    try {
      await deleteStudentClinicalEnrollment(sid, enrollmentId)
      setActionMessage(t('clinicalDropSuccessMessage'))
      setReloadKey((k) => k + 1)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('clinicalCouldNotDropEnrollment'))
    } finally {
      setBusyEnrollmentId(null)
    }
  }

  const showEmptyAccount = !sid
  const anyBusy = busyEnrollmentId != null

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">{t('clinicalMyScheduleNav')}</h2>
      <p className="portal-page-lede">{t('clinicalMyScheduleLede')}</p>

      {showEmptyAccount ? (
        <p className="portal-page-lede" role="status">
          {t('clinicalSignInAddDrop')}
        </p>
      ) : null}

      {!showEmptyAccount ? (
        <section
          className="portal-module-panel portal-stack"
          aria-labelledby="clinical-my-schedule-filters"
          style={{ marginBottom: '1rem' }}
        >
          <h3 id="clinical-my-schedule-filters" className="portal-module-panel-heading">
            {t('clinicalTermFiltersHeading')}
          </h3>
          <div
            className="portal-actions"
            style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem 1rem' }}
          >
            <label
              className="portal-card-note"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            >
              <span>{t('term')}</span>
              <select
                className="portal-account-ledger__select"
                value={selectedTermFilter}
                onChange={(e) => setSelectedTermFilter(e.target.value)}
              >
                <option value="">{t('clinicalAllTerms')}</option>
                {termOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
          {t('clinicalLoadingClinicSlots')}
        </p>
      ) : null}

      {!showEmptyAccount ? (
        <section className="portal-module-panel portal-stack" aria-labelledby="clinical-my-schedule-table">
          <h3 id="clinical-my-schedule-table" className="portal-module-panel-heading">
            {t('clinicalMyScheduleNav')}
          </h3>
          <div className="portal-table-wrap">
            <table className="portal-table portal-table--clinical-schedule">
              <thead>
                <tr>
                  <th scope="col">{t('clinicalColTermYear')}</th>
                  <th scope="col">{t('offeredModalDtWeekdays')}</th>
                  <th scope="col">{t('offeredModalDtTime')}</th>
                  <th scope="col">{t('clinicalColSlot')}</th>
                  <th scope="col">{t('clinicalColFaculty')}</th>
                  <th scope="col">Seat bucket</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('clinicalColAction')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredEnrollments.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8}>
                      <span className="portal-inline-note portal-inline-note--flush">
                        {t('clinicalNoActiveEnrollments')}
                      </span>
                    </td>
                  </tr>
                ) : null}
                {filteredEnrollments.map((row) => {
                  const slotMeta = activeTimetableById.get(row.timetableId)
                  return (
                    <tr key={row.id}>
                      <td>
                        {row.term} {row.year}
                      </td>
                      <td>{dashText(slotMeta?.weekday)}</td>
                      <td>{timeRangeForSlot(slotMeta)}</td>
                      <td>{dashText(row.slotLabel)}</td>
                      <td>{dashText(row.faculty)}</td>
                      <td>
                        {row.seatBucket == null
                          ? '—'
                          : row.seatBucket === 'all'
                            ? 'All levels'
                            : `${row.seatBucket}-level`}
                      </td>
                      <td>
                        <span className="portal-status portal-status--paid">
                          {row.status.trim() || t('clinicalStatusEnrolledFallback')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="portal-btn portal-btn--secondary"
                          disabled={anyBusy}
                          onClick={() => void handleDrop(row.id)}
                        >
                          {busyEnrollmentId === row.id
                            ? t('clinicalDroppingEllipsis')
                            : t('drop')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
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
  const s = String(value).trim()
  return s === '' ? '—' : s
}

function capDisplay(slot: StudentOpenClinicalEnrollmentSlot): string {
  return slot.capacity == null ? '—' : String(slot.capacity)
}

function remainingDisplay(slot: StudentOpenClinicalEnrollmentSlot): string {
  return slot.remainingSeats == null ? '—' : String(slot.remainingSeats)
}

function formatPaymentHoldCountdown(iso: string, nowMs: number): string {
  const end = new Date(iso).getTime()
  if (!Number.isFinite(end)) return '—'
  const ms = Math.max(0, end - nowMs)
  const totalM = Math.floor(ms / 60000)
  const h = Math.floor(totalM / 60)
  const m = totalM % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

function enrollDisabled(slot: StudentOpenClinicalEnrollmentSlot): boolean {
  if (slot.alreadyEnrolled) return true
  if (slot.remainingSeats != null && slot.remainingSeats <= 0) return true
  return false
}

export function ClinicalAddDropPage() {
  const t = useStudentPortalT()
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
  const [paymentHoldNowMs, setPaymentHoldNowMs] = useState(() => Date.now())

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
          e instanceof Error ? e.message : t('clinicalCouldNotLoadEnrollmentData'),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sid, filterTerm, filterYear, t])

  const activeEnrollments = useMemo(
    () =>
      enrollments.filter((r) => r.status.trim().toLowerCase() === 'enrolled'),
    [enrollments],
  )

  const enrollmentsWithPaymentHoldCountdown = useMemo(
    () =>
      activeEnrollments.filter((r) => {
        const iso = r.paymentHoldExpiresAt
        if (iso == null || iso.trim() === '') return false
        const t = new Date(iso).getTime()
        return Number.isFinite(t) && t > paymentHoldNowMs
      }),
    [activeEnrollments, paymentHoldNowMs],
  )

  useEffect(() => {
    if (enrollmentsWithPaymentHoldCountdown.length === 0) return
    const id = window.setInterval(() => {
      setPaymentHoldNowMs(Date.now())
    }, 30_000)
    return () => clearInterval(id)
  }, [enrollmentsWithPaymentHoldCountdown.length])

  async function handleEnroll(timetableId: number) {
    if (!sid) return
    setActionMessage(null)
    setActionError(null)
    setBusyTimetableId(timetableId)
    try {
      const created = await postStudentClinicalEnrollment(sid, { timetableId })
      setActionMessage(
        created.billingChargePosted
          ? `${t('clinicalEnrollmentSuccessSlot')} ${t('clinicalEnrollmentFinanceChargeNote')}`
          : t('clinicalEnrollmentSuccessSlot'),
      )
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
        e instanceof Error ? e.message : t('clinicalCouldNotCompleteEnrollment'),
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
      setActionMessage(t('clinicalDropSuccessMessage'))
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
      setActionError(e instanceof Error ? e.message : t('clinicalCouldNotDropEnrollment'))
    } finally {
      setBusyEnrollmentId(null)
    }
  }

  const showEmptyAccount = !sid
  const anyBusy = busyTimetableId != null || busyEnrollmentId != null

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">{t('clinicalAddDropHeading')}</h2>
      <p className="portal-page-lede">
        {t('clinicalAddDropPageLedeBefore')}
        <Link to="/clinical/schedule">{t('clinicalAddDropLedeLink')}</Link>
        {t('clinicalAddDropPageLedeAfter')}
      </p>

      {showEmptyAccount ? (
        <p className="portal-page-lede" role="status">
          {t('clinicalSignInAddDrop')}
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
            {t('clinicalTermFiltersHeading')}
          </h3>
          <p className="portal-inline-note portal-inline-note--flush">
            {t('clinicalTermFiltersHint')}
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
              <span>{t('clinicalFilterTermLabel')}</span>
              <input
                type="text"
                className="portal-registration-search-input"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                placeholder={t('clinicalPlaceholderSpring')}
                aria-label={t('clinicalFilterSlotsByTermAria')}
              />
            </label>
            <label
              className="portal-card-note"
              style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            >
              <span>{t('clinicalFilterYearLabel')}</span>
              <input
                type="text"
                className="portal-registration-search-input"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                placeholder={t('clinicalPlaceholderYear')}
                aria-label={t('clinicalFilterSlotsByYearAria')}
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
          {t('clinicalLoadingClinicSlots')}
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
            {t('clinicalAvailableSlotsHeading')}
          </h3>
          <div className="portal-table-wrap">
            <table className="portal-table portal-table--clinical-schedule">
              <thead>
                <tr>
                  <th scope="col">{t('clinicalColTermYear')}</th>
                  <th scope="col">{t('clinicalColSlot')}</th>
                  <th scope="col">{t('clinicalColFaculty')}</th>
                  <th scope="col">{t('clinicalColSite')}</th>
                  <th scope="col">{t('clinicalColCapacity')}</th>
                  <th scope="col">{t('clinicalColEnrolled')}</th>
                  <th scope="col">{t('clinicalColRemaining')}</th>
                  <th scope="col">{t('clinicalColAction')}</th>
                </tr>
              </thead>
              <tbody>
                {openSlots.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8}>
                      <span className="portal-inline-note portal-inline-note--flush">
                        {t('clinicalNoSlotsMatchFilters')}
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
                          ? t('clinicalEnrollingEllipsis')
                          : slot.alreadyEnrolled
                            ? t('clinicalEnrolledState')
                            : t('enroll')}
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
            {t('clinicalMyEnrollmentsHeading')}
          </h3>
          {enrollmentsWithPaymentHoldCountdown.length > 0 ? (
            <div
              className="portal-registration-form-hint portal-registration-form-hint--warn portal-stack"
              style={{ marginBottom: '1rem' }}
              role="status"
              aria-live="polite"
            >
              <strong>{t('clinicalPaymentHoldReminderTitle')}</strong>
              <p className="portal-inline-note portal-inline-note--flush" style={{ marginTop: '0.35rem' }}>
                {t('clinicalPaymentHoldReminderBody')}
              </p>
              <ul className="portal-stack" style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                {enrollmentsWithPaymentHoldCountdown.map((row) => (
                  <li key={row.id}>
                    <span className="portal-card-note">{row.slotLabel}</span>
                    {' · '}
                    <span>
                      {t('clinicalPaymentHoldTimeRemaining')}:{' '}
                      {row.paymentHoldExpiresAt != null
                        ? formatPaymentHoldCountdown(row.paymentHoldExpiresAt, paymentHoldNowMs)
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
              <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                <Link className="portal-link" to="/finances/overview">
                  {t('clinicalPaymentHoldFinancesLink')}
                </Link>
              </p>
            </div>
          ) : null}
          <div className="portal-table-wrap">
            <table className="portal-table portal-table--clinical-schedule">
              <thead>
                <tr>
                  <th scope="col">{t('clinicalColTermYear')}</th>
                  <th scope="col">{t('clinicalColSlot')}</th>
                  <th scope="col">{t('clinicalColFaculty')}</th>
                  <th scope="col">{t('clinicalColSite')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('clinicalColAction')}</th>
                </tr>
              </thead>
              <tbody>
                {activeEnrollments.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6}>
                      <span className="portal-inline-note portal-inline-note--flush">
                        {t('clinicalNoActiveEnrollments')}
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
                        {busyEnrollmentId === row.id ? t('clinicalDroppingEllipsis') : t('drop')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {enrollments.some((r) => r.status.trim().toLowerCase() === 'dropped') ? (
            <p className="portal-inline-note" style={{ marginTop: '0.75rem' }}>
              {t('clinicalDroppedEnrollmentsNote')}
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

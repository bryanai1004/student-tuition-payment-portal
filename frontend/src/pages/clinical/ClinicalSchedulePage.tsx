import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { TimetableWeekGrid } from '../../components/timetable/TimetableWeekGrid'
import { useAccount } from '../../context/AccountContext'
import {
  fetchClinicalOfferedTimetable,
  fetchCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  fetchStudentClinicalEnrollments,
  postStudentClinicalEnrollment,
  type AcademicTerm,
  type ClinicalOfferedTimetableSlot,
  type StudentActiveClinicalBookingHold,
  type StudentClinicalEnrollmentRow,
} from '../../lib/api'
import { clinicalOfferedSlotsToLayoutRows } from '../../lib/clinicalTimetableAdapter'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  buildPlacedBlocksByDayForLayout,
  STUDENT_REGISTRATION_TIMETABLE_GRID,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import type { StudentPortalKey } from '../../lib/i18n'
import type { WeekdayFull } from '../../lib/weekdaySchedule'
import {
  mergeTermOptions,
} from '../registration/registrationTermSearch'

const CLINICAL_OFFERED_GRID = STUDENT_REGISTRATION_TIMETABLE_GRID
const CLINICAL_WEEKDAYS: WeekdayFull[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
]

const WEEKDAY_FULL_TO_LABEL: Record<WeekdayFull, StudentPortalKey> = {
  Monday: 'weekdayMonday',
  Tuesday: 'weekdayTuesday',
  Wednesday: 'weekdayWednesday',
  Thursday: 'weekdayThursday',
  Friday: 'weekdayFriday',
  Saturday: 'weekdaySaturday',
  Sunday: 'weekdaySunday',
}

function weekdayColumnLabel(
  full: WeekdayFull,
  t: (key: StudentPortalKey) => string,
): string {
  return t(WEEKDAY_FULL_TO_LABEL[full])
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

function capDisplay(slot: ClinicalOfferedTimetableSlot): string {
  return slot.capacity == null ? '—' : String(slot.capacity)
}

function remainingDisplay(slot: ClinicalOfferedTimetableSlot): string {
  return slot.remainingSeats == null ? '—' : String(slot.remainingSeats)
}

export function ClinicalSchedulePage() {
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const sid = currentStudentId?.trim() ?? ''

  const [recentTerms, setRecentTerms] = useState<AcademicTerm[]>([])
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null)
  const [termsReady, setTermsReady] = useState(false)
  const [selectedTermId, setSelectedTermId] = useState('')

  const [slots, setSlots] = useState<ClinicalOfferedTimetableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [enrollments, setEnrollments] = useState<StudentClinicalEnrollmentRow[]>([])
  const [activeClinicalBookingHold, setActiveClinicalBookingHold] =
    useState<StudentActiveClinicalBookingHold | null>(null)
  const [enrollmentLoading, setEnrollmentLoading] = useState(false)
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null)

  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [pendingEnrollmentSlotId, setPendingEnrollmentSlotId] = useState<number | null>(null)
  const [busyTimetableId, setBusyTimetableId] = useState<number | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [paymentHoldNowMs, setPaymentHoldNowMs] = useState(() => Date.now())
  const [reloadKey, setReloadKey] = useState(0)

  const options = useMemo(
    () => mergeTermOptions(recentTerms, currentTerm),
    [recentTerms, currentTerm],
  )
  const selectedTerm = useMemo(
    () => options.find((x) => x.id === selectedTermId) ?? null,
    [options, selectedTermId],
  )

  const layoutRows = useMemo(() => clinicalOfferedSlotsToLayoutRows(slots), [slots])
  const placedWeekdays = useMemo(
    () => buildPlacedBlocksByDayForLayout(layoutRows, CLINICAL_OFFERED_GRID),
    [layoutRows],
  )
  const hourRows = useMemo(() => {
    const sh = CLINICAL_OFFERED_GRID.startHour ?? 8
    const eh = CLINICAL_OFFERED_GRID.endHour ?? 21
    return Array.from({ length: eh - sh + 1 }, (_, i) => sh + i)
  }, [])
  const bodyHeightPx = timetableBodyHeightPx(CLINICAL_OFFERED_GRID)

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      try {
        const [recentR, currentR] = await Promise.all([
          fetchRecentAcademicTerms(6, { signal: ac.signal }),
          fetchCurrentAcademicTerm({ signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setRecentTerms(recentR)
        setCurrentTerm(currentR)
      } catch {
        if (ac.signal.aborted) return
        setRecentTerms([])
        setCurrentTerm(null)
      } finally {
        if (!ac.signal.aborted) setTermsReady(true)
      }
    })()
    return () => ac.abort()
  }, [])

  useEffect(() => {
    if (!termsReady) return
    if (options.length === 0) {
      if (selectedTermId !== '') setSelectedTermId('')
      return
    }
    if (selectedTermId && options.some((x) => x.id === selectedTermId)) {
      return
    }
    setSelectedTermId(options[0]!.id)
  }, [termsReady, options, selectedTermId])

  useEffect(() => {
    if (!termsReady || selectedTerm == null) {
      setSlots([])
      setSlotsLoading(false)
      setSlotsError(null)
      return
    }
    const ac = new AbortController()
    setSlotsLoading(true)
    setSlotsError(null)
    void (async () => {
      try {
        const rows = await fetchClinicalOfferedTimetable({
          term: selectedTerm.term_name,
          year: selectedTerm.year,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setSlots(rows)
      } catch (e) {
        if (ac.signal.aborted) return
        setSlots([])
        setSlotsError(
          e instanceof Error ? e.message : t('clinicalOfferedTimetableLoadError'),
        )
      } finally {
        if (!ac.signal.aborted) setSlotsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [termsReady, selectedTerm, t, reloadKey])

  useEffect(() => {
    if (!sid || selectedTerm == null) {
      setEnrollments([])
      setActiveClinicalBookingHold(null)
      setEnrollmentLoading(false)
      setEnrollmentError(null)
      return
    }
    const ac = new AbortController()
    setEnrollmentLoading(true)
    setEnrollmentError(null)
    void (async () => {
      try {
        const bundle = await fetchStudentClinicalEnrollments(sid, {
          term: selectedTerm.term_name,
          year: selectedTerm.year,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setEnrollments(bundle.enrollments)
        setActiveClinicalBookingHold(bundle.activeClinicalBookingHold)
      } catch (e) {
        if (ac.signal.aborted) return
        setEnrollments([])
        setActiveClinicalBookingHold(null)
        setEnrollmentError(
          e instanceof Error ? e.message : t('clinicalCouldNotLoadEnrollmentData'),
        )
      } finally {
        if (!ac.signal.aborted) setEnrollmentLoading(false)
      }
    })()
    return () => ac.abort()
  }, [sid, selectedTerm, t, reloadKey])

  useEffect(() => {
    if (!selectedSlotId) return
    if (!slots.some((s) => String(s.id) === selectedSlotId)) {
      setSelectedSlotId('')
    }
  }, [slots, selectedSlotId])

  const selectedSlot = useMemo(() => {
    const n = Number(selectedSlotId)
    if (!Number.isFinite(n)) return undefined
    return slots.find((s) => s.id === n)
  }, [slots, selectedSlotId])
  const pendingEnrollmentSlot = useMemo(() => {
    if (pendingEnrollmentSlotId == null) return null
    return slots.find((s) => s.id === pendingEnrollmentSlotId) ?? null
  }, [slots, pendingEnrollmentSlotId])

  const enrollmentsByTimetable = useMemo(() => {
    const map = new Map<number, StudentClinicalEnrollmentRow>()
    for (const row of enrollments) {
      if (row.status.trim().toLowerCase() === 'enrolled') {
        map.set(row.timetableId, row)
      }
    }
    return map
  }, [enrollments])
  const offeredSlotsById = useMemo(() => {
    const map = new Map<number, ClinicalOfferedTimetableSlot>()
    for (const slot of slots) {
      map.set(slot.id, slot)
    }
    return map
  }, [slots])

  const enrollmentsWithPaymentHoldCountdown = useMemo(
    () =>
      enrollments.filter((r) => {
        if (r.status.trim().toLowerCase() !== 'enrolled') return false
        const iso = r.paymentHoldExpiresAt
        if (iso == null || iso.trim() === '') return false
        const end = new Date(iso).getTime()
        return Number.isFinite(end) && end > paymentHoldNowMs
      }),
    [enrollments, paymentHoldNowMs],
  )

  useEffect(() => {
    if (enrollmentsWithPaymentHoldCountdown.length === 0) return
    const id = window.setInterval(() => {
      setPaymentHoldNowMs(Date.now())
    }, 30_000)
    return () => clearInterval(id)
  }, [enrollmentsWithPaymentHoldCountdown.length])

  useEffect(() => {
    if (pendingEnrollmentSlotId == null) return
    if (!slots.some((s) => s.id === pendingEnrollmentSlotId)) {
      setPendingEnrollmentSlotId(null)
    }
  }, [slots, pendingEnrollmentSlotId])

  function openEnrollmentConfirmation(slot: ClinicalOfferedTimetableSlot | undefined) {
    if (!slot) return
    if (enrollmentsByTimetable.has(slot.id)) return
    if (slot.remainingSeats != null && slot.remainingSeats <= 0) return
    if (busyTimetableId != null) return
    setActionMessage(null)
    setActionError(null)
    setPendingEnrollmentSlotId(slot.id)
  }

  async function handleEnroll(timetableId: number) {
    if (!sid) return
    const slot = slots.find((s) => s.id === timetableId)
    if (!slot) return
    if (enrollmentsByTimetable.has(slot.id)) return
    if (slot.remainingSeats != null && slot.remainingSeats <= 0) return
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
      setReloadKey((k) => k + 1)
      setPendingEnrollmentSlotId(null)
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t('clinicalCouldNotCompleteEnrollment'),
      )
    } finally {
      setBusyTimetableId(null)
    }
  }

  const showEmptyAccount = !sid
  const anyLoading = slotsLoading || enrollmentLoading

  return (
    <main className="portal-page portal-clinical-offered-timetable">
      <section className="portal-card portal-stack" aria-labelledby="clinical-schedule-heading">
        <h2 id="clinical-schedule-heading" className="portal-section-heading">
          {t('clinicSchedule')}
        </h2>
        <p className="portal-text-muted" style={{ marginTop: 0 }}>
          {t('clinicalOfferedTimetableLede')}
        </p>

        {showEmptyAccount ? (
          <p className="portal-page-lede" role="status">
            {t('clinicalSignInAddDrop')}
          </p>
        ) : null}

        {!termsReady ? (
          <p className="portal-text-muted" role="status">
            {t('loadingTerms')}
          </p>
        ) : null}

        {termsReady && options.length === 0 ? (
          <p className="portal-text-muted" role="status">
            {t('noAcademicTermsAvailable')}
          </p>
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
        {slotsError ? (
          <p className="portal-page-lede" role="alert">
            {slotsError}
          </p>
        ) : null}
        {enrollmentError ? (
          <p className="portal-page-lede" role="alert">
            {enrollmentError}
          </p>
        ) : null}

        {!showEmptyAccount && selectedTerm != null ? (
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
              <span>{t('term')}</span>
              <select
                className="portal-account-ledger__select"
                value={selectedTermId}
                onChange={(e) => setSelectedTermId(e.target.value)}
              >
                {options.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.term_name} {term.year}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="portal-card-note"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                minWidth: 'min(100%, 26rem)',
                flex: '1 1 16rem',
              }}
            >
              <span>{t('clinicalWeeklySlot')}</span>
              <select
                className="portal-account-ledger__select"
                value={selectedSlotId}
                onChange={(e) => {
                  const next = e.target.value
                  setSelectedSlotId(next)
                  const timetableId = Number(next)
                  if (Number.isFinite(timetableId) && timetableId > 0) {
                    openEnrollmentConfirmation(slots.find((s) => s.id === timetableId))
                  }
                }}
                disabled={slots.length === 0 || anyLoading}
              >
                <option value="">{t('clinicalSelectSlotPlaceholder')}</option>
                {slots.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.slotCode.trim() || s.slotLabel} · {s.weekday} ·{' '}
                    {formatTimeHmsForDisplay(s.startTime)}-{formatTimeHmsForDisplay(s.endTime)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="portal-btn portal-btn--primary"
              disabled={
                selectedSlot == null ||
                busyTimetableId != null ||
                enrollmentsByTimetable.has(selectedSlot.id) ||
                (selectedSlot.remainingSeats != null && selectedSlot.remainingSeats <= 0)
              }
              onClick={() => {
                openEnrollmentConfirmation(selectedSlot)
              }}
            >
              {selectedSlot && enrollmentsByTimetable.has(selectedSlot.id)
                ? t('clinicalEnrolledState')
                : t('enroll')}
            </button>
          </div>
        ) : null}

        {selectedSlot != null ? (
          <p className="portal-card-note" style={{ marginTop: '0.15rem' }}>
            {selectedSlot.slotCode.trim() || selectedSlot.slotLabel} ·{' '}
            {formatTimeHmsForDisplay(selectedSlot.startTime)}-
            {formatTimeHmsForDisplay(selectedSlot.endTime)} · {t('clinicalColCapacity')}:{' '}
            {capDisplay(selectedSlot)} · {t('clinicalColRemaining')}:{' '}
            {remainingDisplay(selectedSlot)}
          </p>
        ) : null}

        {anyLoading ? (
          <p className="portal-text-muted" role="status">
            {t('clinicalLoadingClinicSlots')}
          </p>
        ) : null}

        {!anyLoading && selectedTerm != null && slots.length === 0 ? (
          <p className="portal-text-muted" role="status">
            {t('clinicalOfferedTimetableEmpty')}
          </p>
        ) : null}

        {!anyLoading && selectedTerm != null && slots.length > 0 ? (
          <div className="portal-clinical-offered-timetable__scroll">
            <div className="admin-timetable-wrap portal-clinical-offered-timetable__inner">
              <TimetableWeekGrid
                weekdays={CLINICAL_WEEKDAYS}
                rootClassName="portal-clinical-offered-timetable__grid"
                placedWeekdays={placedWeekdays}
                hourRows={hourRows}
                bodyHeightPx={bodyHeightPx}
                weekdayLabel={(d) => weekdayColumnLabel(d, t)}
                hourLabel={(h) => formatTimeHmsForDisplay(`${h}:00:00`)}
                renderBlock={(b, d) => {
                  const row = b.source
                  const offered = offeredSlotsById.get(row.timetableId)
                  if (!offered) return null
                  const colW = 100 / b.colCount
                  const insetPx = 3
                  const isEnrolled = enrollmentsByTimetable.has(row.timetableId)
                  const isFull =
                    offered.remainingSeats != null && offered.remainingSeats <= 0
                  const isBusy = busyTimetableId === row.timetableId
                  const disabled = isEnrolled || isFull || busyTimetableId != null
                  const bg = isEnrolled
                    ? 'rgba(16, 124, 16, 0.16)'
                    : isFull
                      ? 'rgba(120, 120, 120, 0.2)'
                      : 'rgba(139, 0, 0, 0.08)'
                  const border = isEnrolled
                    ? 'rgba(16, 124, 16, 0.45)'
                    : isFull
                      ? 'rgba(120, 120, 120, 0.4)'
                      : 'rgba(139, 0, 0, 0.24)'
                  return (
                    <button
                      key={`${row.timetableId}-${d}-${b.startMin}-${b.colIndex}`}
                      type="button"
                      className="admin-timetable-v2__block portal-clinical-offered-timetable__block"
                      style={{
                        top: b.topPx,
                        height: b.heightPx,
                        left: `calc(${colW * b.colIndex}% + ${insetPx}px)`,
                        width: `calc(${colW}% - ${insetPx * 2}px)`,
                        background: bg,
                        borderColor: border,
                        cursor: disabled ? 'default' : 'pointer',
                      }}
                      disabled={disabled}
                      onClick={() =>
                        openEnrollmentConfirmation(offeredSlotsById.get(row.timetableId))
                      }
                    >
                      <span className="admin-timetable-v2__block-title">
                        {offered.slotCode.trim() || offered.slotLabel}
                      </span>
                      <span className="admin-timetable-v2__block-meta">
                        {formatTimeHmsForDisplay(offered.startTime)} –{' '}
                        {formatTimeHmsForDisplay(offered.endTime)}
                      </span>
                      {offered.instructor ? (
                        <span className="admin-timetable-v2__block-meta">
                          {offered.instructor}
                        </span>
                      ) : null}
                      <span className="admin-timetable-v2__block-meta">
                        {offered.enrolledCount} / {capDisplay(offered)} (
                        {t('clinicalColRemaining')}: {remainingDisplay(offered)})
                      </span>
                      <span className="admin-timetable-v2__block-meta">
                        {isBusy
                          ? t('clinicalEnrollingEllipsis')
                          : isEnrolled
                            ? t('clinicalEnrolledState')
                            : isFull
                              ? t('clinicalSlotFull')
                              : t('enroll')}
                      </span>
                    </button>
                  )
                }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {!showEmptyAccount && enrollmentsWithPaymentHoldCountdown.length > 0 ? (
        <section className="portal-module-panel portal-stack" style={{ marginTop: '1rem' }}>
          <div
            className="portal-registration-form-hint portal-registration-form-hint--warn portal-stack"
            role="status"
            aria-live="polite"
          >
            <strong>{t('clinicalPaymentHoldReminderTitle')}</strong>
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
            {activeClinicalBookingHold ? (
              <p className="portal-inline-note portal-inline-note--flush" style={{ marginTop: '0.35rem' }}>
                {t('clinicalPaymentHoldDuePrefix')}{' '}
                {formatPaymentHoldCountdown(activeClinicalBookingHold.holdExpiresAt, paymentHoldNowMs)}
              </p>
            ) : null}
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <Link className="portal-link" to="/finances/overview">
                {t('clinicalPaymentHoldFinancesLink')}
              </Link>
            </p>
          </div>
        </section>
      ) : null}

      {pendingEnrollmentSlot != null ? (
        <div
          className="portal-offered-section-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && busyTimetableId == null) {
              setPendingEnrollmentSlotId(null)
            }
          }}
        >
          <div
            className="portal-offered-section-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clinical-enroll-confirm-title"
          >
            <h3 id="clinical-enroll-confirm-title" className="portal-offered-section-modal__title">
              {t('enroll')}
            </h3>
            <dl className="portal-offered-section-modal__dl">
              <div>
                <dt>{t('term')}</dt>
                <dd>
                  {pendingEnrollmentSlot.term} {pendingEnrollmentSlot.year}
                </dd>
              </div>
              <div>
                <dt>{t('offeredModalDtWeekdays')}</dt>
                <dd>{pendingEnrollmentSlot.weekday}</dd>
              </div>
              <div>
                <dt>{t('offeredModalDtTime')}</dt>
                <dd>
                  {formatTimeHmsForDisplay(pendingEnrollmentSlot.startTime)} -{' '}
                  {formatTimeHmsForDisplay(pendingEnrollmentSlot.endTime)}
                </dd>
              </div>
              <div>
                <dt>{t('clinicalColSlot')}</dt>
                <dd>{pendingEnrollmentSlot.slotCode.trim() || pendingEnrollmentSlot.slotLabel}</dd>
              </div>
              <div>
                <dt>{t('clinicalColFaculty')}</dt>
                <dd>{pendingEnrollmentSlot.instructor?.trim() || '—'}</dd>
              </div>
              <div>
                <dt>{t('clinicalColCapacity')}</dt>
                <dd>{capDisplay(pendingEnrollmentSlot)}</dd>
              </div>
              <div>
                <dt>{t('clinicalColRemaining')}</dt>
                <dd>{remainingDisplay(pendingEnrollmentSlot)}</dd>
              </div>
            </dl>
            <div className="portal-offered-section-modal__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary"
                disabled={busyTimetableId != null}
                onClick={() => setPendingEnrollmentSlotId(null)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--primary"
                disabled={busyTimetableId != null}
                onClick={() => void handleEnroll(pendingEnrollmentSlot.id)}
              >
                {busyTimetableId === pendingEnrollmentSlot.id
                  ? t('clinicalEnrollingEllipsis')
                  : t('enroll')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

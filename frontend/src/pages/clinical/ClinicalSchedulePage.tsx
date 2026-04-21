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
  fetchStudentOpenClinicalEnrollmentSlots,
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

type ClinicalBrowseFilter = 'my_level' | 'all' | '100' | '200' | '300'

function capDisplay(slot: ClinicalOfferedTimetableSlot): string {
  return slot.capacity == null ? '—' : String(slot.capacity)
}

function remainingDisplay(slot: ClinicalOfferedTimetableSlot): string {
  if (
    slot.yourEffectiveRemaining !== undefined &&
    slot.yourEffectiveRemaining !== null
  ) {
    return String(slot.yourEffectiveRemaining)
  }
  return slot.remainingSeats == null ? '—' : String(slot.remainingSeats)
}

function slotHasSeatForStudent(slot: ClinicalOfferedTimetableSlot): boolean {
  if (
    slot.yourEffectiveRemaining !== undefined &&
    slot.yourEffectiveRemaining !== null
  ) {
    return slot.yourEffectiveRemaining > 0
  }
  if (slot.remainingSeats == null) return true
  return slot.remainingSeats > 0
}

function capacityForClinicalLevel(
  slot: ClinicalOfferedTimetableSlot,
  level: '100' | '200' | '300',
): number {
  if (level === '100') return slot.capacity100
  if (level === '200') return slot.capacity200
  return slot.capacity300
}

function passesBrowseFilter(
  slot: ClinicalOfferedTimetableSlot,
  filter: ClinicalBrowseFilter,
  myLevel: '100' | '200' | '300' | null,
): boolean {
  if (filter === 'all') return true
  if (filter === '100' || filter === '200' || filter === '300') {
    return capacityForClinicalLevel(slot, filter) > 0
  }
  if (myLevel == null) return true
  return slot.capacityAll > 0 || capacityForClinicalLevel(slot, myLevel) > 0
}

type SlotLevelAvailLabelKey =
  | 'clinicalAvailForYourLevel'
  | 'clinicalAvailViaShared'
  | 'clinicalFullForYourLevel'

function slotAvailabilityLabelKey(
  slot: ClinicalOfferedTimetableSlot,
): SlotLevelAvailLabelKey | null {
  if (slot.studentBookingLevel == null) return null
  if (slotHasSeatForStudent(slot)) {
    return slot.wouldBookIntoBucket === 'all' ? 'clinicalAvailViaShared' : 'clinicalAvailForYourLevel'
  }
  return 'clinicalFullForYourLevel'
}

type SlotBlockPalette = 'enrolled' | 'for_level' | 'via_shared' | 'full' | 'legacy_open' | 'legacy_full'

function slotBlockPalette(
  slot: ClinicalOfferedTimetableSlot,
  isEnrolled: boolean,
): SlotBlockPalette {
  if (isEnrolled) return 'enrolled'
  if (slot.studentBookingLevel == null) {
    return slotHasSeatForStudent(slot) ? 'legacy_open' : 'legacy_full'
  }
  if (slotHasSeatForStudent(slot)) {
    return slot.wouldBookIntoBucket === 'all' ? 'via_shared' : 'for_level'
  }
  return 'full'
}

const BLOCK_PALETTE: Record<SlotBlockPalette, { bg: string; border: string }> = {
  enrolled: {
    bg: 'rgba(16, 124, 16, 0.16)',
    border: 'rgba(16, 124, 16, 0.45)',
  },
  for_level: {
    bg: 'rgba(16, 124, 16, 0.12)',
    border: 'rgba(16, 124, 16, 0.38)',
  },
  via_shared: {
    bg: 'rgba(200, 140, 0, 0.16)',
    border: 'rgba(180, 110, 0, 0.42)',
  },
  full: {
    bg: 'rgba(120, 120, 120, 0.2)',
    border: 'rgba(120, 120, 120, 0.4)',
  },
  legacy_open: {
    bg: 'rgba(139, 0, 0, 0.08)',
    border: 'rgba(139, 0, 0, 0.24)',
  },
  legacy_full: {
    bg: 'rgba(120, 120, 120, 0.2)',
    border: 'rgba(120, 120, 120, 0.4)',
  },
}

function seatSummaryLine(
  slot: ClinicalOfferedTimetableSlot,
  t: (key: StudentPortalKey) => string,
): string {
  return t('clinicalSeatSummaryLine')
    .replace('{e100}', String(slot.enrolled100))
    .replace('{c100}', String(slot.capacity100))
    .replace('{e200}', String(slot.enrolled200))
    .replace('{c200}', String(slot.capacity200))
    .replace('{e300}', String(slot.enrolled300))
    .replace('{c300}', String(slot.capacity300))
    .replace('{eAll}', String(slot.enrolledAll))
    .replace('{cAll}', String(slot.capacityAll))
}

function bucketRemainingLine(
  slot: ClinicalOfferedTimetableSlot,
  t: (key: StudentPortalKey) => string,
): string | null {
  if (
    slot.yourLevelBucketRemaining === undefined ||
    slot.allLevelsBucketRemaining === undefined
  ) {
    return null
  }
  return t('clinicalYourBucketRemainingLine')
    .replace('{n}', String(slot.yourLevelBucketRemaining))
    .replace('{m}', String(slot.allLevelsBucketRemaining))
}

function bookingUsesLine(
  slot: ClinicalOfferedTimetableSlot,
  t: (key: StudentPortalKey) => string,
): string {
  const b = slot.wouldBookIntoBucket
  if (b === 'all') return t('clinicalBookingUsesAllLevelSeat')
  if (b === '100' || b === '200' || b === '300') {
    return t('clinicalBookingUsesLevelSeat').replace('{level}', b)
  }
  return '—'
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
  const [browseFilter, setBrowseFilter] = useState<ClinicalBrowseFilter>('my_level')

  const options = useMemo(
    () => mergeTermOptions(recentTerms, currentTerm),
    [recentTerms, currentTerm],
  )
  const selectedTerm = useMemo(
    () => options.find((x) => x.id === selectedTermId) ?? null,
    [options, selectedTermId],
  )

  const studentDetectedLevel = useMemo((): '100' | '200' | '300' | null => {
    for (const s of slots) {
      if (s.studentBookingLevel) return s.studentBookingLevel
    }
    return null
  }, [slots])

  const filteredSlots = useMemo(
    () => slots.filter((s) => passesBrowseFilter(s, browseFilter, studentDetectedLevel)),
    [slots, browseFilter, studentDetectedLevel],
  )

  const layoutRows = useMemo(
    () => clinicalOfferedSlotsToLayoutRows(filteredSlots),
    [filteredSlots],
  )
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
        const offeredPromise = fetchClinicalOfferedTimetable({
          term: selectedTerm.term_name,
          year: selectedTerm.year,
          signal: ac.signal,
        })
        const openPromise =
          sid.trim() !== ''
            ? fetchStudentOpenClinicalEnrollmentSlots(sid, {
                term: selectedTerm.term_name,
                year: selectedTerm.year,
                signal: ac.signal,
              })
            : Promise.resolve(null)
        const [offeredRows, openRows] = await Promise.all([
          offeredPromise,
          openPromise,
        ])
        if (ac.signal.aborted) return
        if (openRows != null) {
          const byTid = new Map(openRows.map((r) => [r.timetableId, r]))
          setSlots(
            offeredRows.map((o) => {
              const ex = byTid.get(o.id)
              if (ex == null) return o
              return {
                ...o,
                studentBookingLevel: ex.studentBookingLevel,
                yourLevelBucketRemaining: ex.yourLevelBucketRemaining,
                allLevelsBucketRemaining: ex.allLevelsBucketRemaining,
                yourEffectiveRemaining: ex.yourEffectiveRemaining,
                wouldBookIntoBucket: ex.wouldBookIntoBucket,
              }
            }),
          )
        } else {
          setSlots(offeredRows)
        }
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
  }, [termsReady, selectedTerm, t, reloadKey, sid])

  useEffect(() => {
    setBrowseFilter('my_level')
  }, [selectedTermId, sid])

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

  useEffect(() => {
    if (!selectedSlotId) return
    if (!filteredSlots.some((s) => String(s.id) === selectedSlotId)) {
      setSelectedSlotId('')
    }
  }, [filteredSlots, selectedSlotId])

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
    if (!slotHasSeatForStudent(slot)) return
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
    if (!slotHasSeatForStudent(slot)) return
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
          <div className="portal-stack" style={{ gap: '0.65rem' }}>
            {!slotsLoading && slots.length > 0 ? (
              <div className="portal-stack" style={{ gap: '0.25rem' }}>
                {studentDetectedLevel != null ? (
                  <p className="portal-page-lede" role="status" style={{ margin: 0 }}>
                    {t('clinicalYourClinicalLevelLine').replace('{level}', studentDetectedLevel)}
                  </p>
                ) : (
                  <p className="portal-text-muted" role="status" style={{ margin: 0 }}>
                    {t('clinicalLevelDataUnavailableHint')}
                  </p>
                )}
              </div>
            ) : null}
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
                style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
              >
                <span>{t('clinicalBrowseFilterLabel')}</span>
                <select
                  className="portal-account-ledger__select"
                  aria-label={t('clinicalBrowseFilterAria')}
                  value={browseFilter}
                  onChange={(e) => setBrowseFilter(e.target.value as ClinicalBrowseFilter)}
                  disabled={slots.length === 0 || anyLoading}
                >
                  <option value="my_level">{t('clinicalBrowseFilterMyLevel')}</option>
                  <option value="all">{t('clinicalBrowseFilterAllSlots')}</option>
                  <option value="100">{t('clinicalBrowseFilterLevel100')}</option>
                  <option value="200">{t('clinicalBrowseFilterLevel200')}</option>
                  <option value="300">{t('clinicalBrowseFilterLevel300')}</option>
                </select>
                <span className="portal-inline-note portal-inline-note--flush">
                  {t('clinicalBrowseFilterHint')}
                </span>
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
                  disabled={filteredSlots.length === 0 || anyLoading}
                >
                  <option value="">{t('clinicalSelectSlotPlaceholder')}</option>
                  {filteredSlots.map((s) => (
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
                  !slotHasSeatForStudent(selectedSlot)
                }
                onClick={() => {
                  openEnrollmentConfirmation(selectedSlot)
                }}
              >
                {selectedSlot && enrollmentsByTimetable.has(selectedSlot.id)
                  ? t('clinicalEnrolledState')
                  : selectedSlot != null &&
                      !enrollmentsByTimetable.has(selectedSlot.id) &&
                      !slotHasSeatForStudent(selectedSlot)
                    ? t('clinicalSlotFull')
                    : t('enroll')}
              </button>
            </div>
          </div>
        ) : null}

        {selectedSlot != null ? (
          <div className="portal-stack" style={{ marginTop: '0.35rem', gap: '0.35rem' }}>
            <p className="portal-card-note" style={{ margin: 0 }}>
              {selectedSlot.slotCode.trim() || selectedSlot.slotLabel} ·{' '}
              {formatTimeHmsForDisplay(selectedSlot.startTime)}-
              {formatTimeHmsForDisplay(selectedSlot.endTime)} · {t('clinicalColCapacity')}:{' '}
              {capDisplay(selectedSlot)} · {t('clinicalColRemaining')} (you):{' '}
              {remainingDisplay(selectedSlot)}
            </p>
            {slotAvailabilityLabelKey(selectedSlot) != null ? (
              <p className="portal-card-note" style={{ margin: 0, fontWeight: 600 }}>
                {t(slotAvailabilityLabelKey(selectedSlot)!)}
              </p>
            ) : null}
            <p className="portal-card-note" style={{ margin: 0 }}>
              {seatSummaryLine(selectedSlot, t)}
            </p>
            {bucketRemainingLine(selectedSlot, t) != null ? (
              <p className="portal-card-note" style={{ margin: 0 }}>
                {bucketRemainingLine(selectedSlot, t)}
              </p>
            ) : null}
            {selectedSlot.studentBookingLevel != null ? (
              <p className="portal-card-note" style={{ margin: 0 }}>
                {t('clinicalModalDtYourClinicalLevel')}: {selectedSlot.studentBookingLevel} ·{' '}
                {t('clinicalModalDtBookingWillUse')}: {bookingUsesLine(selectedSlot, t)}
              </p>
            ) : null}
            {selectedSlot.studentBookingLevel != null &&
            !enrollmentsByTimetable.has(selectedSlot.id) &&
            !slotHasSeatForStudent(selectedSlot) ? (
              <p className="portal-text-muted" role="status" style={{ margin: 0 }}>
                {t('clinicalSlotNotBookableHint')}
              </p>
            ) : null}
          </div>
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

        {!anyLoading && selectedTerm != null && slots.length > 0 && filteredSlots.length === 0 ? (
          <p className="portal-text-muted" role="status">
            {t('clinicalNoSlotsMatchBrowseFilter')}
          </p>
        ) : null}

        {!anyLoading && selectedTerm != null && filteredSlots.length > 0 ? (
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
                  const isFull = !slotHasSeatForStudent(offered)
                  const isBusy = busyTimetableId === row.timetableId
                  const disabled = isEnrolled || isFull || busyTimetableId != null
                  const palette = BLOCK_PALETTE[slotBlockPalette(offered, isEnrolled)]
                  const bg = palette.bg
                  const border = palette.border
                  const availKey = !isEnrolled ? slotAvailabilityLabelKey(offered) : null
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
                      {availKey != null ? (
                        <span className="admin-timetable-v2__block-meta" style={{ fontWeight: 600 }}>
                          {t(availKey)}
                        </span>
                      ) : null}
                      <span className="admin-timetable-v2__block-meta">
                        {seatSummaryLine(offered, t)}
                      </span>
                      {bucketRemainingLine(offered, t) != null ? (
                        <span className="admin-timetable-v2__block-meta">
                          {bucketRemainingLine(offered, t)}
                        </span>
                      ) : null}
                      <span className="admin-timetable-v2__block-meta">
                        {t('clinicalColRemaining')} (you): {remainingDisplay(offered)}
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
              <div>
                <dt>{t('clinicalModalDtSeatsByLevel')}</dt>
                <dd>{seatSummaryLine(pendingEnrollmentSlot, t)}</dd>
              </div>
              {pendingEnrollmentSlot.studentBookingLevel != null ? (
                <>
                  <div>
                    <dt>{t('clinicalModalDtYourClinicalLevel')}</dt>
                    <dd>{pendingEnrollmentSlot.studentBookingLevel}</dd>
                  </div>
                  <div>
                    <dt>{t('clinicalModalDtYourLevelBucket')}</dt>
                    <dd>
                      {pendingEnrollmentSlot.yourLevelBucketRemaining !== undefined
                        ? String(pendingEnrollmentSlot.yourLevelBucketRemaining)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('clinicalModalDtAllLevelBucket')}</dt>
                    <dd>
                      {pendingEnrollmentSlot.allLevelsBucketRemaining !== undefined
                        ? String(pendingEnrollmentSlot.allLevelsBucketRemaining)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('clinicalModalDtBookingWillUse')}</dt>
                    <dd>{bookingUsesLine(pendingEnrollmentSlot, t)}</dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt>{t('clinicalModalDtCanEnroll')}</dt>
                <dd>
                  {slotHasSeatForStudent(pendingEnrollmentSlot)
                    ? t('clinicalModalCanEnrollYes')
                    : t('clinicalModalCanEnrollNo')}
                </dd>
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
                disabled={
                  busyTimetableId != null || !slotHasSeatForStudent(pendingEnrollmentSlot)
                }
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

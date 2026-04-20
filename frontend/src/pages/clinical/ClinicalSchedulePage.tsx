import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../../context/AccountContext'
import { useLanguage, useStudentPortalT } from '../../LanguageContext'
import type { PortalLocale, StudentPortalKey } from '../../lib/i18n'
import {
  fetchAdminClinicalTimetable,
  fetchStudentClinicalEnrollments,
  fetchStudentClinicalSchedule,
  postStudentClinicalEnrollment,
  type AdminClinicalTimetableSlot,
  type ClinicalScheduleSession,
  type StudentActiveClinicalBookingHold,
  type StudentClinicalEnrollmentRow,
} from '../../lib/api'

function formatScheduleDate(isoYmd: string, locale: PortalLocale): string {
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
  const loc = locale === 'zh' ? 'zh-Hant' : 'en-US'
  return dt.toLocaleDateString(loc, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function dashText(value: string | null | undefined, dash: string): string {
  if (value == null) return dash
  const s = String(value).trim()
  return s === '' ? dash : s
}

type TableRow = {
  key: string
  date: string
  session: string
  site: string
  faculty: string
  statusRaw: string
}

function sessionStatusClass(raw: string): string {
  const s = raw.trim()
  if (s === 'Confirmed') return 'portal-status portal-status--paid'
  if (s === 'Tentative') return 'portal-status portal-status--upcoming'
  return 'portal-status portal-status--pending'
}

function sessionStatusLabel(raw: string, t: (k: StudentPortalKey) => string): string {
  const s = raw.trim()
  if (s === 'Confirmed') return t('clinicalStatusConfirmed')
  if (s === 'Tentative') return t('clinicalStatusTentative')
  if (s === 'Scheduled') return t('clinicalScheduledStatus')
  return s.length > 0 ? s : t('clinicalScheduledStatus')
}

function isTimetableSlotInSchedule(
  slot: AdminClinicalTimetableSlot,
  sessions: ClinicalScheduleSession[],
): boolean {
  const label = slot.slotLabel.trim()
  return sessions.some(
    (s) =>
      s.courseCode.trim().toUpperCase() === 'CLINIC' &&
      (s.sessionName?.trim() ?? '') === label,
  )
}

function formatRemainingHhMmSs(remainingMs: number): string {
  const ms = Math.max(0, remainingMs)
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function activeEnrollmentForTimetable(
  timetableId: number,
  enrollments: StudentClinicalEnrollmentRow[],
): StudentClinicalEnrollmentRow | undefined {
  return enrollments.find(
    (r) =>
      r.timetableId === timetableId &&
      r.status.trim().toLowerCase() === 'enrolled',
  )
}

const ACADEMIC_TERM_ORDER = ['Winter', 'Spring', 'Summer', 'Fall'] as const

function compareTermsAcademic(a: string, b: string): number {
  const at = a.trim()
  const bt = b.trim()
  const ai = ACADEMIC_TERM_ORDER.findIndex(
    (termName) => termName.toLowerCase() === at.toLowerCase(),
  )
  const bi = ACADEMIC_TERM_ORDER.findIndex(
    (termName) => termName.toLowerCase() === bt.toLowerCase(),
  )
  const aKnown = ai >= 0
  const bKnown = bi >= 0
  if (aKnown && bKnown) return ai - bi
  if (aKnown && !bKnown) return -1
  if (!aKnown && bKnown) return 1
  return at.localeCompare(bt, undefined, { sensitivity: 'base' })
}

export function ClinicalSchedulePage() {
  const { locale } = useLanguage()
  const t = useStudentPortalT()
  const dash = t('dashEm')
  const { currentStudentId } = useAccount()
  const [sessions, setSessions] = useState<ClinicalScheduleSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [timetableSlots, setTimetableSlots] = useState<AdminClinicalTimetableSlot[]>(
    [],
  )
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [timetableError, setTimetableError] = useState<string | null>(null)
  const [filterYear, setFilterYear] = useState('')
  const [filterTerm, setFilterTerm] = useState('')
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [enrollments, setEnrollments] = useState<StudentClinicalEnrollmentRow[]>([])
  const [activeClinicalBookingHold, setActiveClinicalBookingHold] =
    useState<StudentActiveClinicalBookingHold | null>(null)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingMessage, setBookingMessage] = useState<string | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [dataReloadKey, setDataReloadKey] = useState(0)
  const [clinicalHoldTickMs, setClinicalHoldTickMs] = useState(() => Date.now())

  const rows = useMemo<TableRow[]>(
    () =>
      sessions.map((s) => ({
        key: String(s.id),
        date: formatScheduleDate(s.sessionDate, locale),
        session: dashText(s.sessionName, dash),
        site: dashText(s.site, dash),
        faculty: dashText(s.faculty, dash),
        statusRaw: s.status.trim() || 'Scheduled',
      })),
    [sessions, locale, dash],
  )

  useEffect(() => {
    const ac = new AbortController()
    setTimetableLoading(true)
    setTimetableError(null)
    ;(async () => {
      try {
        const slots = await fetchAdminClinicalTimetable({ signal: ac.signal })
        if (ac.signal.aborted) return
        setTimetableSlots(slots)
      } catch (e) {
        if (ac.signal.aborted) return
        setTimetableSlots([])
        setTimetableError(
          e instanceof Error
            ? e.message
            : t('couldNotLoadClinicTimetableSlots'),
        )
      } finally {
        if (!ac.signal.aborted) {
          setTimetableLoading(false)
        }
      }
    })()
    return () => ac.abort()
  }, [t])

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setSessions([])
      setEnrollments([])
      setActiveClinicalBookingHold(null)
      setLoading(false)
      setError(null)
      return
    }

    const ac = new AbortController()
    setSessions([])
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const [sess, enrBundle] = await Promise.all([
          fetchStudentClinicalSchedule(id, { signal: ac.signal }),
          fetchStudentClinicalEnrollments(id, { signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setSessions(sess)
        setEnrollments(enrBundle.enrollments)
        setActiveClinicalBookingHold(enrBundle.activeClinicalBookingHold)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setSessions([])
        setEnrollments([])
        setActiveClinicalBookingHold(null)
        setError(
          e instanceof Error ? e.message : t('couldNotLoadClinicSchedule'),
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, dataReloadKey, t])

  const availableTerms = useMemo(() => {
    const seen = new Set<string>()
    for (const s of timetableSlots) {
      const termStr = s.term.trim()
      if (termStr !== '') seen.add(termStr)
    }
    return [...seen].sort(compareTermsAcademic)
  }, [timetableSlots])

  const availableYears = useMemo(() => {
    const seen = new Set<number>()
    for (const s of timetableSlots) {
      if (Number.isFinite(s.year)) seen.add(s.year)
    }
    return [...seen].sort((a, b) => b - a)
  }, [timetableSlots])

  const filteredTimetableSlots = useMemo(() => {
    return timetableSlots.filter((s) => {
      if (filterYear.trim() !== '' && String(s.year) !== filterYear.trim()) {
        return false
      }
      if (filterTerm.trim() !== '' && s.term !== filterTerm.trim()) {
        return false
      }
      return true
    })
  }, [timetableSlots, filterYear, filterTerm])

  const selectedSlot = useMemo(() => {
    const raw = selectedSlotId.trim()
    if (raw === '') return undefined
    const n = Number(raw)
    if (!Number.isFinite(n)) return undefined
    return filteredTimetableSlots.find((s) => s.id === n)
  }, [filteredTimetableSlots, selectedSlotId])

  const selectedActiveEnrollment = selectedSlot
    ? activeEnrollmentForTimetable(selectedSlot.id, enrollments)
    : undefined
  const selectedInSchedule =
    selectedSlot != null && isTimetableSlotInSchedule(selectedSlot, sessions)
  const slotAlreadyBooked =
    selectedSlot != null &&
    (selectedInSchedule || selectedActiveEnrollment != null)

  const clinicalHoldEndMs = activeClinicalBookingHold
    ? new Date(activeClinicalBookingHold.holdExpiresAt).getTime()
    : NaN
  const clinicalHoldRemainingMs = Number.isFinite(clinicalHoldEndMs)
    ? clinicalHoldEndMs - clinicalHoldTickMs
    : 0
  const clinicalHoldExpired =
    activeClinicalBookingHold != null &&
    (!Number.isFinite(clinicalHoldEndMs) || clinicalHoldRemainingMs <= 0)

  useEffect(() => {
    const h = activeClinicalBookingHold
    if (!h) return
    const endMs = new Date(h.holdExpiresAt).getTime()
    if (!Number.isFinite(endMs)) return
    let id: number | null = null
    const tick = () => {
      const now = Date.now()
      setClinicalHoldTickMs(now)
      if (now >= endMs && id != null) {
        window.clearInterval(id)
        id = null
      }
    }
    tick()
    id = window.setInterval(tick, 1000)
    return () => {
      if (id != null) window.clearInterval(id)
    }
  }, [activeClinicalBookingHold?.clinicalEnrollmentId, activeClinicalBookingHold?.holdExpiresAt])

  async function handleBookSlot() {
    const id = currentStudentId?.trim()
    if (!id || !selectedSlot) return
    setBookingSubmitting(true)
    setBookingError(null)
    setBookingMessage(null)
    try {
      const created = await postStudentClinicalEnrollment(id, {
        timetableId: selectedSlot.id,
      })
      const parts = [t('clinicalRequestSubmittedMessage')]
      if (created.billingChargePosted) {
        parts.push(t('clinicalEnrollmentFinanceChargeNote'))
      }
      setBookingMessage(parts.join(' '))
      setDataReloadKey((k) => k + 1)
    } catch (e) {
      setBookingError(
        e instanceof Error ? e.message : t('couldNotSubmitClinicalRequest'),
      )
    } finally {
      setBookingSubmitting(false)
    }
  }

  const id = currentStudentId?.trim()
  const showEmptyAccount = !id
  const sectionLoading = loading && sessions.length === 0 && error === null

  return (
    <main className="portal-page">
      {showEmptyAccount ? (
        <p className="portal-page-lede" role="status">
          {t('clinicalSignInSchedule')}
        </p>
      ) : null}
      {!showEmptyAccount && error ? (
        <p className="portal-page-lede" role="alert">
          {error}
        </p>
      ) : null}
      {!showEmptyAccount && sectionLoading ? (
        <p className="portal-page-lede" aria-live="polite">
          {t('clinicalLoadingScheduleShort')}
        </p>
      ) : null}

      {!showEmptyAccount ? (
        <section
          className="portal-module-panel"
          aria-label={t('clinicalRequestSlotSectionAria')}
          style={{ marginBottom: '1rem' }}
        >
          {timetableLoading ? (
            <p className="portal-page-lede" aria-live="polite">
              {t('clinicalLoadingTimetable')}
            </p>
          ) : null}
          {timetableError ? (
            <p className="portal-page-lede" role="alert">
              {timetableError}
            </p>
          ) : null}
          {!timetableLoading && !timetableError ? (
            <>
              <div
                className="portal-actions"
                style={{
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  gap: '0.5rem 1rem',
                  marginBottom: '0.5rem',
                }}
              >
                <label
                  className="portal-card-note"
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                >
                  <span>{t('term')}</span>
                  <select
                    className="portal-account-ledger__select"
                    value={filterTerm}
                    onChange={(e) => setFilterTerm(e.target.value)}
                    aria-label={t('clinicalFilterTimetableByTermAria')}
                  >
                    <option value="">{t('clinicalAllTerms')}</option>
                    {availableTerms.map((termName) => (
                      <option key={termName} value={termName}>
                        {termName}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  className="portal-card-note"
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                >
                  <span>{t('clinicalColYear')}</span>
                  <select
                    className="portal-account-ledger__select"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    aria-label={t('clinicalFilterTimetableByYearAria')}
                  >
                    <option value="">{t('clinicalAllYears')}</option>
                    {availableYears.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
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
                    minWidth: 'min(100%, 22rem)',
                    flex: '1 1 14rem',
                  }}
                >
                  <span>{t('clinicalWeeklySlot')}</span>
                  <select
                    className="portal-account-ledger__select"
                    value={selectedSlotId}
                    onChange={(e) => setSelectedSlotId(e.target.value)}
                    aria-label={t('clinicalSelectSlotAria')}
                  >
                    <option value="">{t('clinicalSelectSlotPlaceholder')}</option>
                    {filteredTimetableSlots.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.slotLabel} ({s.term} {s.year})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="portal-btn portal-btn--primary"
                  disabled={bookingSubmitting || !selectedSlot || slotAlreadyBooked}
                  onClick={() => void handleBookSlot()}
                >
                  {bookingSubmitting ? t('submitting') : t('clinicalRequestSlot')}
                </button>
              </div>
              <p className="portal-card-note" style={{ margin: '0 0 0.75rem', opacity: 0.85 }}>
                {t('clinicalRequestSlotStaffNote')}
              </p>
            </>
          ) : null}
          {selectedSlot && slotAlreadyBooked ? (
            <p className="portal-page-lede" role="status">
              <span className="portal-status portal-status--paid">{t('clinicalApprovedBadge')}</span>
              {' '}
              {t('clinicalApprovedSlotMessage')}
            </p>
          ) : null}
          {bookingError ? (
            <p className="portal-page-lede" role="alert">
              {bookingError}
            </p>
          ) : null}
          {bookingMessage ? (
            <p className="portal-page-lede" role="status">
              {bookingMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {!showEmptyAccount && activeClinicalBookingHold ? (
        <section
          className="portal-module-panel portal-stack"
          aria-label={t('clinicalPaymentHoldReminderTitle')}
          style={{ marginBottom: '1rem' }}
        >
          <div
            className="portal-registration-form-hint portal-registration-form-hint--warn portal-stack"
            role="status"
            aria-live="polite"
          >
            <strong>
              {clinicalHoldExpired
                ? t('clinicalPaymentHoldExpiredTitle')
                : t('clinicalPaymentHoldReminderTitle')}
            </strong>
            {clinicalHoldExpired ? (
              <p className="portal-inline-note portal-inline-note--flush" style={{ marginTop: '0.35rem' }}>
                {t('clinicalPaymentHoldExpiredBody')}
              </p>
            ) : (
              <>
                <p className="portal-card-note" style={{ margin: '0.5rem 0 0' }}>
                  {activeClinicalBookingHold.slotLabel}
                </p>
                <p className="portal-page-lede" style={{ margin: '0.35rem 0 0' }}>
                  {t('clinicalPaymentHoldDuePrefix')}{' '}
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatRemainingHhMmSs(clinicalHoldRemainingMs)}
                  </span>
                </p>
                <p className="portal-inline-note portal-inline-note--flush" style={{ marginTop: '0.25rem' }}>
                  {t('clinicalPaymentHoldPayInFinancesShort')}
                </p>
                <p className="portal-inline-note portal-inline-note--flush" style={{ marginTop: '0.35rem' }}>
                  {t('clinicalPaymentHoldReminderBody')}
                </p>
              </>
            )}
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              <Link className="portal-link" to="/finances/overview">
                {t('clinicalPaymentHoldFinancesLink')}
              </Link>
            </p>
          </div>
        </section>
      ) : null}

      <section className="portal-module-panel" aria-labelledby="clinic-schedule-table-heading">
        <h3 id="clinic-schedule-table-heading" className="portal-module-panel-heading">
          {t('clinicalUpcomingAssignmentsHeading')}
        </h3>
        <div className="portal-table-wrap">
          <table className="portal-table portal-table--clinical-schedule">
            <thead>
              <tr>
                <th scope="col">{t('date')}</th>
                <th scope="col">{t('clinicalColSession')}</th>
                <th scope="col">{t('clinicalColClinicSite')}</th>
                <th scope="col">{t('clinicalColSupervisingFaculty')}</th>
                <th scope="col">{t('status')}</th>
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
                    <span className={sessionStatusClass(row.statusRaw)}>
                      {sessionStatusLabel(row.statusRaw, t)}
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

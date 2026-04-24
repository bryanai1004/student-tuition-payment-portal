import { useEffect, useMemo, useState } from 'react'
import {
  createAdminClinicalSlot,
  deleteAdminClinicalSlot,
  deleteAdminClinicalSlotEnrollment,
  fetchAcademicTerms,
  fetchAdminClinicalExamRequests,
  fetchAdminInstructors,
  fetchAdminClinicalSlots,
  fetchClinicalOfferedTimetable,
  fetchAdminClinicalSlotRoster,
  postAdminClinicalExamRequestAssign,
  postAdminClinicalSlotAddStudent,
  postAdminClinicalSlotEnrollmentGrade,
  updateAdminClinicalSlot,
  type AcademicTerm,
  type AdminInstructor,
  type AdminClinicalSlot,
  type AdminClinicalSlotRosterRow,
  type ClinicalExamRequestDto,
  type ClinicalOfferedTimetableSlot,
} from '../../lib/api'
import { formatMoney } from '../../lib/formatMoney'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { TimetableWeekGrid } from '../../components/timetable/TimetableWeekGrid'
import { clinicalOfferedSlotsToLayoutRows } from '../../lib/clinicalTimetableAdapter'
import { formatTimeHmsForDisplay } from '../../lib/formatScheduleTime'
import {
  buildPlacedBlocksByDayForLayout,
  STUDENT_REGISTRATION_TIMETABLE_GRID,
  timetableBodyHeightPx,
} from '../../lib/timetableBlockLayout'
import {
  WEEKDAYS_FULL_ORDERED,
  type WeekdayFull,
} from '../../lib/weekdaySchedule'

type AdminClinicalTabId = 'roster' | 'offered-timetable' | 'exam-requests'

type SlotModalMode = 'add' | 'edit' | null

const GRADE_OPTIONS = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'P', 'NP', 'INC'] as const

type ClinicalRosterGradeModalState = {
  timetableId: number
  enrollmentId: number
  studentId: string
  studentName: string
  clinicalCode: string | null
  clinicalBaseCode: string | null
  grade: string
  grade2: string
}

type SlotFormState = {
  academicTermId: string
  weekday: string
  timeFrom: string
  timeTo: string
  slot: string
  selectedInstructorId: string
  cap100: string
  cap200: string
  cap300: string
  cap123: string
}

function emptySlotForm(defaultTermId: string): SlotFormState {
  return {
    academicTermId: defaultTermId,
    weekday: 'Monday',
    timeFrom: '',
    timeTo: '',
    slot: '',
    selectedInstructorId: '',
    cap100: '0',
    cap200: '0',
    cap300: '0',
    cap123: '0',
  }
}

function toTwoDigit(v: number): string {
  return String(v).padStart(2, '0')
}

function normalizeTimeForSelect(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return ''
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return ''
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return ''
  return `${toTwoDigit(hh)}:${toTwoDigit(mm)}`
}

function timeToMinutes(value: string): number | null {
  const m = value.match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function buildHalfHourTimeOptions(startHour: number, endHour: number): string[] {
  const out: string[] = []
  for (let hour = startHour; hour <= endHour; hour += 1) {
    out.push(`${toTwoDigit(hour)}:00`)
    out.push(`${toTwoDigit(hour)}:30`)
  }
  return out
}

function selectedInstructorIdForSlot(
  row: Pick<AdminClinicalSlot, 'instructorId' | 'instructor'>,
  instructors: AdminInstructor[],
): string {
  const currentName = row.instructor.trim()
  if (currentName === '' || currentName.toUpperCase() === 'TBA') return ''
  const currentInstructorId = row.instructorId.trim()
  if (currentInstructorId !== '') {
    const byInstructorId = instructors.find(
      (i) => i.instructorId.trim() === currentInstructorId,
    )
    if (byInstructorId) return String(byInstructorId.id)
  }
  const targetName = currentName.toLowerCase()
  const byName = instructors.find((i) => i.name.trim().toLowerCase() === targetName)
  return byName ? String(byName.id) : ''
}

function slotRowToForm(
  row: AdminClinicalSlot,
  fallbackTermId: string,
  instructors: AdminInstructor[],
): SlotFormState {
  return {
    academicTermId: row.academicTermId ?? fallbackTermId,
    weekday: row.weekday || 'Monday',
    timeFrom: normalizeTimeForSelect(row.timeFrom),
    timeTo: normalizeTimeForSelect(row.timeTo),
    slot: row.slot,
    selectedInstructorId: selectedInstructorIdForSlot(row, instructors),
    cap100: String(row.cap100),
    cap200: String(row.cap200),
    cap300: String(row.cap300),
    cap123: String(row.cap123),
  }
}

function formatClinicalRosterBookedAt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function clinicalSeatBucketBaseCode(seatBucket: AdminClinicalSlotRosterRow['seatBucket']): string | null {
  if (seatBucket === '100') return 'CL111'
  if (seatBucket === '200') return 'CL211'
  if (seatBucket === '300') return 'CL311'
  return null
}

function academicTermDisplayLabel(
  terms: AcademicTerm[] | null,
  termId: string,
): string {
  const id = termId.trim()
  if (id === '') return '—'
  const t = (terms ?? []).find((x) => x.id === id)
  return t ? `${t.term_label} (${t.year} · ${t.term_name})` : '—'
}

function pickLatestAcademicTermId(terms: AcademicTerm[]): string {
  if (terms.length === 0) return ''
  const latest = terms.reduce((best, term) => {
    if (term.sequence_no !== best.sequence_no) {
      return term.sequence_no > best.sequence_no ? term : best
    }
    if (term.year !== best.year) return term.year > best.year ? term : best
    if (term.quarter_index !== best.quarter_index) {
      return term.quarter_index > best.quarter_index ? term : best
    }
    return term.id.localeCompare(best.id) > 0 ? term : best
  }, terms[0]!)
  return latest.id
}

const ADMIN_CLINICAL_GRID = STUDENT_REGISTRATION_TIMETABLE_GRID
const ADMIN_CLINICAL_WEEKDAYS: readonly WeekdayFull[] = WEEKDAYS_FULL_ORDERED.slice(0, 5)

function weekdayLabel(day: WeekdayFull): string {
  return day
}

function timeFromDbForTimeInput(raw: string | null | undefined): string {
  if (!raw || raw.trim() === '') return ''
  return normalizeTimeForSelect(raw.trim()) || ''
}

export function AdminClinicalPage() {
  useAdminAuth()
  const [tab, setTab] = useState<AdminClinicalTabId>('roster')

  const [terms, setTerms] = useState<AcademicTerm[] | null>(null)
  const [slotsTermId, setSlotsTermId] = useState('')
  const [rosterSlots, setRosterSlots] = useState<AdminClinicalSlot[] | null>(null)
  const [rosterSlotsLoading, setRosterSlotsLoading] = useState(false)
  const [rosterSlotsError, setRosterSlotsError] = useState<string | null>(null)
  const [offeredSlots, setOfferedSlots] = useState<ClinicalOfferedTimetableSlot[] | null>(
    null,
  )
  const [offeredSlotsLoading, setOfferedSlotsLoading] = useState(false)
  const [offeredSlotsError, setOfferedSlotsError] = useState<string | null>(null)
  const [slotsReloadKey, setSlotsReloadKey] = useState(0)
  const [slotModalMode, setSlotModalMode] = useState<SlotModalMode>(null)
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null)
  const [slotForm, setSlotForm] = useState<SlotFormState>(() =>
    emptySlotForm(''),
  )
  const [slotFormError, setSlotFormError] = useState<string | null>(null)
  const [slotSaving, setSlotSaving] = useState(false)
  const [deletingSlotId, setDeletingSlotId] = useState<number | null>(null)
  const [slotDeleteFeedback, setSlotDeleteFeedback] = useState<string | null>(null)
  const [slotDeleteError, setSlotDeleteError] = useState<string | null>(null)
  const [instructors, setInstructors] = useState<AdminInstructor[]>([])
  const [instructorsLoading, setInstructorsLoading] = useState(false)
  const [instructorsError, setInstructorsError] = useState<string | null>(null)

  const [rosterSlot, setRosterSlot] = useState<AdminClinicalSlot | null>(null)
  const [rosterRows, setRosterRows] = useState<AdminClinicalSlotRosterRow[] | null>(
    null,
  )
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [rosterRemovingKey, setRosterRemovingKey] = useState<string | null>(null)
  const [rosterAddStudentId, setRosterAddStudentId] = useState('')
  const [rosterAddSeatBucket, setRosterAddSeatBucket] = useState<
    '100' | '200' | '300' | 'ALL' | ''
  >('')
  const [rosterAddBusy, setRosterAddBusy] = useState(false)
  const [rosterAddMessage, setRosterAddMessage] = useState<string | null>(null)
  const [rosterAddError, setRosterAddError] = useState<string | null>(null)
  const [gradeModal, setGradeModal] = useState<ClinicalRosterGradeModalState | null>(null)
  const [gradeSaving, setGradeSaving] = useState(false)
  const [gradeModalError, setGradeModalError] = useState<string | null>(null)

  const [examRows, setExamRows] = useState<ClinicalExamRequestDto[] | null>(null)
  const [examLoading, setExamLoading] = useState(false)
  const [examError, setExamError] = useState<string | null>(null)
  const [examReloadKey, setExamReloadKey] = useState(0)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignRow, setAssignRow] = useState<ClinicalExamRequestDto | null>(null)
  const [assignDate, setAssignDate] = useState('')
  const [assignTime, setAssignTime] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assignStatus, setAssignStatus] = useState('requested')
  const [assignGrade, setAssignGrade] = useState('')
  const [assignTerm, setAssignTerm] = useState('')
  const [assignYear, setAssignYear] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const list = await fetchAcademicTerms({ signal: ac.signal })
        if (ac.signal.aborted) return
        setTerms(list)
        setSlotsTermId((prev) => {
          const current = prev.trim()
          if (current !== '' && list.some((t) => t.id === current)) return prev
          // Default to newest term so Clinical opens with data instead of a blank "Select term" state.
          return pickLatestAcademicTermId(list)
        })
      } catch {
        if (ac.signal.aborted) return
        setTerms([])
      }
    })()
    return () => ac.abort()
  }, [])

  useEffect(() => {
    if (tab !== 'roster') return
    const ac = new AbortController()
    if (slotsTermId.trim() === '') {
      setRosterSlots(null)
      setRosterSlotsError(null)
      setRosterSlotsLoading(false)
      return () => ac.abort()
    }
    setRosterSlotsLoading(true)
    setRosterSlotsError(null)
    ;(async () => {
      try {
        const list = await fetchAdminClinicalSlots({
          academicTermId: slotsTermId.trim(),
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setRosterSlots(list)
        setRosterSlotsError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRosterSlots(null)
        setRosterSlotsError(
          e instanceof Error ? e.message : 'Could not load clinical slots.',
        )
      } finally {
        if (!ac.signal.aborted) setRosterSlotsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [tab, slotsTermId, slotsReloadKey])

  useEffect(() => {
    if (tab !== 'offered-timetable') return
    const ac = new AbortController()
    if (slotsTermId.trim() === '') {
      setOfferedSlots(null)
      setOfferedSlotsError(null)
      setOfferedSlotsLoading(false)
      return () => ac.abort()
    }
    const termMeta = (terms ?? []).find((t) => t.id === slotsTermId.trim())
    if (!termMeta) {
      if (terms != null) {
        setOfferedSlots(null)
        setOfferedSlotsError(
          terms.length === 0
            ? null
            : 'Could not resolve the selected academic term.',
        )
        setOfferedSlotsLoading(false)
      }
      return () => ac.abort()
    }
    setOfferedSlotsLoading(true)
    setOfferedSlotsError(null)
    ;(async () => {
      try {
        const list = await fetchClinicalOfferedTimetable({
          term: termMeta.term_name,
          year: termMeta.year,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setOfferedSlots(list)
        setOfferedSlotsError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setOfferedSlots(null)
        setOfferedSlotsError(
          e instanceof Error ? e.message : 'Could not load offered timetable.',
        )
      } finally {
        if (!ac.signal.aborted) setOfferedSlotsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [tab, slotsTermId, slotsReloadKey, terms])

  useEffect(() => {
    if (rosterSlot == null) {
      setRosterRows(null)
      setRosterError(null)
      setRosterLoading(false)
      setRosterAddStudentId('')
      setRosterAddSeatBucket('')
      setRosterAddBusy(false)
      setRosterAddMessage(null)
      setRosterAddError(null)
      setGradeModal(null)
      setGradeModalError(null)
      setGradeSaving(false)
      return
    }
    const ac = new AbortController()
    setRosterLoading(true)
    setRosterError(null)
    setRosterRows(null)
    ;(async () => {
      try {
        const list = await fetchAdminClinicalSlotRoster(rosterSlot.id, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setRosterRows(list)
        setRosterError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRosterRows(null)
        setRosterError(
          e instanceof Error ? e.message : 'Could not load slot roster.',
        )
      } finally {
        if (!ac.signal.aborted) setRosterLoading(false)
      }
    })()
    return () => ac.abort()
  }, [rosterSlot])

  useEffect(() => {
    if (tab !== 'exam-requests') return
    const ac = new AbortController()
    setExamLoading(true)
    setExamError(null)
    ;(async () => {
      try {
        const list = await fetchAdminClinicalExamRequests({ signal: ac.signal })
        if (ac.signal.aborted) return
        setExamRows(list)
      } catch (e) {
        if (ac.signal.aborted) return
        setExamRows(null)
        setExamError(
          e instanceof Error ? e.message : 'Could not load clinical exam requests.',
        )
      } finally {
        if (!ac.signal.aborted) setExamLoading(false)
      }
    })()
    return () => ac.abort()
  }, [tab, examReloadKey])

  useEffect(() => {
    if (slotModalMode == null) return
    const ac = new AbortController()
    setInstructorsLoading(true)
    setInstructorsError(null)
    ;(async () => {
      try {
        const list = await fetchAdminInstructors({ signal: ac.signal })
        if (ac.signal.aborted) return
        setInstructors(list)
        setInstructorsError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setInstructors([])
        setInstructorsError(
          e instanceof Error ? e.message : 'Could not load instructors.',
        )
      } finally {
        if (!ac.signal.aborted) setInstructorsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [slotModalMode])

  useEffect(() => {
    if (slotModalMode !== 'edit') return
    if (editingSlotId == null) return
    if (instructors.length === 0) return
    if (slotForm.selectedInstructorId.trim() !== '') return
    const editingSlot = (rosterSlots ?? []).find((s) => s.id === editingSlotId)
    if (!editingSlot) return
    const matchedId = selectedInstructorIdForSlot(editingSlot, instructors)
    if (matchedId === '') return
    setSlotForm((f) => ({ ...f, selectedInstructorId: matchedId }))
  }, [slotModalMode, editingSlotId, instructors, rosterSlots, slotForm.selectedInstructorId])

  const rosterTermLabel = academicTermDisplayLabel(terms, slotsTermId)
  const termsLoading = terms == null
  const hasTerms = (terms?.length ?? 0) > 0
  const baseTimeOptions = buildHalfHourTimeOptions(7, 20)
  const allTimeOptions = Array.from(
    new Set(
      [slotForm.timeFrom, slotForm.timeTo]
        .map((x) => normalizeTimeForSelect(x))
        .filter((x) => x !== '')
        .concat(baseTimeOptions),
    ),
  ).sort((a, b) => {
    const aa = timeToMinutes(a) ?? Number.MAX_SAFE_INTEGER
    const bb = timeToMinutes(b) ?? Number.MAX_SAFE_INTEGER
    return aa - bb
  })
  const offeredTimetableRows = useMemo(
    () => clinicalOfferedSlotsToLayoutRows(offeredSlots ?? []),
    [offeredSlots],
  )
  const offeredPlacedWeekdays = useMemo(
    () => buildPlacedBlocksByDayForLayout(offeredTimetableRows, ADMIN_CLINICAL_GRID),
    [offeredTimetableRows],
  )
  const hourRows = useMemo(() => {
    const sh = ADMIN_CLINICAL_GRID.startHour ?? 8
    const eh = ADMIN_CLINICAL_GRID.endHour ?? 21
    return Array.from({ length: eh - sh + 1 }, (_, i) => sh + i)
  }, [])
  const timetableHeightPx = timetableBodyHeightPx(ADMIN_CLINICAL_GRID)
  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">Clinical</h1>
      </div>

      <div
        className="portal-tab-group admin-courses-tablist"
        role="tablist"
        aria-label="Clinical views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'roster'}
          className={['portal-tab', tab === 'roster' ? 'portal-tab--active' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('roster')}
        >
          Clinical Roster
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'offered-timetable'}
          className={[
            'portal-tab',
            tab === 'offered-timetable' ? 'portal-tab--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('offered-timetable')}
        >
          Offered Timetable
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'exam-requests'}
          className={[
            'portal-tab',
            tab === 'exam-requests' ? 'portal-tab--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('exam-requests')}
        >
          Exam Requests
        </button>
      </div>

      {tab === 'roster' || tab === 'offered-timetable' ? (
      <div className="admin-page__toolbar">
        <div className="admin-page__toolbar-actions" style={{ width: '100%' }}>
          <label
            htmlFor="admin-clinical-term-filter"
            className="portal-card-note"
            style={{
              marginRight: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}
          >
            Academic term
            <select
              id="admin-clinical-term-filter"
              className="admin-input"
              style={{ minWidth: '14rem' }}
              value={slotsTermId}
              onChange={(e) => setSlotsTermId(e.target.value)}
            >
              <option value="">Select term…</option>
              {(terms ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.term_label} ({t.year} · {t.term_name})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="portal-btn portal-btn--primary"
            disabled={slotsTermId.trim() === ''}
            onClick={() => {
              setEditingSlotId(null)
              setSlotForm(emptySlotForm(slotsTermId.trim()))
              setSlotFormError(null)
              setSlotModalMode('add')
            }}
          >
            Create Slot
          </button>
        </div>
      </div>
      ) : null}

      {tab === 'roster' ? (
        <>
          {!termsLoading && !hasTerms ? (
            <p className="portal-card-note" style={{ marginTop: '0.75rem' }}>
              No academic terms are available yet.
            </p>
          ) : null}

          {slotsTermId.trim() !== '' && rosterSlotsLoading && rosterSlots === null ? (
            <section
              className="portal-card portal-profile-state"
              aria-busy="true"
              aria-live="polite"
            >
              <p className="portal-profile-state__title">Loading slots</p>
              <p className="portal-profile-state__detail">
                Fetching clinical timetable rows for the selected term.
              </p>
            </section>
          ) : null}

          {slotsTermId.trim() !== '' && rosterSlotsError ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
            >
              <p className="portal-profile-state__title">Could not load slots</p>
              <p className="portal-profile-state__detail">{rosterSlotsError}</p>
              <div className="portal-actions portal-profile-state__actions">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  onClick={() => setSlotsReloadKey((k) => k + 1)}
                >
                  Try again
                </button>
              </div>
            </section>
          ) : null}

          {slotsTermId.trim() !== '' &&
          !rosterSlotsLoading &&
          !rosterSlotsError &&
          rosterSlots != null ? (
            <div className="portal-table-wrap admin-table-wrap">
              <table className="portal-table portal-data-table admin-students-table--center">
                <thead>
                  <tr>
                    <th scope="col">Academic term</th>
                    <th scope="col">Day</th>
                    <th scope="col">Time From</th>
                    <th scope="col">Time To</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Instructor</th>
                    <th scope="col">100 (enrolled / cap)</th>
                    <th scope="col">200 (enrolled / cap)</th>
                    <th scope="col">300 (enrolled / cap)</th>
                    <th scope="col">All (enrolled / cap)</th>
                    <th scope="col">Active enrolled</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterSlots.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="portal-card-note">
                        No clinical slots for this term yet.
                      </td>
                    </tr>
                  ) : (
                    rosterSlots.map((s) => {
                      const busy = deletingSlotId === s.id
                      return (
                        <tr key={s.id}>
                          <td>{rosterTermLabel}</td>
                          <td>{s.weekday || '—'}</td>
                          <td>{s.timeFrom || '—'}</td>
                          <td>{s.timeTo || '—'}</td>
                          <td>{s.slot}</td>
                          <td
                            style={{
                              maxWidth: '12rem',
                              textAlign: 'left',
                              whiteSpace: 'normal',
                            }}
                          >
                            {s.instructor || '—'}
                          </td>
                          <td>
                            {s.enrolled100} / {s.cap100}
                          </td>
                          <td>
                            {s.enrolled200} / {s.cap200}
                          </td>
                          <td>
                            {s.enrolled300} / {s.cap300}
                          </td>
                          <td>
                            {s.enrolledAll} / {s.cap123}
                          </td>
                          <td>{s.activeEnrolledCount}</td>
                          <td>
                            <div
                              className="portal-actions"
                              style={{
                                flexWrap: 'wrap',
                                gap: '0.35rem',
                                justifyContent: 'flex-end',
                              }}
                            >
                              <button
                                type="button"
                                className="portal-btn portal-btn--secondary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.8125rem',
                                }}
                                disabled={busy}
                                onClick={() => {
                                  setRosterSlot(s)
                                }}
                              >
                                View Roster
                              </button>
                              <button
                                type="button"
                                className="portal-btn portal-btn--secondary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.8125rem',
                                }}
                                disabled={busy}
                                onClick={() => {
                                  setEditingSlotId(s.id)
                                  setSlotForm(
                                    slotRowToForm(s, slotsTermId.trim(), instructors),
                                  )
                                  setSlotFormError(null)
                                  setSlotModalMode('edit')
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="portal-btn portal-btn--secondary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.8125rem',
                                }}
                                disabled={busy}
                                onClick={() => {
                                  setSlotDeleteFeedback(null)
                                  setSlotDeleteError(null)
                                  const actionName = 'Delete this slot?'
                                  const actionDetail =
                                    'This will permanently remove the slot and all related clinical enrollments, requests, and assignments. This action cannot be undone.'
                                  if (
                                    !window.confirm(
                                      `${actionName}\n\n${actionDetail}`,
                                    )
                                  ) {
                                    return
                                  }
                                  setDeletingSlotId(s.id)
                                  ;(async () => {
                                    try {
                                      // Admin Clinical slot management intentionally uses backend force-delete.
                                      await deleteAdminClinicalSlot(s.id, {
                                        forceDelete: true,
                                      })
                                      setSlotsReloadKey((k) => k + 1)
                                      setSlotDeleteError(null)
                                      setSlotDeleteFeedback(
                                        'Slot deleted successfully.',
                                      )
                                    } catch (e) {
                                      setSlotDeleteError(
                                        e instanceof Error
                                          ? e.message
                                          : 'Delete failed.',
                                      )
                                    } finally {
                                      setDeletingSlotId(null)
                                    }
                                  })()
                                }}
                              >
                                {busy ? '…' : 'Delete'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
          {slotDeleteFeedback ? (
            <p className="portal-card-note" role="status" style={{ marginTop: '0.75rem' }}>
              {slotDeleteFeedback}
            </p>
          ) : null}
          {slotDeleteError ? (
            <p className="portal-page-lede" role="alert" style={{ marginTop: '0.75rem' }}>
              {slotDeleteError}
            </p>
          ) : null}

          {slotModalMode != null ? (
            <div
              className="admin-section-detail-backdrop"
              role="presentation"
              onMouseDown={(ev) => {
                if (ev.target === ev.currentTarget && !slotSaving) {
                  setSlotModalMode(null)
                  setEditingSlotId(null)
                  setSlotFormError(null)
                }
              }}
            >
              <div
                className="admin-section-detail-modal admin-section-detail-modal--form-wide"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-clinical-slot-modal-title"
              >
                <h2
                  id="admin-clinical-slot-modal-title"
                  className="admin-section-detail-modal__title"
                >
                  {slotModalMode === 'add' ? 'Create clinical slot' : 'Edit clinical slot'}
                </h2>
                <p className="admin-section-detail-modal__meta">
                  Slots are stored in the legacy clinic timetable. Select instructor
                  and 24-hour time values from dropdowns.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setSlotFormError(null)
                    const termId = slotForm.academicTermId.trim()
                    if (!termId) {
                      setSlotFormError('Select an academic term.')
                      return
                    }
                    if (!slotForm.weekday.trim()) {
                      setSlotFormError('Select a day.')
                      return
                    }
                    if (!slotForm.timeFrom.trim() || !slotForm.timeTo.trim()) {
                      setSlotFormError('Select time from and time to.')
                      return
                    }
                    if (!slotForm.slot.trim()) {
                      setSlotFormError('Slot is required.')
                      return
                    }
                    const capDefs = [
                      { key: 'cap100' as const, label: '100 level cap' },
                      { key: 'cap200' as const, label: '200 level cap' },
                      { key: 'cap300' as const, label: '300 level cap' },
                      { key: 'cap123' as const, label: 'All levels cap' },
                    ]
                    const caps: {
                      cap100: number
                      cap200: number
                      cap300: number
                      cap123: number
                    } = { cap100: 0, cap200: 0, cap300: 0, cap123: 0 }
                    for (const { key, label } of capDefs) {
                      const raw = slotForm[key].trim()
                      if (raw === '') {
                        caps[key] = 0
                        continue
                      }
                      if (!/^\d+$/.test(raw)) {
                        setSlotFormError(`${label} must be a non-negative integer.`)
                        return
                      }
                      const n = Number(raw)
                      if (!Number.isFinite(n) || n > 2147483647) {
                        setSlotFormError(`${label} must be a non-negative integer.`)
                        return
                      }
                      caps[key] = n
                    }

                    const from = normalizeTimeForSelect(slotForm.timeFrom)
                    const to = normalizeTimeForSelect(slotForm.timeTo)
                    const fromMinutes = timeToMinutes(from)
                    const toMinutes = timeToMinutes(to)
                    if (fromMinutes == null || toMinutes == null) {
                      setSlotFormError('Select valid start and end times.')
                      return
                    }
                    if (toMinutes <= fromMinutes) {
                      setSlotFormError('Time to must be later than time from.')
                      return
                    }

                    const selectedInstructor = instructors.find(
                      (i) => String(i.id) === slotForm.selectedInstructorId.trim(),
                    )
                    const instructor = selectedInstructor?.name ?? 'TBA'
                    const instructorId = selectedInstructor?.instructorId ?? ''

                    setSlotSaving(true)
                    ;(async () => {
                      try {
                        if (slotModalMode === 'add') {
                          await createAdminClinicalSlot({
                            academicTermId: termId,
                            weekday: slotForm.weekday.trim(),
                            timeFrom: from,
                            timeTo: to,
                            slot: slotForm.slot.trim(),
                            instructor,
                            instructorId,
                            cap100: caps.cap100,
                            cap200: caps.cap200,
                            cap300: caps.cap300,
                            cap123: caps.cap123,
                          })
                        } else if (
                          slotModalMode === 'edit' &&
                          editingSlotId != null
                        ) {
                          await updateAdminClinicalSlot(editingSlotId, {
                            academicTermId: termId,
                            weekday: slotForm.weekday.trim(),
                            timeFrom: from,
                            timeTo: to,
                            slot: slotForm.slot.trim(),
                            instructor,
                            instructorId,
                            cap100: caps.cap100,
                            cap200: caps.cap200,
                            cap300: caps.cap300,
                            cap123: caps.cap123,
                          })
                        }
                        setSlotsReloadKey((k) => k + 1)
                        setSlotModalMode(null)
                        setEditingSlotId(null)
                        setSlotFormError(null)
                      } catch (err) {
                        setSlotFormError(
                          err instanceof Error ? err.message : 'Save failed.',
                        )
                      } finally {
                        setSlotSaving(false)
                      }
                    })()
                  }}
                >
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-term">Academic term</label>
                    <select
                      id="admin-clinical-slot-term"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                      value={slotForm.academicTermId}
                      onChange={(e) =>
                        setSlotForm((f) => ({
                          ...f,
                          academicTermId: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select…</option>
                      {(terms ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.term_label} ({t.year} · {t.term_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-day">Day</label>
                    <select
                      id="admin-clinical-slot-day"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                      value={slotForm.weekday}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, weekday: e.target.value }))
                      }
                    >
                      {WEEKDAYS_FULL_ORDERED.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-from">Time from</label>
                    <select
                      id="admin-clinical-slot-from"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                      value={slotForm.timeFrom}
                      onChange={(e) =>
                        setSlotForm((f) => ({
                          ...f,
                          timeFrom: normalizeTimeForSelect(e.target.value),
                        }))
                      }
                    >
                      <option value="">Select…</option>
                      {allTimeOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-to">Time to</label>
                    <select
                      id="admin-clinical-slot-to"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                      value={slotForm.timeTo}
                      onChange={(e) =>
                        setSlotForm((f) => ({
                          ...f,
                          timeTo: normalizeTimeForSelect(e.target.value),
                        }))
                      }
                    >
                      <option value="">Select…</option>
                      {allTimeOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-num">Slot</label>
                    <input
                      id="admin-clinical-slot-num"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      required
                      value={slotForm.slot}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, slot: e.target.value }))
                      }
                    />
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-instr">Instructor</label>
                    <select
                      id="admin-clinical-slot-instr"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={slotForm.selectedInstructorId}
                      disabled={instructorsLoading}
                      onChange={(e) =>
                        setSlotForm((f) => ({
                          ...f,
                          selectedInstructorId: e.target.value,
                        }))
                      }
                    >
                      <option value="">TBA</option>
                      {instructors.map((i) => (
                        <option key={i.id} value={String(i.id)}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    {instructorsError ? (
                      <p className="portal-page-lede" role="alert">
                        {instructorsError}
                      </p>
                    ) : null}
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-cap100">100 level slot</label>
                    <input
                      id="admin-clinical-cap100"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      inputMode="numeric"
                      value={slotForm.cap100}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, cap100: e.target.value }))
                      }
                    />
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-cap200">200 level slot</label>
                    <input
                      id="admin-clinical-cap200"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      inputMode="numeric"
                      value={slotForm.cap200}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, cap200: e.target.value }))
                      }
                    />
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-cap300">300 level slot</label>
                    <input
                      id="admin-clinical-cap300"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      inputMode="numeric"
                      value={slotForm.cap300}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, cap300: e.target.value }))
                      }
                    />
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-cap123">All levels</label>
                    <input
                      id="admin-clinical-cap123"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      inputMode="numeric"
                      value={slotForm.cap123}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, cap123: e.target.value }))
                      }
                    />
                  </div>

                  {slotFormError ? (
                    <p className="portal-page-lede" role="alert">
                      {slotFormError}
                    </p>
                  ) : null}

                  <div
                    className="portal-actions"
                    style={{ marginTop: '1rem', justifyContent: 'flex-end' }}
                  >
                    <button
                      type="button"
                      className="portal-btn portal-btn--secondary"
                      disabled={slotSaving}
                      onClick={() => {
                        if (slotSaving) return
                        setSlotModalMode(null)
                        setEditingSlotId(null)
                        setSlotFormError(null)
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="portal-btn portal-btn--primary"
                      disabled={slotSaving}
                    >
                      {slotSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === 'offered-timetable' ? (
        <section
          className="portal-card portal-stack portal-clinical-offered-timetable portal-clinical-offered-timetable--embedded"
          aria-labelledby="admin-clinical-offered-timetable-heading"
        >
          <h2
            id="admin-clinical-offered-timetable-heading"
            className="portal-section-heading"
          >
            Offered Timetable
          </h2>
          <p className="portal-text-muted" style={{ marginTop: 0 }}>
            Weekly clinical slots for the selected term.
          </p>

          {!termsLoading && !hasTerms ? (
            <p className="portal-text-muted" role="status">
              No academic terms are available yet.
            </p>
          ) : null}

          {slotsTermId.trim() === '' ? (
            <p className="portal-text-muted" role="status">
              Select an academic term to view the timetable.
            </p>
          ) : null}

          {slotsTermId.trim() !== '' && terms == null ? (
            <p className="portal-text-muted" role="status">
              Loading academic terms…
            </p>
          ) : null}

          {slotsTermId.trim() !== '' &&
          terms != null &&
          offeredSlotsLoading &&
          offeredSlots === null ? (
            <p className="portal-text-muted" role="status">
              Loading offered timetable…
            </p>
          ) : null}

          {slotsTermId.trim() !== '' && offeredSlotsError ? (
            <p className="portal-text-muted" role="alert">
              {offeredSlotsError}
            </p>
          ) : null}

          {slotsTermId.trim() !== '' &&
          terms != null &&
          !offeredSlotsLoading &&
          !offeredSlotsError &&
          offeredSlots != null ? (
            offeredTimetableRows.length === 0 ? (
              <p className="portal-text-muted" role="status">
                No clinical slots for this term yet.
              </p>
            ) : (
              <div className="portal-clinical-offered-timetable__scroll">
                <div className="admin-timetable-wrap portal-clinical-offered-timetable__inner">
                  <TimetableWeekGrid
                    rootClassName="portal-clinical-offered-timetable__grid"
                    weekdays={ADMIN_CLINICAL_WEEKDAYS}
                    placedWeekdays={offeredPlacedWeekdays}
                    hourRows={hourRows}
                    bodyHeightPx={timetableHeightPx}
                    weekdayLabel={weekdayLabel}
                    hourLabel={(h) => formatTimeHmsForDisplay(`${h}:00:00`)}
                    renderBlock={(b, d) => {
                      const row = b.source
                      const colW = 100 / b.colCount
                      const insetPx = 3
                      return (
                        <div
                          key={`${row.timetableId}-${d}-${b.startMin}-${b.colIndex}`}
                          className="admin-timetable-v2__block portal-clinical-offered-timetable__block"
                          style={{
                            top: b.topPx,
                            height: b.heightPx,
                            left: `calc(${colW * b.colIndex}% + ${insetPx}px)`,
                            width: `calc(${colW}% - ${insetPx * 2}px)`,
                            cursor: 'default',
                          }}
                        >
                          <span className="admin-timetable-v2__block-title">
                            {row.clinicDisplayName}
                          </span>
                          <span className="admin-timetable-v2__block-meta">
                            {formatTimeHmsForDisplay(row.start_time)} -{' '}
                            {formatTimeHmsForDisplay(row.end_time)}
                          </span>
                          {row.facultyDisplay ? (
                            <span className="admin-timetable-v2__block-meta">
                              {row.facultyDisplay}
                            </span>
                          ) : null}
                          {row.seatsDisplay ? (
                            <span className="admin-timetable-v2__block-meta">
                              {row.seatsDisplay}
                            </span>
                          ) : null}
                        </div>
                      )
                    }}
                  />
                </div>
              </div>
            )
          ) : null}
        </section>
      ) : null}

      {tab === 'exam-requests' ? (
        <section className="portal-stack" style={{ marginTop: '0.75rem' }}>
          <p className="portal-text-muted" style={{ marginTop: 0 }}>
            Student exam registrations and fees. Assign or update the exam date after
            coordinating with the student.
          </p>
          {examLoading && examRows === null ? (
            <p className="portal-card-note" aria-live="polite">
              Loading exam requests…
            </p>
          ) : null}
          {examError ? (
            <p className="portal-page-lede" role="alert">
              {examError}
            </p>
          ) : null}
          {!examLoading && examRows != null && examRows.length === 0 ? (
            <p className="portal-card-note">No clinical exam requests yet.</p>
          ) : null}
          {examRows != null && examRows.length > 0 ? (
            <div className="portal-table-wrap admin-table-wrap">
              <table className="portal-table portal-data-table admin-students-table--center">
                <thead>
                  <tr>
                    <th scope="col">Student ID</th>
                    <th scope="col">Student Name</th>
                    <th scope="col">Exam</th>
                    <th scope="col">Term</th>
                    <th scope="col">Status</th>
                    <th scope="col">Requested at</th>
                    <th scope="col">Assigned date</th>
                    <th scope="col">Fee</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {examRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.studentId}</td>
                      <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>
                        {r.studentName ?? '—'}
                      </td>
                      <td style={{ textAlign: 'left', whiteSpace: 'normal' }}>
                        {r.examCode} — {r.examName}
                      </td>
                      <td>
                        {r.term} {r.year}
                      </td>
                      <td>{r.status}</td>
                      <td>{formatClinicalRosterBookedAt(r.createdAt)}</td>
                      <td>
                        {r.assignedExamDate
                          ? `${r.assignedExamDate}${r.assignedExamTime ? ` · ${r.assignedExamTime}` : ''}`
                          : '—'}
                      </td>
                      <td>{formatMoney(r.registrationFeeUsd)}</td>
                      <td>
                        <div
                          className="portal-actions"
                          style={{ gap: '0.35rem', justifyContent: 'flex-end' }}
                        >
                          <button
                            type="button"
                            className="portal-btn portal-btn--secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8125rem' }}
                            onClick={() => {
                              setAssignRow(r)
                              setAssignDate((r.assignedExamDate ?? '').slice(0, 10))
                              setAssignTime(timeFromDbForTimeInput(r.assignedExamTime))
                              setAssignNotes(r.notes ?? '')
                              setAssignStatus(r.status)
                              setAssignGrade('')
                              setAssignTerm(r.term)
                              setAssignYear(String(r.year))
                              setAssignError(null)
                              setAssignOpen(true)
                            }}
                          >
                            Update Request
                          </button>
                          <button
                            type="button"
                            className="portal-btn portal-btn--secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8125rem' }}
                            disabled={r.status.trim().toLowerCase() === 'cancelled'}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Cancel exam request for ${r.studentId} (${r.examCode})? This will also void the linked $50 exam fee.`,
                                )
                              ) {
                                return
                              }
                              void (async () => {
                                try {
                                  await postAdminClinicalExamRequestAssign(r.id, {
                                    status: 'cancelled',
                                    term: r.term,
                                    year: r.year,
                                  })
                                  setExamReloadKey((k) => k + 1)
                                } catch (err) {
                                  window.alert(
                                    err instanceof Error ? err.message : 'Could not cancel request.',
                                  )
                                }
                              })()
                            }}
                          >
                            Cancel Request
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {assignOpen && assignRow != null ? (
        <div
          className="admin-section-detail-backdrop"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget && !assignSaving) {
              setAssignOpen(false)
              setAssignRow(null)
            }
          }}
        >
          <div
            className="admin-section-detail-modal admin-section-detail-modal--form-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-clinical-exam-assign-title"
          >
            <h2
              id="admin-clinical-exam-assign-title"
              className="admin-section-detail-modal__title"
            >
              Update exam request
            </h2>
            <p className="admin-section-detail-modal__meta">
              {assignRow.studentId}
              {assignRow.studentName ? ` · ${assignRow.studentName}` : ''} ·{' '}
              {assignRow.examCode} — {assignRow.examName} · {assignRow.term}{' '}
              {assignRow.year}
            </p>
            {assignError ? (
              <p className="portal-page-lede" role="alert">
                {assignError}
              </p>
            ) : null}
            <form
              className="portal-stack"
              style={{ marginTop: '0.75rem' }}
              onSubmit={(e) => {
                e.preventDefault()
                setAssignError(null)
                void (async () => {
                  setAssignSaving(true)
                  try {
                    await postAdminClinicalExamRequestAssign(assignRow.id, {
                      assignedExamDate: assignDate.trim() === '' ? null : assignDate.trim(),
                      assignedExamTime: assignTime.trim() === '' ? null : assignTime.trim(),
                      notes: assignNotes,
                      status: assignStatus,
                      grade: assignGrade,
                      term: assignTerm,
                      year: Number(assignYear),
                    })
                    setExamReloadKey((k) => k + 1)
                    setAssignOpen(false)
                    setAssignRow(null)
                  } catch (err) {
                    setAssignError(
                      err instanceof Error ? err.message : 'Could not save assignment.',
                    )
                  } finally {
                    setAssignSaving(false)
                  }
                })()
              }}
            >
              <div className="portal-field-stack">
                <label className="portal-label" htmlFor="admin-exam-assign-date">
                  Assigned date
                </label>
                <input
                  id="admin-exam-assign-date"
                  className="portal-input"
                  type="date"
                  value={assignDate}
                  onChange={(ev) => setAssignDate(ev.target.value)}
                />
              </div>
              <div className="portal-field-stack">
                <label className="portal-label" htmlFor="admin-exam-assign-time">
                  Assigned time
                </label>
                <input
                  id="admin-exam-assign-time"
                  className="portal-input"
                  type="time"
                  value={assignTime}
                  onChange={(ev) => setAssignTime(ev.target.value)}
                />
              </div>
              <div className="portal-field-stack">
                <label className="portal-label" htmlFor="admin-exam-assign-status">
                  Status
                </label>
                <select
                  id="admin-exam-assign-status"
                  className="portal-input"
                  value={assignStatus}
                  onChange={(ev) => setAssignStatus(ev.target.value)}
                >
                  <option value="requested">requested</option>
                  <option value="scheduled">scheduled</option>
                  <option value="completed">completed</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </div>
              <div className="portal-field-stack">
                <label className="portal-label" htmlFor="admin-exam-assign-grade">
                  Grade
                </label>
                <select
                  id="admin-exam-assign-grade"
                  className="portal-input"
                  value={assignGrade}
                  onChange={(ev) => setAssignGrade(ev.target.value)}
                >
                  <option value="">(blank)</option>
                  <option value="P">P</option>
                  <option value="F">F</option>
                </select>
              </div>
              <div className="portal-field-stack">
                <label className="portal-label" htmlFor="admin-exam-assign-term">
                  Term
                </label>
                <input
                  id="admin-exam-assign-term"
                  className="portal-input"
                  value={assignTerm}
                  onChange={(ev) => setAssignTerm(ev.target.value)}
                />
              </div>
              <div className="portal-field-stack">
                <label className="portal-label" htmlFor="admin-exam-assign-year">
                  Year
                </label>
                <input
                  id="admin-exam-assign-year"
                  className="portal-input"
                  inputMode="numeric"
                  value={assignYear}
                  onChange={(ev) => setAssignYear(ev.target.value)}
                />
              </div>
              <div className="portal-field-stack">
                <label className="portal-label" htmlFor="admin-exam-assign-notes">
                  Notes
                </label>
                <textarea
                  id="admin-exam-assign-notes"
                  className="portal-input"
                  rows={3}
                  value={assignNotes}
                  onChange={(ev) => setAssignNotes(ev.target.value)}
                />
              </div>
              <div
                className="portal-actions"
                style={{ marginTop: '1rem', justifyContent: 'flex-end' }}
              >
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  disabled={assignSaving}
                  onClick={() => {
                    if (assignSaving) return
                    setAssignOpen(false)
                    setAssignRow(null)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="portal-btn portal-btn--primary" disabled={assignSaving}>
                  {assignSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {rosterSlot != null ? (
        <div
          className="admin-section-detail-backdrop"
          role="presentation"
          onMouseDown={(ev) => {
            if (
              ev.target === ev.currentTarget &&
              rosterRemovingKey == null &&
              gradeModal == null &&
              !gradeSaving
            ) {
              setRosterSlot(null)
            }
          }}
        >
          <div
            className="admin-section-detail-modal admin-section-detail-modal--form-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-clinical-slot-roster-title"
          >
            <h2
              id="admin-clinical-slot-roster-title"
              className="admin-section-detail-modal__title"
            >
              Slot roster
            </h2>
            <p className="admin-section-detail-modal__meta">
              Slot #{rosterSlot.id} · {rosterSlot.weekday}{' '}
              {rosterSlot.timeFrom}–{rosterSlot.timeTo} · {rosterSlot.slot}
              {rosterSlot.instructor ? ` · ${rosterSlot.instructor}` : ''}
            </p>
            {rosterLoading && rosterRows === null ? (
              <p className="portal-card-note" aria-live="polite">
                Loading roster…
              </p>
            ) : null}
            {rosterError ? (
              <p className="portal-page-lede" role="alert">
                {rosterError}
              </p>
            ) : null}
            <div
              className="portal-course-feedback-modal__field"
              style={{ marginTop: '0.75rem' }}
            >
              <label htmlFor="admin-clinical-roster-add-student-id">
                Add student by ID
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  id="admin-clinical-roster-add-student-id"
                  className="admin-input"
                  style={{ minWidth: '16rem' }}
                  placeholder="Student ID, e.g. E26103"
                  value={rosterAddStudentId}
                  disabled={rosterAddBusy}
                  onChange={(e) => {
                    setRosterAddStudentId(e.target.value)
                    setRosterAddMessage(null)
                    setRosterAddError(null)
                  }}
                />
                <select
                  aria-label="Seat bucket"
                  className="admin-input"
                  value={rosterAddSeatBucket}
                  disabled={rosterAddBusy}
                  onChange={(e) => {
                    const value = e.target.value
                    if (
                      value === '' ||
                      value === '100' ||
                      value === '200' ||
                      value === '300' ||
                      value === 'ALL'
                    ) {
                      setRosterAddSeatBucket(value)
                      setRosterAddMessage(null)
                      setRosterAddError(null)
                    }
                  }}
                >
                  <option value="">Auto bucket</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="300">300</option>
                  <option value="ALL">ALL</option>
                </select>
                <button
                  type="button"
                  className="portal-btn portal-btn--primary"
                  disabled={rosterAddBusy}
                  onClick={() => {
                    const normalizedStudentId = rosterAddStudentId.trim().toUpperCase()
                    if (normalizedStudentId === '') {
                      setRosterAddError('Student ID is required.')
                      setRosterAddMessage(null)
                      return
                    }
                    setRosterAddBusy(true)
                    setRosterAddError(null)
                    setRosterAddMessage(null)
                    ;(async () => {
                      try {
                        await postAdminClinicalSlotAddStudent({
                          timetableId: rosterSlot.id,
                          studentId: normalizedStudentId,
                          seatBucket:
                            rosterAddSeatBucket === ''
                              ? null
                              : rosterAddSeatBucket,
                        })
                        const list = await fetchAdminClinicalSlotRoster(rosterSlot.id)
                        setRosterRows(list)
                        setSlotsReloadKey((k) => k + 1)
                        setRosterAddStudentId('')
                        setRosterAddSeatBucket('')
                        setRosterAddMessage(
                          `Added ${normalizedStudentId} to this slot.`,
                        )
                      } catch (e) {
                        setRosterAddError(
                          e instanceof Error ? e.message : 'Could not add student.',
                        )
                      } finally {
                        setRosterAddBusy(false)
                      }
                    })()
                  }}
                >
                  {rosterAddBusy ? 'Adding…' : 'Add Student'}
                </button>
              </div>
              {rosterAddError ? (
                <p className="portal-page-lede" role="alert">
                  {rosterAddError}
                </p>
              ) : null}
              {rosterAddMessage ? (
                <p className="portal-card-note" role="status">
                  {rosterAddMessage}
                </p>
              ) : null}
            </div>
            {!rosterLoading && rosterRows != null && rosterRows.length === 0 ? (
              <p className="portal-card-note">
                No students with a non-dropped enrollment for this slot.
              </p>
            ) : null}
            {rosterRows != null && rosterRows.length > 0 ? (
              <div
                className="portal-table-wrap admin-table-wrap"
                style={{ marginTop: '0.75rem', maxHeight: '50vh', overflow: 'auto' }}
              >
                <table className="portal-table portal-data-table admin-students-table--center">
                  <thead>
                    <tr>
                      <th scope="col">Student ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Status</th>
                      <th scope="col">Seat bucket</th>
                      <th scope="col">Booked at</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterRows.map((r) => {
                      const removeKey = `${r.enrollmentId}:${r.studentId}`
                      const removing = rosterRemovingKey === removeKey
                      const canRemove = r.status.trim().toLowerCase() === 'enrolled'
                      return (
                        <tr key={removeKey}>
                          <td>{r.studentId}</td>
                          <td
                            style={{
                              maxWidth: '12rem',
                              textAlign: 'left',
                              whiteSpace: 'normal',
                            }}
                          >
                            {r.studentName}
                          </td>
                          <td
                            style={{
                              maxWidth: '14rem',
                              textAlign: 'left',
                              whiteSpace: 'normal',
                            }}
                          >
                            {r.email ?? '—'}
                          </td>
                          <td>{r.status}</td>
                          <td>
                            {r.seatBucket == null
                              ? '—'
                              : r.seatBucket === 'all'
                                ? 'All levels'
                                : `${r.seatBucket}-level`}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {formatClinicalRosterBookedAt(r.createdAt)}
                          </td>
                          <td>
                            <div
                              className="portal-actions"
                              style={{ gap: '0.35rem', justifyContent: 'flex-end' }}
                            >
                              <button
                                type="button"
                                className="portal-btn portal-btn--secondary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.8125rem',
                                }}
                                disabled={removing || gradeSaving}
                                onClick={() => {
                                  setGradeModal({
                                    timetableId: rosterSlot.id,
                                    enrollmentId: r.enrollmentId,
                                    studentId: r.studentId,
                                    studentName: r.studentName,
                                    clinicalCode: r.clinicalCode,
                                    clinicalBaseCode:
                                      r.clinicalBaseCode ??
                                      clinicalSeatBucketBaseCode(r.seatBucket),
                                    grade: (r.clinicalGrade ?? '').trim(),
                                    grade2:
                                      r.clinicalGrade2 == null
                                        ? ''
                                        : String(r.clinicalGrade2),
                                  })
                                  setGradeModalError(null)
                                }}
                              >
                                Update Grade
                              </button>
                              {canRemove ? (
                                <button
                                  type="button"
                                  className="portal-btn portal-btn--secondary"
                                  style={{
                                    padding: '0.35rem 0.65rem',
                                    fontSize: '0.8125rem',
                                  }}
                                  disabled={removing || gradeSaving}
                                  onClick={() => {
                                    if (
                                      !window.confirm(
                                        `Remove ${r.studentName} (${r.studentId}) from this slot? Their enrollment will be marked dropped.`,
                                      )
                                    ) {
                                      return
                                    }
                                    setRosterRemovingKey(removeKey)
                                    ;(async () => {
                                      try {
                                        await deleteAdminClinicalSlotEnrollment(
                                          rosterSlot.id,
                                          r.enrollmentId,
                                          r.studentId,
                                        )
                                        setRosterRows((prev) =>
                                          prev == null
                                            ? prev
                                            : prev.filter(
                                                (x) => x.enrollmentId !== r.enrollmentId,
                                              ),
                                        )
                                        setSlotsReloadKey((k) => k + 1)
                                      } catch (e) {
                                        window.alert(
                                          e instanceof Error ? e.message : 'Remove failed.',
                                        )
                                      } finally {
                                        setRosterRemovingKey(null)
                                      }
                                    })()
                                  }}
                                >
                                  {removing ? '…' : 'Remove'}
                                </button>
                              ) : (
                                <span
                                  className="portal-card-note"
                                  title="Only enrolled rows can be removed here."
                                >
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {gradeModal != null ? (
              <div
                className="admin-section-detail-backdrop"
                role="presentation"
                onMouseDown={(ev) => {
                  if (ev.target === ev.currentTarget && !gradeSaving) {
                    setGradeModal(null)
                    setGradeModalError(null)
                  }
                }}
              >
                <div
                  className="admin-section-detail-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="admin-clinical-roster-grade-title"
                >
                  <h3
                    id="admin-clinical-roster-grade-title"
                    className="admin-section-detail-modal__title"
                  >
                    Update Clinical Grade
                  </h3>
                  <p className="admin-section-detail-modal__meta">
                    {gradeModal.studentName} · {gradeModal.studentId}
                  </p>
                  <div className="portal-stack" style={{ marginTop: '0.5rem' }}>
                    <p className="portal-card-note">
                      Clinical code:{' '}
                      <strong>
                        {gradeModal.clinicalCode ??
                          gradeModal.clinicalBaseCode ??
                          'To be matched from enrollment context'}
                      </strong>
                    </p>
                  </div>
                  {gradeModalError ? (
                    <p className="portal-page-lede" role="alert">
                      {gradeModalError}
                    </p>
                  ) : null}
                  <form
                    className="portal-stack"
                    onSubmit={(ev) => {
                      ev.preventDefault()
                      const selectedGrade = gradeModal.grade.trim().toUpperCase()
                      if (selectedGrade === '') {
                        setGradeModalError('Grade is required.')
                        return
                      }
                      const grade2Raw = gradeModal.grade2.trim()
                      if (grade2Raw !== '' && !Number.isFinite(Number(grade2Raw))) {
                        setGradeModalError('Grade2 must be numeric when provided.')
                        return
                      }
                      setGradeModalError(null)
                      setGradeSaving(true)
                      ;(async () => {
                        try {
                          const result = await postAdminClinicalSlotEnrollmentGrade({
                            timetableId: gradeModal.timetableId,
                            enrollmentId: gradeModal.enrollmentId,
                            studentId: gradeModal.studentId,
                            grade: selectedGrade,
                            grade2: grade2Raw === '' ? null : Number(grade2Raw),
                          })
                          setRosterRows((prev) =>
                            prev == null
                              ? prev
                              : prev.map((row) =>
                                  row.enrollmentId === gradeModal.enrollmentId &&
                                  row.studentId === gradeModal.studentId
                                    ? {
                                        ...row,
                                        clinicalCode: result.clinicalCode,
                                        clinicalBaseCode: result.clinicalBaseCode,
                                        clinicalGrade: selectedGrade,
                                        clinicalGrade2:
                                          grade2Raw === '' ? null : Number(grade2Raw),
                                      }
                                    : row,
                                ),
                          )
                          setGradeModal(null)
                          setGradeModalError(null)
                        } catch (e) {
                          setGradeModalError(
                            e instanceof Error ? e.message : 'Failed to save grade.',
                          )
                        } finally {
                          setGradeSaving(false)
                        }
                      })()
                    }}
                  >
                    <div className="portal-course-feedback-modal__field">
                      <label htmlFor="admin-clinical-roster-grade">Grade</label>
                      <select
                        id="admin-clinical-roster-grade"
                        className="admin-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                        value={gradeModal.grade}
                        onChange={(e) =>
                          setGradeModal((prev) =>
                            prev == null ? prev : { ...prev, grade: e.target.value },
                          )
                        }
                      >
                        <option value="">Select grade…</option>
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="portal-course-feedback-modal__field">
                      <label htmlFor="admin-clinical-roster-grade2">Grade2 (optional)</label>
                      <input
                        id="admin-clinical-roster-grade2"
                        className="admin-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                        inputMode="decimal"
                        value={gradeModal.grade2}
                        onChange={(e) =>
                          setGradeModal((prev) =>
                            prev == null ? prev : { ...prev, grade2: e.target.value },
                          )
                        }
                      />
                    </div>
                    <div
                      className="portal-actions"
                      style={{ marginTop: '1rem', justifyContent: 'flex-end' }}
                    >
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary"
                        disabled={gradeSaving}
                        onClick={() => {
                          if (gradeSaving) return
                          setGradeModal(null)
                          setGradeModalError(null)
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="portal-btn portal-btn--primary"
                        disabled={gradeSaving}
                      >
                        {gradeSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
            <div
              className="portal-actions"
              style={{ marginTop: '1rem', justifyContent: 'flex-end' }}
            >
              <button
                type="button"
                className="portal-btn portal-btn--secondary"
                disabled={rosterRemovingKey != null || gradeModal != null || gradeSaving}
                onClick={() => setRosterSlot(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

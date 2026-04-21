import { useEffect, useState } from 'react'
import {
  createAdminClinicalSlot,
  deleteAdminClinicalSlot,
  deleteAdminClinicalSlotEnrollment,
  fetchAcademicTerms,
  fetchAdminClinicalSlots,
  fetchAdminClinicalSlotRoster,
  updateAdminClinicalSlot,
  type AcademicTerm,
  type AdminClinicalSlot,
  type AdminClinicalSlotRosterRow,
} from '../../lib/api'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { WEEKDAYS_FULL_ORDERED } from '../../lib/weekdaySchedule'
import { ClinicalOfferedTimetablePage } from '../clinical/ClinicalOfferedTimetablePage'

type AdminClinicalTabId = 'roster' | 'offered-timetable'

type SlotModalMode = 'add' | 'edit' | null

type SlotFormState = {
  academicTermId: string
  weekday: string
  timeFrom: string
  timeTo: string
  slot: string
  instructorId: string
  instructor: string
  cap100: string
  cap200: string
  cap300: string
  cap123: string
}

type InstructorOption = {
  instructorId: string
  instructor: string
}

function emptySlotForm(defaultTermId: string): SlotFormState {
  return {
    academicTermId: defaultTermId,
    weekday: 'Monday',
    timeFrom: '',
    timeTo: '',
    slot: '',
    instructorId: '',
    instructor: '',
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

function buildInstructorOptions(
  rows: AdminClinicalSlot[] | null,
  currentForm: SlotFormState,
): InstructorOption[] {
  const map = new Map<string, InstructorOption>()
  for (const row of rows ?? []) {
    const name = row.instructor.trim()
    if (name === '' || name.toUpperCase() === 'TBA') continue
    const id = row.instructorId.trim()
    const key = `${id}::${name}`
    if (!map.has(key)) {
      map.set(key, { instructorId: id, instructor: name })
    }
  }
  const currentName = currentForm.instructor.trim()
  if (currentName !== '' && currentName.toUpperCase() !== 'TBA') {
    const currentId = currentForm.instructorId.trim()
    const key = `${currentId}::${currentName}`
    if (!map.has(key)) {
      map.set(key, { instructorId: currentId, instructor: currentName })
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.instructor.localeCompare(b.instructor),
  )
}

function slotRowToForm(
  row: AdminClinicalSlot,
  fallbackTermId: string,
): SlotFormState {
  return {
    academicTermId: row.academicTermId ?? fallbackTermId,
    weekday: row.weekday || 'Monday',
    timeFrom: normalizeTimeForSelect(row.timeFrom),
    timeTo: normalizeTimeForSelect(row.timeTo),
    slot: row.slot,
    instructorId: row.instructorId,
    instructor: row.instructor === 'TBA' ? '' : row.instructor,
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

export function AdminClinicalPage() {
  useAdminAuth()
  const [tab, setTab] = useState<AdminClinicalTabId>('roster')

  const [terms, setTerms] = useState<AcademicTerm[] | null>(null)
  const [slotsTermId, setSlotsTermId] = useState('')
  const [slots, setSlots] = useState<AdminClinicalSlot[] | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
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

  const [rosterSlot, setRosterSlot] = useState<AdminClinicalSlot | null>(null)
  const [rosterRows, setRosterRows] = useState<AdminClinicalSlotRosterRow[] | null>(
    null,
  )
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [rosterRemovingKey, setRosterRemovingKey] = useState<string | null>(null)

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
      setSlots(null)
      setSlotsError(null)
      setSlotsLoading(false)
      return () => ac.abort()
    }
    setSlotsLoading(true)
    setSlotsError(null)
    ;(async () => {
      try {
        const list = await fetchAdminClinicalSlots({
          academicTermId: slotsTermId.trim(),
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setSlots(list)
        setSlotsError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setSlots(null)
        setSlotsError(
          e instanceof Error ? e.message : 'Could not load clinical slots.',
        )
      } finally {
        if (!ac.signal.aborted) setSlotsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [tab, slotsTermId, slotsReloadKey])

  useEffect(() => {
    if (rosterSlot == null) {
      setRosterRows(null)
      setRosterError(null)
      setRosterLoading(false)
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
  const instructorOptions = buildInstructorOptions(slots, slotForm)

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
      </div>

      {tab === 'roster' ? (
        <>
          <div className="admin-page__toolbar">
            <div className="admin-page__toolbar-actions" style={{ width: '100%' }}>
              <label
                htmlFor="admin-clinical-roster-term-filter"
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
                  id="admin-clinical-roster-term-filter"
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

          {!termsLoading && !hasTerms ? (
            <p className="portal-card-note" style={{ marginTop: '0.75rem' }}>
              No academic terms are available yet.
            </p>
          ) : null}

          {slotsTermId.trim() !== '' && slotsLoading && slots === null ? (
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

          {slotsTermId.trim() !== '' && slotsError ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
            >
              <p className="portal-profile-state__title">Could not load slots</p>
              <p className="portal-profile-state__detail">{slotsError}</p>
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

          {slotsTermId.trim() !== '' && !slotsLoading && !slotsError && slots != null ? (
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
                    <th scope="col">100 Level</th>
                    <th scope="col">200 Level</th>
                    <th scope="col">300 Level</th>
                    <th scope="col">All Levels</th>
                    <th scope="col">Active enrolled</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="portal-card-note">
                        No clinical slots for this term yet.
                      </td>
                    </tr>
                  ) : (
                    slots.map((s) => {
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
                          <td>{s.cap100}</td>
                          <td>{s.cap200}</td>
                          <td>{s.cap300}</td>
                          <td>{s.cap123}</td>
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
                                  setSlotForm(slotRowToForm(s, slotsTermId.trim()))
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

                    const instructor =
                      slotForm.instructor.trim() === ''
                        ? 'TBA'
                        : slotForm.instructor.trim()

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
                            instructorId:
                              slotForm.instructorId.trim() === ''
                                ? ''
                                : slotForm.instructorId.trim(),
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
                            instructorId:
                              slotForm.instructorId.trim() === ''
                                ? ''
                                : slotForm.instructorId.trim(),
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
                      value={`${slotForm.instructorId}::${slotForm.instructor}`}
                      onChange={(e) =>
                        setSlotForm((f) => {
                          const value = e.target.value
                          if (value === '') {
                            return { ...f, instructorId: '', instructor: '' }
                          }
                          const [instructorId, ...nameParts] = value.split('::')
                          return {
                            ...f,
                            instructorId,
                            instructor: nameParts.join('::'),
                          }
                        })
                      }
                    >
                      <option value="">TBA</option>
                      {instructorOptions.map((opt) => (
                        <option
                          key={`${opt.instructorId}::${opt.instructor}`}
                          value={`${opt.instructorId}::${opt.instructor}`}
                        >
                          {opt.instructor}
                        </option>
                      ))}
                    </select>
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
        <ClinicalOfferedTimetablePage embedded />
      ) : null}

      {rosterSlot != null ? (
        <div
          className="admin-section-detail-backdrop"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget && rosterRemovingKey == null) {
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
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {formatClinicalRosterBookedAt(r.createdAt)}
                          </td>
                          <td>
                            {canRemove ? (
                              <button
                                type="button"
                                className="portal-btn portal-btn--secondary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.8125rem',
                                }}
                                disabled={removing}
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
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div
              className="portal-actions"
              style={{ marginTop: '1rem', justifyContent: 'flex-end' }}
            >
              <button
                type="button"
                className="portal-btn portal-btn--secondary"
                disabled={rosterRemovingKey != null}
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

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createAdminClinicalSlot,
  deleteAdminClinicalSlot,
  fetchAcademicTerms,
  fetchAdminClinicalRequests,
  fetchAdminClinicalSlots,
  fetchAdminStudents,
  postApproveClinicalRequest,
  postRejectClinicalRequest,
  updateAdminClinicalSlot,
  type AcademicTerm,
  type AdminClinicalSlot,
  type AdminPendingClinicalRequestItem,
  type AdminStudentClinicalProgressSummary,
  type AdminStudentListItem,
} from '../../lib/api'
import { WEEKDAYS_FULL_ORDERED } from '../../lib/weekdaySchedule'

const PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 300

type AdminClinicalTabId = 'roster' | 'requests' | 'slots'

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

function slotRowToForm(
  row: AdminClinicalSlot,
  fallbackTermId: string,
): SlotFormState {
  return {
    academicTermId: row.academicTermId ?? fallbackTermId,
    weekday: row.weekday || 'Monday',
    timeFrom: row.timeFrom,
    timeTo: row.timeTo,
    slot: row.slot,
    instructorId: row.instructorId,
    instructor: row.instructor === 'TBA' ? '' : row.instructor,
    cap100: String(row.cap100),
    cap200: String(row.cap200),
    cap300: String(row.cap300),
    cap123: String(row.cap123),
  }
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

function clinicalReadinessLabel(
  readiness: AdminStudentClinicalProgressSummary['readiness'],
): string {
  return readiness === 'ready' ? 'Ready' : 'Not ready'
}

export function AdminClinicalPage() {
  const [tab, setTab] = useState<AdminClinicalTabId>('roster')
  const [q, setQ] = useState('')
  const debouncedSearch = useDebouncedValue(q.trim(), SEARCH_DEBOUNCE_MS)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminStudentListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [pendingRequests, setPendingRequests] = useState<
    AdminPendingClinicalRequestItem[] | null
  >(null)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [pendingReloadKey, setPendingReloadKey] = useState(0)
  const [pendingActionId, setPendingActionId] = useState<number | null>(null)

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

  const debouncedSearchPrev = useRef<string | null>(null)
  useEffect(() => {
    if (debouncedSearchPrev.current === null) {
      debouncedSearchPrev.current = debouncedSearch
      return
    }
    if (debouncedSearchPrev.current !== debouncedSearch) {
      debouncedSearchPrev.current = debouncedSearch
      setPage(1)
    }
  }, [debouncedSearch])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await fetchAdminStudents({
          signal: ac.signal,
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          clinicalSummary: true,
        })
        if (ac.signal.aborted) return
        setRows(res.items)
        setTotal(res.total)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setRows(null)
        setTotal(0)
        setError(
          e instanceof Error ? e.message : 'Could not load clinical roster.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()
    return () => ac.abort()
  }, [page, debouncedSearch, reloadKey])

  useEffect(() => {
    const ac = new AbortController()
    setPendingLoading(true)
    setPendingError(null)
    ;(async () => {
      try {
        const list = await fetchAdminClinicalRequests({ signal: ac.signal })
        if (ac.signal.aborted) return
        setPendingRequests(list)
        setPendingError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setPendingRequests(null)
        setPendingError(
          e instanceof Error
            ? e.message
            : 'Could not load pending clinical requests.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setPendingLoading(false)
        }
      }
    })()
    return () => ac.abort()
  }, [pendingReloadKey])

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const list = await fetchAcademicTerms({ signal: ac.signal })
        if (ac.signal.aborted) return
        setTerms(list)
      } catch {
        if (ac.signal.aborted) return
        setTerms([])
      }
    })()
    return () => ac.abort()
  }, [])

  useEffect(() => {
    if (tab !== 'slots') return
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

  const items = rows ?? []
  const sectionLoading = loading && rows === null && error === null

  const canGoPrev = page > 1 && !sectionLoading && !error
  const canGoNext =
    !sectionLoading && !error && page * PAGE_SIZE < total

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

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
          aria-selected={tab === 'requests'}
          className={[
            'portal-tab',
            tab === 'requests' ? 'portal-tab--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('requests')}
        >
          Pending Requests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'slots'}
          className={[
            'portal-tab',
            tab === 'slots' ? 'portal-tab--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setTab('slots')}
        >
          Manage Slots
        </button>
      </div>

      {tab === 'roster' ? (
        <>
          <div className="admin-page__toolbar">
            <div className="admin-page__toolbar-actions">
              <input
                type="search"
                className="admin-input admin-input--search"
                placeholder="Search by student ID, name, email, or program"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search clinical roster"
                disabled={sectionLoading || Boolean(error)}
              />
            </div>
          </div>

          {sectionLoading ? (
            <section
              className="portal-card portal-profile-state"
              aria-busy="true"
              aria-live="polite"
            >
              <p className="portal-profile-state__title">Loading clinical roster</p>
              <p className="portal-profile-state__detail">
                Please wait while we load each student&apos;s clinical progress from
                the school database.
              </p>
            </section>
          ) : null}

          {!sectionLoading && error ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
              aria-live="assertive"
            >
              <p className="portal-profile-state__title">
                We could not load the clinical roster
              </p>
              <p className="portal-profile-state__detail">{error}</p>
              <div className="portal-actions portal-profile-state__actions">
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

          {!sectionLoading && !error && rows != null ? (
            <>
              <div className="portal-table-wrap admin-table-wrap">
                <table className="portal-table portal-data-table admin-students-table--center">
                  <thead>
                    <tr>
                      <th scope="col">Student ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Clinical level</th>
                      <th scope="col">Completed hours</th>
                      <th scope="col">Required hours</th>
                      <th scope="col">Readiness</th>
                      <th scope="col">Missing</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="portal-card-note">
                          {total === 0 && debouncedSearch === ''
                            ? 'No students on file.'
                            : 'No students match your search.'}
                        </td>
                      </tr>
                    ) : (
                      items.map((r) => {
                        const s = r.clinicalProgressSummary
                        return (
                          <tr key={r.studentId}>
                            <td>{r.studentId}</td>
                            <td>{r.name}</td>
                            <td>
                              {s ? (
                                <span className="portal-status portal-status--scheduled">
                                  Level {s.level}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{s != null ? s.completedHours : '—'}</td>
                            <td>{s != null ? s.requiredHours : '—'}</td>
                            <td>
                              {s ? (
                                <span
                                  className={
                                    s.readiness === 'ready'
                                      ? 'portal-status portal-status--paid'
                                      : 'portal-status portal-status--pending'
                                  }
                                >
                                  {clinicalReadinessLabel(s.readiness)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td
                              style={{
                                maxWidth: '14rem',
                                textAlign: 'left',
                                whiteSpace: 'normal',
                              }}
                            >
                              {s == null ? (
                                '—'
                              ) : s.missingCount === 0 ? (
                                <span className="portal-card-note">None</span>
                              ) : (
                                <>
                                  <span className="portal-card-note">
                                    {s.missingCount}{' '}
                                    {s.missingCount === 1 ? 'item' : 'items'}
                                  </span>
                                  {s.missingSummary ? (
                                    <div
                                      style={{
                                        marginTop: '0.25rem',
                                        fontSize: '0.8125rem',
                                        lineHeight: 1.35,
                                      }}
                                    >
                                      {s.missingSummary}
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </td>
                            <td>
                              <Link
                                to={`/admin/clinical/${encodeURIComponent(r.studentId)}`}
                                className="portal-btn portal-btn--secondary"
                                style={{
                                  display: 'inline-flex',
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.8125rem',
                                }}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div
                className="portal-actions"
                style={{
                  marginTop: '1rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.75rem 1rem',
                }}
              >
                <span className="portal-card-note" style={{ marginRight: 'auto' }}>
                  {total === 0
                    ? '0 results'
                    : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
                </span>
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  disabled={!canGoPrev}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="portal-card-note" aria-current="page">
                  Page {page}
                </span>
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  disabled={!canGoNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {tab === 'requests' ? (
        <section
          className="portal-module-panel"
          aria-labelledby="admin-pending-clinical-requests-heading"
        >
          <h2
            id="admin-pending-clinical-requests-heading"
            className="portal-module-panel-heading"
          >
            Pending clinical requests
          </h2>
          {pendingLoading && pendingRequests === null ? (
            <p className="portal-card-note" aria-live="polite">
              Loading requests…
            </p>
          ) : null}
          {pendingError ? (
            <p className="portal-page-lede" role="alert">
              {pendingError}
            </p>
          ) : null}
          {!pendingLoading && !pendingError && pendingRequests != null ? (
            <div className="portal-table-wrap admin-table-wrap">
              <table className="portal-table portal-data-table admin-students-table--center">
                <thead>
                  <tr>
                    <th scope="col">Student ID</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Term / year</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="portal-card-note">
                        No pending clinical requests.
                      </td>
                    </tr>
                  ) : (
                    pendingRequests.map((r) => {
                      const busy = pendingActionId === r.id
                      return (
                        <tr key={r.id}>
                          <td>{r.studentId}</td>
                          <td
                            style={{
                              maxWidth: '20rem',
                              textAlign: 'left',
                              whiteSpace: 'normal',
                            }}
                          >
                            {r.slotLabel}
                          </td>
                          <td>
                            {r.term} {r.year}
                          </td>
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
                                className="portal-btn portal-btn--primary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.8125rem',
                                }}
                                disabled={busy}
                                onClick={() => {
                                  setPendingActionId(r.id)
                                  ;(async () => {
                                    try {
                                      await postApproveClinicalRequest(r.id)
                                      setPendingReloadKey((k) => k + 1)
                                    } catch (e) {
                                      window.alert(
                                        e instanceof Error
                                          ? e.message
                                          : 'Approve failed.',
                                      )
                                    } finally {
                                      setPendingActionId(null)
                                    }
                                  })()
                                }}
                              >
                                {busy ? '…' : 'Approve'}
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
                                  setPendingActionId(r.id)
                                  ;(async () => {
                                    try {
                                      await postRejectClinicalRequest(r.id)
                                      setPendingReloadKey((k) => k + 1)
                                    } catch (e) {
                                      window.alert(
                                        e instanceof Error
                                          ? e.message
                                          : 'Reject failed.',
                                      )
                                    } finally {
                                      setPendingActionId(null)
                                    }
                                  })()
                                }}
                              >
                                {busy ? '…' : 'Reject'}
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
        </section>
      ) : null}

      {tab === 'slots' ? (
        <>
          <div className="admin-page__toolbar">
            <div className="admin-page__toolbar-actions" style={{ width: '100%' }}>
              <label
                htmlFor="admin-clinical-slots-term-filter"
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
                  id="admin-clinical-slots-term-filter"
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

          {slotsTermId.trim() === '' ? (
            <p className="portal-card-note" style={{ marginTop: '0.75rem' }}>
              Select an academic term to view and manage clinic timetable slots.
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

          {slotsTermId.trim() !== '' &&
          !slotsLoading &&
          !slotsError &&
          slots != null ? (
            <div className="portal-table-wrap admin-table-wrap">
              <table className="portal-table portal-data-table admin-students-table--center">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Time From</th>
                    <th scope="col">Time To</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Instructor</th>
                    <th scope="col">100 Level</th>
                    <th scope="col">200 Level</th>
                    <th scope="col">300 Level</th>
                    <th scope="col">All Levels</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="portal-card-note">
                        No clinical slots for this term yet.
                      </td>
                    </tr>
                  ) : (
                    slots.map((s) => {
                      const busy = deletingSlotId === s.id
                      return (
                        <tr key={s.id}>
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
                                  setEditingSlotId(s.id)
                                  setSlotForm(
                                    slotRowToForm(s, slotsTermId.trim()),
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
                                  if (
                                    !window.confirm(
                                      `Delete clinical slot #${s.id} (${s.weekday} ${s.timeFrom}–${s.timeTo})? This cannot be undone.`,
                                    )
                                  ) {
                                    return
                                  }
                                  setDeletingSlotId(s.id)
                                  ;(async () => {
                                    try {
                                      await deleteAdminClinicalSlot(s.id)
                                      setSlotsReloadKey((k) => k + 1)
                                    } catch (e) {
                                      window.alert(
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
                  Slots are stored in the legacy clinic timetable. Times use 24-hour
                  format (HH:MM or HH:MM:SS).
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
                      setSlotFormError('Enter time from and time to.')
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

                    const timeRe = /^\d{1,2}:\d{2}(:\d{2})?$/
                    if (
                      !timeRe.test(slotForm.timeFrom.trim()) ||
                      !timeRe.test(slotForm.timeTo.trim())
                    ) {
                      setSlotFormError('Times must look like HH:MM or HH:MM:SS.')
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
                            timeFrom: slotForm.timeFrom.trim(),
                            timeTo: slotForm.timeTo.trim(),
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
                            timeFrom: slotForm.timeFrom.trim(),
                            timeTo: slotForm.timeTo.trim(),
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
                    <input
                      id="admin-clinical-slot-from"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="09:00 or 09:00:00"
                      required
                      value={slotForm.timeFrom}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, timeFrom: e.target.value }))
                      }
                    />
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-to">Time to</label>
                    <input
                      id="admin-clinical-slot-to"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="13:00 or 13:00:00"
                      required
                      value={slotForm.timeTo}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, timeTo: e.target.value }))
                      }
                    />
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
                    <label htmlFor="admin-clinical-slot-instr-id">
                      Instructor ID (optional)
                    </label>
                    <input
                      id="admin-clinical-slot-instr-id"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={slotForm.instructorId}
                      onChange={(e) =>
                        setSlotForm((f) => ({
                          ...f,
                          instructorId: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="portal-course-feedback-modal__field">
                    <label htmlFor="admin-clinical-slot-instr">Instructor</label>
                    <input
                      id="admin-clinical-slot-instr"
                      className="admin-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="TBA if blank"
                      value={slotForm.instructor}
                      onChange={(e) =>
                        setSlotForm((f) => ({ ...f, instructor: e.target.value }))
                      }
                    />
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
    </main>
  )
}

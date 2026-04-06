import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createAdminCourseSection,
  deleteAdminCourseSection,
  fetchAcademicTerms,
  fetchAdminCourseSections,
  fetchCourses,
  updateAdminCourseSection,
  type AcademicTerm,
  type AdminCourseSection,
  type CourseCatalogItem,
} from '../../lib/api'
import {
  formatTimeHmsForDisplay,
  inputTimeToApi,
  timeToInputValue,
} from '../../lib/formatScheduleTime'
import {
  formatWeekdaysShortFromStored,
  parseStoredWeekdaysToFullNames,
  selectedWeekdaysToStorage,
  WEEKDAYS_FULL_ORDERED,
  type WeekdayFull,
} from '../../lib/weekdaySchedule'

function displayCell(value: string | null | undefined): string {
  if (value == null || String(value).trim() === '') return '—'
  return String(value)
}

type FormState = {
  section_code: string
  weekdays: WeekdayFull[]
  start_time: string
  end_time: string
  delivery_mode: string
  room: string
  instructor: string
  notes: string
}

const emptyForm = (): FormState => ({
  section_code: '',
  weekdays: ['Monday'],
  start_time: '',
  end_time: '',
  delivery_mode: '',
  room: '',
  instructor: '',
  notes: '',
})

function toggleWeekday(
  current: WeekdayFull[],
  day: WeekdayFull,
  checked: boolean,
): WeekdayFull[] {
  const set = new Set(current)
  if (checked) set.add(day)
  else set.delete(day)
  return WEEKDAYS_FULL_ORDERED.filter((d) => set.has(d))
}

export function AdminCourseSectionsPage() {
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null)
  const [courses, setCourses] = useState<CourseCatalogItem[] | null>(null)
  const [academicTermId, setAcademicTermId] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [courseSearch, setCourseSearch] = useState('')
  const [sections, setSections] = useState<AdminCourseSection[] | null>(null)
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [sectionsError, setSectionsError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  /** Bumped after create/update/delete so the sections query re-runs without changing term/course. */
  const [listVersion, setListVersion] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const [t, c] = await Promise.all([
          fetchAcademicTerms({ signal: ac.signal }),
          fetchCourses({ signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setTerms(t)
        setCourses(c)
        setAcademicTermId((prev) =>
          prev === '' && t.length > 0 ? t[0].id : prev,
        )
        setCourseCode((prev) =>
          prev === '' && c.length > 0 ? c[0].code : prev,
        )
      } catch (e) {
        if (ac.signal.aborted) return
        setTerms([])
        setCourses([])
        setSectionsError(
          e instanceof Error ? e.message : 'Could not load terms or courses.',
        )
      }
    })()
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const tid = academicTermId.trim()
    const code = courseCode.trim()
    if (tid === '' || code === '') {
      setSections([])
      setSectionsLoading(false)
      return
    }
    const ac = new AbortController()
    setSectionsLoading(true)
    setSectionsError(null)
    ;(async () => {
      try {
        const rows = await fetchAdminCourseSections({
          academicTermId: tid,
          courseCode: code,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setSections(rows)
      } catch (e) {
        if (ac.signal.aborted) return
        setSections(null)
        setSectionsError(
          e instanceof Error ? e.message : 'Could not load sections.',
        )
      } finally {
        if (!ac.signal.aborted) setSectionsLoading(false)
      }
    })()
    return () => ac.abort()
  }, [academicTermId, courseCode, listVersion])

  const sortedCourses = useMemo(() => {
    if (courses == null) return []
    return [...courses].sort((a, b) => a.code.localeCompare(b.code))
  }, [courses])

  const filteredCoursesForSelect = useMemo(() => {
    const q = courseSearch.trim().toLowerCase()
    if (q === '') return sortedCourses
    return sortedCourses.filter((c) => {
      if (c.code.toLowerCase().includes(q)) return true
      const title = c.eng_name?.trim().toLowerCase() ?? ''
      return title.includes(q)
    })
  }, [sortedCourses, courseSearch])

  const courseSelectOptions = useMemo(() => {
    const selected = sortedCourses.find((c) => c.code === courseCode)
    if (!selected) return filteredCoursesForSelect
    const inFiltered = filteredCoursesForSelect.some(
      (c) => c.code === courseCode,
    )
    if (inFiltered) return filteredCoursesForSelect
    return [selected, ...filteredCoursesForSelect]
  }, [sortedCourses, filteredCoursesForSelect, courseCode])

  function resetForm() {
    setForm(emptyForm())
    setEditingId(null)
    setFormMessage(null)
  }

  const beginEdit = (row: AdminCourseSection) => {
    setEditingId(row.id)
    const parsed = parseStoredWeekdaysToFullNames(row.weekday)
    setForm({
      section_code: row.section_code,
      weekdays: parsed.length > 0 ? parsed : ['Monday'],
      start_time: timeToInputValue(row.start_time),
      end_time: timeToInputValue(row.end_time),
      delivery_mode: row.delivery_mode ?? '',
      room: row.room ?? '',
      instructor: row.instructor ?? '',
      notes: row.notes ?? '',
    })
    setFormMessage(null)
  }

  const weekdayStorage = (): string | null => {
    const s = selectedWeekdaysToStorage(form.weekdays)
    return s === '' ? null : s
  }

  const onCreate = async () => {
    const tid = academicTermId.trim()
    const code = courseCode.trim()
    if (tid === '' || code === '') {
      setFormMessage('Select an academic term and a course first.')
      return
    }
    if (form.section_code.trim() === '') {
      setFormMessage('Section code is required.')
      return
    }
    const wd = weekdayStorage()
    if (wd == null) {
      setFormMessage('Select at least one weekday.')
      return
    }
    setBusy(true)
    setFormMessage(null)
    try {
      await createAdminCourseSection({
        academic_term_id: tid,
        course_code: code,
        section_code: form.section_code.trim(),
        weekday: wd,
        start_time: inputTimeToApi(form.start_time),
        end_time: inputTimeToApi(form.end_time),
        delivery_mode: form.delivery_mode.trim() || null,
        room: form.room.trim() || null,
        instructor: form.instructor.trim() || null,
        notes: form.notes.trim() || null,
      })
      setForm(emptyForm())
      setSectionsError(null)
      setListVersion((v) => v + 1)
    } catch (e) {
      setFormMessage(
        e instanceof Error ? e.message : 'Create failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onUpdate = async () => {
    if (editingId == null) return
    const tid = academicTermId.trim()
    if (tid === '') {
      setFormMessage('Select an academic term.')
      return
    }
    const wd = weekdayStorage()
    if (wd == null) {
      setFormMessage('Select at least one weekday.')
      return
    }
    setBusy(true)
    setFormMessage(null)
    try {
      await updateAdminCourseSection(editingId, {
        academic_term_id: tid,
        course_code: courseCode.trim(),
        section_code: form.section_code.trim(),
        weekday: wd,
        start_time: inputTimeToApi(form.start_time),
        end_time: inputTimeToApi(form.end_time),
        delivery_mode: form.delivery_mode.trim() || null,
        room: form.room.trim() || null,
        instructor: form.instructor.trim() || null,
        notes: form.notes.trim() || null,
      })
      resetForm()
      setSectionsError(null)
      setListVersion((v) => v + 1)
    } catch (e) {
      setFormMessage(
        e instanceof Error ? e.message : 'Update failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (editingId == null) return
    if (!window.confirm('Delete this section? This cannot be undone.')) return
    setBusy(true)
    setFormMessage(null)
    try {
      await deleteAdminCourseSection(editingId)
      resetForm()
      setSectionsError(null)
      setListVersion((v) => v + 1)
    } catch (e) {
      setFormMessage(
        e instanceof Error ? e.message : 'Delete failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onDeleteRow = async (row: AdminCourseSection) => {
    if (!window.confirm(`Delete section ${row.section_code}?`)) return
    setBusy(true)
    setSectionsError(null)
    try {
      await deleteAdminCourseSection(row.id)
      if (editingId === row.id) resetForm()
      setSectionsError(null)
      setListVersion((v) => v + 1)
    } catch (e) {
      setSectionsError(
        e instanceof Error ? e.message : 'Delete failed.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">
          Course Sections
        </h1>
        <div className="admin-page__toolbar-actions admin-page__toolbar-actions--wrap">
          <Link
            to="/admin/course-sections/timetable"
            className="portal-btn portal-btn--secondary portal-btn--compact"
          >
            View Timetable
          </Link>
          <label className="admin-field admin-field--inline">
            <span className="admin-field__label">Academic term</span>
            <select
              className="admin-input"
              value={academicTermId}
              onChange={(e) => {
                setAcademicTermId(e.target.value)
                resetForm()
              }}
              disabled={terms == null || terms.length === 0}
              aria-label="Academic term"
            >
              {terms == null ? (
                <option value="">Loading…</option>
              ) : (
                terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.term_label} ({t.id})
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="admin-course-picker">
            <label className="admin-field admin-field--inline admin-course-picker__search">
              <span className="admin-field__label">Search courses</span>
              <input
                type="search"
                className="admin-input admin-input--search"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Code or English title…"
                aria-label="Filter courses by code or title"
                disabled={sortedCourses.length === 0}
              />
            </label>
            <label className="admin-field admin-field--inline">
              <span className="admin-field__label">Course</span>
              <select
                className="admin-input admin-input--wide"
                value={courseCode}
                onChange={(e) => {
                  setCourseCode(e.target.value)
                  resetForm()
                }}
                disabled={sortedCourses.length === 0}
                aria-label="Course"
              >
                {courseSelectOptions.length === 0 ? (
                  <option value="">No matches</option>
                ) : (
                  courseSelectOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                      {c.eng_name ? ` — ${c.eng_name}` : ''}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </div>
      </div>

      {sectionsError != null && (
        <p className="portal-text-muted" role="alert">
          {sectionsError}
        </p>
      )}

      <div className="portal-table-wrap admin-table-wrap">
        <table className="portal-table">
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col">Weekday</th>
              <th scope="col">Start</th>
              <th scope="col">End</th>
              <th scope="col">Delivery</th>
              <th scope="col">Room</th>
              <th scope="col">Instructor</th>
              <th scope="col">Notes</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sectionsLoading && (
              <tr>
                <td colSpan={9}>Loading sections…</td>
              </tr>
            )}
            {!sectionsLoading && sections != null && sections.length === 0 && (
              <tr>
                <td colSpan={9}>No sections for this term and course.</td>
              </tr>
            )}
            {!sectionsLoading &&
              sections?.map((row) => (
                <tr key={row.id}>
                  <td>{row.section_code}</td>
                  <td>{formatWeekdaysShortFromStored(row.weekday)}</td>
                  <td>{formatTimeHmsForDisplay(row.start_time)}</td>
                  <td>{formatTimeHmsForDisplay(row.end_time)}</td>
                  <td>{displayCell(row.delivery_mode)}</td>
                  <td>{displayCell(row.room)}</td>
                  <td>{displayCell(row.instructor)}</td>
                  <td>{displayCell(row.notes)}</td>
                  <td>
                    <div className="admin-inline-actions">
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary portal-btn--compact"
                        disabled={busy}
                        onClick={() => beginEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary portal-btn--compact"
                        disabled={busy}
                        onClick={() => void onDeleteRow(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <section
        className="admin-form-section"
        aria-labelledby="course-section-form-title"
      >
        <h2 id="course-section-form-title" className="admin-page__subtitle">
          {editingId == null ? 'Create section' : `Edit section #${editingId}`}
        </h2>
        <p className="portal-text-muted admin-form-hint">
          Term and course are taken from the selections above. The server maps{' '}
          <code className="admin-code">academic_term_id</code> to catalog term
          name and year on <code className="admin-code">course_sections</code>.
          Multiple weekdays are stored as a comma-separated list in{' '}
          <code className="admin-code">weekday</code>.
        </p>
        {formMessage != null && (
          <p className="admin-form-message" role="alert">
            {formMessage}
          </p>
        )}
        <div className="admin-form-grid">
          <label className="admin-field">
            <span className="admin-field__label">Section code</span>
            <input
              className="admin-input"
              value={form.section_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, section_code: e.target.value }))
              }
              autoComplete="off"
            />
          </label>
          <fieldset className="admin-field admin-field--weekdays">
            <legend className="admin-field__label">Weekdays</legend>
            <div
              className="admin-weekday-checkboxes"
              role="group"
              aria-label="Weekdays"
            >
              {WEEKDAYS_FULL_ORDERED.map((d) => (
                <label key={d} className="admin-weekday-checkboxes__item">
                  <input
                    type="checkbox"
                    checked={form.weekdays.includes(d)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        weekdays: toggleWeekday(f.weekdays, d, e.target.checked),
                      }))
                    }
                  />
                  <span>{d}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="admin-field">
            <span className="admin-field__label">Start time</span>
            <input
              type="time"
              className="admin-input"
              value={form.start_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, start_time: e.target.value }))
              }
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">End time</span>
            <input
              type="time"
              className="admin-input"
              value={form.end_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, end_time: e.target.value }))
              }
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Delivery mode</span>
            <input
              className="admin-input"
              placeholder="e.g. In Person, Hybrid, Online"
              value={form.delivery_mode}
              onChange={(e) =>
                setForm((f) => ({ ...f, delivery_mode: e.target.value }))
              }
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Room</span>
            <input
              className="admin-input"
              value={form.room}
              onChange={(e) =>
                setForm((f) => ({ ...f, room: e.target.value }))
              }
            />
          </label>
          <label className="admin-field admin-field--span-2">
            <span className="admin-field__label">Instructor</span>
            <input
              className="admin-input"
              value={form.instructor}
              onChange={(e) =>
                setForm((f) => ({ ...f, instructor: e.target.value }))
              }
            />
          </label>
          <label className="admin-field admin-field--span-2">
            <span className="admin-field__label">Notes</span>
            <textarea
              className="admin-input admin-textarea"
              rows={2}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </label>
        </div>
        <div className="admin-form-actions">
          {editingId == null ? (
            <button
              type="button"
              className="portal-btn portal-btn--primary"
              disabled={busy || academicTermId.trim() === '' || courseCode.trim() === ''}
              onClick={() => void onCreate()}
            >
              Create Section
            </button>
          ) : (
            <>
              <button
                type="button"
                className="portal-btn portal-btn--primary"
                disabled={busy}
                onClick={() => void onUpdate()}
              >
                Update Section
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--secondary"
                disabled={busy}
                onClick={() => void onDelete()}
              >
                Delete Section
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--secondary"
                disabled={busy}
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

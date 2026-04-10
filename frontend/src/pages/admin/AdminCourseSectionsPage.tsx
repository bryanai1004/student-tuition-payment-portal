import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  adminSchedulingQueryString,
  applyAdminSchedulingToSearchParams,
} from '../../lib/adminSchedulingSearchParams'
import { AdminTime12hFields } from '../../components/admin/AdminTime12hFields'
import {
  createAdminCourseSection,
  deleteAdminCourseSection,
  downloadAdminRegisteredStudentsCsv,
  fetchAcademicTerms,
  fetchAdminCourseSectionCourseMeta,
  fetchAdminCourseSections,
  fetchCourses,
  updateAdminCourseSection,
  type AcademicTerm,
  type AdminCourseSection,
  type CourseCatalogItem,
} from '../../lib/api'
import {
  canonicalDeliveryMode,
  DELIVERY_MODE_OPTIONS,
  formatDeliveryModeForDisplay,
} from '../../lib/deliveryMode'
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
import {
  formatCourseCatalogSelectLabel,
  getPreferredCourseTitle,
  type CourseTitleFields,
} from '../../lib/courseDisplayName'
import { scheduleTrackTableLabel } from '../../lib/scheduleTrack'
import { formatCatalogCredits } from './courses/courseCatalogDisplay'

function displayCell(value: string | null | undefined): string {
  if (value == null || String(value).trim() === '') return '—'
  return String(value)
}

type FormState = {
  section_code: string
  schedule_track: 'EN' | 'CN'
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
  schedule_track: 'EN',
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

function AdminCourseSectionsTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Section</th>
        <th scope="col">Course title</th>
        <th scope="col">CREDITS</th>
        <th scope="col">Track</th>
        <th scope="col">Weekday</th>
        <th scope="col">Start</th>
        <th scope="col">End</th>
        <th scope="col">Delivery</th>
        <th scope="col">Room</th>
        <th scope="col">Instructor</th>
        <th scope="col">Enrolled</th>
        <th scope="col">Registrations</th>
        <th scope="col">Notes</th>
        <th scope="col">Actions</th>
      </tr>
    </thead>
  )
}

type AdminCourseSectionGroupTableProps = {
  ariaLabelledBy: string
  title: string
  rows: AdminCourseSection[]
  emptyMessage: string
  /** Per-row title from catalog (eng/chi) and section track + optional legacy `course_title`. */
  resolveRowTitle: (row: AdminCourseSection) => string
  busy: boolean
  csvExportSectionId: number | null
  onViewStudents: (row: AdminCourseSection) => void
  onExportCsv: (row: AdminCourseSection) => void
  onEdit: (row: AdminCourseSection) => void
  onDeleteRow: (row: AdminCourseSection) => void
}

function AdminCourseSectionGroupTable({
  ariaLabelledBy,
  title,
  rows,
  emptyMessage,
  resolveRowTitle,
  busy,
  csvExportSectionId,
  onViewStudents,
  onExportCsv,
  onEdit,
  onDeleteRow,
}: AdminCourseSectionGroupTableProps) {
  return (
    <section
      className="admin-course-sections-group"
      aria-labelledby={ariaLabelledBy}
    >
      <h3 id={ariaLabelledBy} className="admin-course-sections-group__title">
        {title}
      </h3>
      <div className="portal-table-wrap admin-table-wrap">
        <table className="portal-table admin-course-sections-table">
          <AdminCourseSectionsTableHead />
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={14}
                  className="admin-course-sections-table__empty-row"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.section_code}</td>
                  <td>{resolveRowTitle(row)}</td>
                  <td className="admin-course-sections-table__numeric">
                    {formatCatalogCredits(row.units)}
                  </td>
                  <td>{scheduleTrackTableLabel(row.schedule_track)}</td>
                  <td>{formatWeekdaysShortFromStored(row.weekday)}</td>
                  <td>{formatTimeHmsForDisplay(row.start_time)}</td>
                  <td>{formatTimeHmsForDisplay(row.end_time)}</td>
                  <td>{formatDeliveryModeForDisplay(row.delivery_mode)}</td>
                  <td>{displayCell(row.room)}</td>
                  <td>{displayCell(row.instructor)}</td>
                  <td className="admin-course-sections-table__numeric">
                    {row.enrolled_count}
                  </td>
                  <td>
                    {row.enrolled_count > 0 ? (
                      <span className="admin-course-sections-table__reg-open">
                        Open
                      </span>
                    ) : (
                      <span className="admin-course-sections-table__reg-none">
                        None
                      </span>
                    )}
                  </td>
                  <td className="admin-course-sections-table__notes">
                    {displayCell(row.notes)}
                  </td>
                  <td className="admin-course-sections-table__actions">
                    <div
                      className="admin-course-sections-table__action-stack"
                      role="group"
                      aria-label={`Actions for section ${row.section_code}`}
                    >
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary portal-btn--compact"
                        disabled={busy || row.enrolled_count === 0}
                        title={
                          row.enrolled_count === 0
                            ? 'No students enrolled'
                            : undefined
                        }
                        onClick={() => onViewStudents(row)}
                      >
                        View students
                      </button>
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary portal-btn--compact"
                        disabled={busy || csvExportSectionId === row.id}
                        onClick={() => onExportCsv(row)}
                      >
                        {csvExportSectionId === row.id
                          ? 'Exporting…'
                          : 'Export CSV'}
                      </button>
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary portal-btn--compact"
                        disabled={busy}
                        onClick={() => onEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="portal-btn portal-btn--secondary portal-btn--compact portal-btn--admin-danger"
                        disabled={busy}
                        onClick={() => void onDeleteRow(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function AdminCourseSectionsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [csvExportSectionId, setCsvExportSectionId] = useState<number | null>(
    null,
  )
  const [csvExportError, setCsvExportError] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  /** Bumped after create/update/delete so the sections query re-runs without changing term/course. */
  const [listVersion, setListVersion] = useState(0)
  const editingIdRef = useRef(editingId)
  useEffect(() => {
    editingIdRef.current = editingId
  }, [editingId])

  /**
   * Optional legacy title from GET course-meta (same course as `courseCode` only);
   * used only when catalog `eng_name` / `chi_name` are both empty.
   */
  const [resolvedCourseMeta, setResolvedCourseMeta] = useState<{
    courseCode: string
    legacyTitle: string | null
  } | null>(null)

  /** Create/edit: auto-filled course title; `locked` stops track-driven overwrites after manual edits. */
  const [courseTitleDraft, setCourseTitleDraft] = useState('')
  const [courseTitleLocked, setCourseTitleLocked] = useState(false)

  const resetForm = useCallback(() => {
    setForm(emptyForm())
    setEditingId(null)
    setFormMessage(null)
    setCourseTitleLocked(false)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      const [termOutcome, courseOutcome] = await Promise.allSettled([
        fetchAcademicTerms({ signal: ac.signal }),
        fetchCourses({ signal: ac.signal }),
      ])
      if (ac.signal.aborted) return

      const t = termOutcome.status === 'fulfilled' ? termOutcome.value : []
      const c = courseOutcome.status === 'fulfilled' ? courseOutcome.value : []
      setTerms(t)
      setCourses(c)

      const termFailed = termOutcome.status === 'rejected'
      const courseFailed = courseOutcome.status === 'rejected'
      if (termFailed && courseFailed) {
        const a =
          termOutcome.reason instanceof Error
            ? termOutcome.reason.message
            : 'Could not load academic terms.'
        const b =
          courseOutcome.reason instanceof Error
            ? courseOutcome.reason.message
            : 'Could not load courses.'
        setSectionsError(`${a} — ${b}`)
      } else if (termFailed) {
        setSectionsError(
          termOutcome.reason instanceof Error
            ? termOutcome.reason.message
            : 'Could not load academic terms.',
        )
      } else if (courseFailed) {
        setSectionsError(
          courseOutcome.reason instanceof Error
            ? courseOutcome.reason.message
            : 'Could not load courses.',
        )
      } else {
        setSectionsError(null)
      }

      const sp = new URLSearchParams(window.location.search)
      const urlTerm = sp.get('term')?.trim() ?? ''
      const urlCourse = sp.get('course')?.trim() ?? ''
      const urlQ = sp.get('q') ?? ''

      const nextTerm =
        urlTerm && t.some((x) => x.id === urlTerm)
          ? urlTerm
          : t.length > 0
            ? t[0].id
            : ''
      const nextCourse =
        urlCourse && c.some((x) => x.code === urlCourse)
          ? urlCourse
          : c.length > 0
            ? c[0].code
            : ''

      setAcademicTermId(nextTerm)
      setCourseCode(nextCourse)
      setCourseSearch(urlQ)

      setSearchParams(
        (prev) =>
          applyAdminSchedulingToSearchParams(prev, {
            term: nextTerm,
            course: nextCourse,
            q: urlQ,
          }),
        { replace: true },
      )
    })()
    return () => ac.abort()
  }, [setSearchParams])

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

  const enSectionRows = useMemo(
    () => (sections ?? []).filter((s) => s.schedule_track !== 'CN'),
    [sections],
  )
  const cnSectionRows = useMemo(
    () => (sections ?? []).filter((s) => s.schedule_track === 'CN'),
    [sections],
  )

  const sortedCourses = useMemo(() => {
    if (courses == null) return []
    return [...courses].sort((a, b) => a.code.localeCompare(b.code))
  }, [courses])

  const filteredCoursesForSelect = useMemo(() => {
    const q = courseSearch.trim().toLowerCase()
    if (q === '') return sortedCourses
    return sortedCourses.filter((c) => {
      if (c.code.toLowerCase().includes(q)) return true
      const eng = c.eng_name?.trim().toLowerCase() ?? ''
      if (eng.includes(q)) return true
      const chi = c.chi_name?.trim().toLowerCase() ?? ''
      return chi.includes(q)
    })
  }, [sortedCourses, courseSearch])

  const selectedCourseCatalog = useMemo(
    () => sortedCourses.find((c) => c.code === courseCode) ?? null,
    [sortedCourses, courseCode],
  )

  const catalogTitleFields: CourseTitleFields = useMemo(() => {
    const code = courseCode.trim()
    return (
      selectedCourseCatalog ?? {
        code,
        eng_name: null,
        chi_name: null,
      }
    )
  }, [selectedCourseCatalog, courseCode])

  const metaLegacyTitleForCourse = useMemo((): string | null => {
    const code = courseCode.trim()
    if (code === '') return null
    if (resolvedCourseMeta?.courseCode !== code) return null
    const t = resolvedCourseMeta.legacyTitle?.trim() ?? ''
    return t !== '' ? t : null
  }, [resolvedCourseMeta, courseCode])

  const autoFormCourseTitle = useMemo(
    () =>
      getPreferredCourseTitle(
        catalogTitleFields,
        form.schedule_track,
        metaLegacyTitleForCourse,
      ),
    [catalogTitleFields, form.schedule_track, metaLegacyTitleForCourse],
  )

  useEffect(() => {
    if (courseTitleLocked) return
    setCourseTitleDraft(autoFormCourseTitle)
  }, [autoFormCourseTitle, courseTitleLocked])

  const resolveSectionRowTitle = useCallback(
    (row: AdminCourseSection) =>
      getPreferredCourseTitle(
        catalogTitleFields,
        row.schedule_track,
        row.course_title ?? metaLegacyTitleForCourse,
      ),
    [catalogTitleFields, metaLegacyTitleForCourse],
  )

  useEffect(() => {
    const code = courseCode.trim()
    if (code === '') {
      setResolvedCourseMeta(null)
      return
    }
    const ac = new AbortController()
    void (async () => {
      try {
        const meta = await fetchAdminCourseSectionCourseMeta(code, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setResolvedCourseMeta({
          courseCode: code,
          legacyTitle: meta.title.trim() !== '' ? meta.title.trim() : null,
        })
        if (editingIdRef.current !== null) return
        if (meta.suggestedInstructor == null || meta.suggestedInstructor === '')
          return
        setForm((f) =>
          f.instructor.trim() !== ''
            ? f
            : { ...f, instructor: meta.suggestedInstructor! },
        )
      } catch {
        if (!ac.signal.aborted) setResolvedCourseMeta(null)
      }
    })()
    return () => ac.abort()
  }, [courseCode, editingId])

  const courseSelectOptions = useMemo(() => {
    const selected = sortedCourses.find((c) => c.code === courseCode)
    if (!selected) return filteredCoursesForSelect
    const inFiltered = filteredCoursesForSelect.some(
      (c) => c.code === courseCode,
    )
    if (inFiltered) return filteredCoursesForSelect
    return [selected, ...filteredCoursesForSelect]
  }, [sortedCourses, filteredCoursesForSelect, courseCode])

  const beginEdit = useCallback((row: AdminCourseSection) => {
    setEditingId(row.id)
    setCourseTitleLocked(false)
    const parsed = parseStoredWeekdaysToFullNames(row.weekday)
    setForm({
      section_code: row.section_code,
      schedule_track: row.schedule_track === 'CN' ? 'CN' : 'EN',
      weekdays: parsed.length > 0 ? parsed : ['Monday'],
      start_time: timeToInputValue(row.start_time),
      end_time: timeToInputValue(row.end_time),
      delivery_mode:
        canonicalDeliveryMode(row.delivery_mode) ??
        (row.delivery_mode ?? '').trim(),
      room: row.room ?? '',
      instructor: row.instructor ?? '',
      notes: row.notes ?? '',
    })
    setFormMessage(null)
  }, [])

  /** Browser back/forward and in-app links: keep selects aligned with URL (term/course/q are source of truth). */
  useEffect(() => {
    if (terms == null || courses == null) return
    const t = searchParams.get('term')?.trim() ?? ''
    const c = searchParams.get('course')?.trim() ?? ''
    const q = searchParams.get('q') ?? ''
    const termOk = t && terms.some((x) => x.id === t) ? t : null
    const courseOk = c && courses.some((x) => x.code === c) ? c : null

    let shouldResetForm = false
    if (termOk != null && termOk !== academicTermId.trim()) {
      setAcademicTermId(termOk)
      shouldResetForm = true
    }
    if (courseOk != null && courseOk !== courseCode.trim()) {
      setCourseCode(courseOk)
      shouldResetForm = true
    }
    if (q !== courseSearch) {
      setCourseSearch(q)
    }
    if (shouldResetForm) resetForm()
  }, [
    searchParams,
    terms,
    courses,
    academicTermId,
    courseCode,
    courseSearch,
    resetForm,
  ])

  /**
   * Deep link: ?edit= — open editor once sections are loaded. Only removes `edit`; keeps term/course in the URL.
   */
  useEffect(() => {
    if (terms == null || courses == null) return
    const editRaw = searchParams.get('edit')?.trim() ?? ''
    if (editRaw === '') return

    const stripEditOnly = () => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p)
          n.delete('edit')
          return n
        },
        { replace: true },
      )
    }

    const id = Number(editRaw)
    if (!Number.isInteger(id) || id <= 0) {
      stripEditOnly()
      return
    }
    const t = searchParams.get('term')?.trim() ?? ''
    const c = searchParams.get('course')?.trim() ?? ''
    if (t !== '' && academicTermId.trim() !== t) return
    if (c !== '' && courseCode.trim() !== c) return
    if (sectionsLoading || sections == null) return

    const row =
      c !== ''
        ? sections.find((s) => s.id === id && s.course_code === c)
        : sections.find((s) => s.id === id)
    if (row == null) {
      stripEditOnly()
      return
    }
    beginEdit(row)
    stripEditOnly()
  }, [
    terms,
    courses,
    academicTermId,
    courseCode,
    sections,
    sectionsLoading,
    searchParams,
    setSearchParams,
    beginEdit,
  ])

  function pushSchedulingContext(
    next: { term: string; course: string; q: string },
    options?: { clearEdit?: boolean },
  ) {
    setSearchParams(
      (prev) =>
        applyAdminSchedulingToSearchParams(prev, next, {
          clearEdit: options?.clearEdit ?? true,
        }),
      { replace: true },
    )
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
        schedule_track: form.schedule_track,
        weekday: wd,
        start_time: inputTimeToApi(form.start_time),
        end_time: inputTimeToApi(form.end_time),
        delivery_mode: form.delivery_mode.trim() || null,
        room: form.room.trim() || null,
        instructor: form.instructor.trim() || null,
        notes: form.notes.trim() || null,
      })
      setForm(emptyForm())
      setCourseTitleLocked(false)
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
        schedule_track: form.schedule_track,
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

  const openRosterForSection = useCallback(
    (row: AdminCourseSection) => {
      const tid = academicTermId.trim()
      const code = courseCode.trim()
      if (tid === '' || code === '') return
      const p = new URLSearchParams()
      p.set('term', tid)
      p.set('course', code)
      const q = courseSearch.trim()
      if (q !== '') p.set('q', q)
      p.set('section', row.section_code)
      p.set('track', row.schedule_track)
      p.set('sectionId', String(row.id))
      navigate(`/admin/course-sections/roster?${p.toString()}`)
    },
    [academicTermId, courseCode, courseSearch, navigate],
  )

  const onExportCsvForSection = useCallback(
    (row: AdminCourseSection) => {
      setCsvExportError(null)
      setCsvExportSectionId(row.id)
      void (async () => {
        try {
          await downloadAdminRegisteredStudentsCsv(row.id)
        } catch (e) {
          setCsvExportError(
            e instanceof Error ? e.message : 'CSV export failed.',
          )
        } finally {
          setCsvExportSectionId(null)
        }
      })()
    },
    [],
  )

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
      <div className="admin-page__toolbar admin-course-sections-toolbar">
        <div className="admin-course-sections-toolbar__row admin-course-sections-toolbar__row--title">
          <h1 className="admin-page__title admin-page__title--inline admin-course-sections-toolbar__title">
            Course Sections
          </h1>
          <div className="admin-course-sections-toolbar__group admin-course-sections-toolbar__group--primary">
            <Link
              to={{
                pathname: '/admin/course-sections/timetable',
                search: (() => {
                  const qs = adminSchedulingQueryString({
                    term: academicTermId,
                    course: courseCode,
                    q: courseSearch,
                  })
                  return qs ? `?${qs}` : ''
                })(),
              }}
              className="portal-btn portal-btn--secondary portal-btn--compact admin-course-sections-toolbar__timetable"
            >
              View Timetable
            </Link>
            <label className="admin-field admin-field--inline admin-course-sections-toolbar__field admin-course-sections-toolbar__term">
              <span className="admin-field__label admin-course-sections-toolbar__label">
                Academic term
              </span>
              <select
                className="admin-input"
                value={academicTermId}
                onChange={(e) => {
                  const v = e.target.value
                  setAcademicTermId(v)
                  pushSchedulingContext({
                    term: v,
                    course: courseCode,
                    q: courseSearch,
                  })
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
          </div>
        </div>
        <div className="admin-course-sections-toolbar__row admin-course-sections-toolbar__row--filters">
          <label className="admin-field admin-field--inline admin-course-sections-toolbar__field admin-course-sections-toolbar__search">
            <span className="admin-field__label admin-course-sections-toolbar__label">
              Search courses
            </span>
            <input
              type="search"
              className="admin-input admin-input--search"
              value={courseSearch}
              onChange={(e) => {
                const v = e.target.value
                setCourseSearch(v)
                pushSchedulingContext(
                  {
                    term: academicTermId,
                    course: courseCode,
                    q: v,
                  },
                  { clearEdit: false },
                )
              }}
              placeholder="Code, English title, or Chinese title…"
              aria-label="Filter courses by code or English or Chinese title"
              disabled={sortedCourses.length === 0}
            />
          </label>
          <label className="admin-field admin-field--inline admin-course-sections-toolbar__field admin-course-sections-toolbar__course">
            <span className="admin-field__label admin-course-sections-toolbar__label">
              Course
            </span>
            <select
              className="admin-input admin-input--wide"
              value={courseCode}
              onChange={(e) => {
                const v = e.target.value
                setCourseCode(v)
                pushSchedulingContext({
                  term: academicTermId,
                  course: v,
                  q: courseSearch,
                })
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
                    {formatCourseCatalogSelectLabel(c)}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="admin-field admin-field--inline admin-course-sections-toolbar__field admin-course-sections-toolbar__credits">
            <span className="admin-field__label admin-course-sections-toolbar__label">
              Credits
            </span>
            <input
              type="text"
              className="admin-input admin-course-sections-toolbar__credits-input"
              readOnly
              aria-readonly="true"
              value={formatCatalogCredits(selectedCourseCatalog?.units)}
              title="Catalog credits for the selected course"
            />
          </div>
        </div>
      </div>

      {sectionsError != null && (
        <p className="portal-text-muted" role="alert">
          {sectionsError}
        </p>
      )}

      {csvExportError != null && (
        <p className="admin-form-message" role="alert">
          {csvExportError}
        </p>
      )}

      {sectionsLoading ? (
        <div
          className="portal-table-wrap admin-table-wrap admin-course-sections-list__state-wrap"
          role="status"
          aria-live="polite"
        >
          <p className="admin-course-sections-list__state">Loading sections…</p>
        </div>
      ) : null}

      {!sectionsLoading &&
      sections != null &&
      sections.length === 0 ? (
        <div className="portal-table-wrap admin-table-wrap admin-course-sections-list__state-wrap">
          <p className="admin-course-sections-list__state">
            No sections for this term and course.
          </p>
        </div>
      ) : null}

      {!sectionsLoading && sections != null && sections.length > 0 ? (
        <div className="admin-course-sections-page admin-course-sections-list">
          <AdminCourseSectionGroupTable
            ariaLabelledBy="admin-course-sections-en-heading"
            title="English Timetable Sections"
            rows={enSectionRows}
            emptyMessage="None for this course in this term."
            resolveRowTitle={resolveSectionRowTitle}
            busy={busy}
            csvExportSectionId={csvExportSectionId}
            onViewStudents={openRosterForSection}
            onExportCsv={onExportCsvForSection}
            onEdit={beginEdit}
            onDeleteRow={onDeleteRow}
          />
          <AdminCourseSectionGroupTable
            ariaLabelledBy="admin-course-sections-cn-heading"
            title="Chinese Timetable Sections"
            rows={cnSectionRows}
            emptyMessage="None for this course in this term."
            resolveRowTitle={resolveSectionRowTitle}
            busy={busy}
            csvExportSectionId={csvExportSectionId}
            onViewStudents={openRosterForSection}
            onExportCsv={onExportCsvForSection}
            onEdit={beginEdit}
            onDeleteRow={onDeleteRow}
          />
        </div>
      ) : null}

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
          <label className="admin-field admin-field--span-2">
            <span className="admin-field__label">Course title</span>
            <input
              type="text"
              className="admin-input"
              value={courseTitleDraft}
              onChange={(e) => {
                setCourseTitleLocked(true)
                setCourseTitleDraft(e.target.value)
              }}
              disabled={busy}
              title="Defaults from catalog English/Chinese names for the selected timetable track; edit to override without changing the catalog."
              autoComplete="off"
            />
          </label>
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
          <label className="admin-field">
            <span className="admin-field__label">Schedule track</span>
            <select
              className="admin-input"
              value={form.schedule_track}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  schedule_track: e.target.value === 'CN' ? 'CN' : 'EN',
                }))
              }
              disabled={busy}
              aria-label="Schedule track"
            >
              <option value="EN">English timetable</option>
              <option value="CN">Chinese timetable</option>
            </select>
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
          <AdminTime12hFields
            idPrefix="section-start"
            label="Start time"
            value={form.start_time}
            onChange={(v) => setForm((f) => ({ ...f, start_time: v }))}
            disabled={busy}
          />
          <AdminTime12hFields
            idPrefix="section-end"
            label="End time"
            value={form.end_time}
            onChange={(v) => setForm((f) => ({ ...f, end_time: v }))}
            disabled={busy}
          />
          <label className="admin-field">
            <span className="admin-field__label">Delivery mode</span>
            <select
              className="admin-input"
              value={form.delivery_mode.trim()}
              onChange={(e) =>
                setForm((f) => ({ ...f, delivery_mode: e.target.value }))
              }
              disabled={busy}
              aria-label="Delivery mode"
            >
              <option value="">Not selected</option>
              {DELIVERY_MODE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {form.delivery_mode.trim() !== '' &&
                canonicalDeliveryMode(form.delivery_mode) == null && (
                  <option value={form.delivery_mode.trim()}>
                    {form.delivery_mode.trim()} (legacy)
                  </option>
                )}
            </select>
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

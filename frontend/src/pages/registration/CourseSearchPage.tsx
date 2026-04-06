import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchApiJson } from '../../lib/api'
import { useCourseBin, type CourseBinItem } from './CourseBinContext'
import { useRegistrationTermSearchParam } from './registrationTermSearch'

/** Courses with no leading alphabetic prefix share this grouping key so none are dropped. */
const NO_PREFIX_KEY = '__NO_PREFIX__'

const PREFIX_LABEL_MAP: Readonly<Record<string, string>> = {
  AC: 'Acupuncture',
  BS: 'Basic Science',
  OM: 'Oriental Medicine / TCM',
  HB: 'Herbology',
  WM: 'Western Medicine',
  CL: 'Clinic',
  MG: 'Medical General / Ethics',
  CR: 'Comprehensive Review',
  PH: 'Public Health',
  CM: 'Case Management',
  EL: 'Elective',
  IM: 'Integrative Medicine',
  ICM: 'Integrative Case Management',
  PRO: 'Professional / Portfolio',
}

type CourseCatalogItem = {
  code: string | number | null | undefined
  eng_name: string | number | null | undefined
  chi_name: string | number | null | undefined
  units: string | number | null | undefined
  category: string | number | null | undefined
}

/** Mirrors backend `CourseSectionDetail` for stable typing with admin CRUD later. */
type CourseSectionDetail = {
  id: number
  course_code: string
  term: string
  year: number
  section_code: string
  weekday: string
  start_time: string | null
  end_time: string | null
  delivery_mode: string | null
  room: string | null
  instructor: string | null
  notes: string | null
  /** If API adds section-level overrides later, catalog fallback still applies when empty. */
  units?: string | number | null
  category?: string | number | null
}

function cellText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function displayOrDash(value: string | number | null | undefined): string {
  const t = cellText(value)
  return t === '' ? '—' : t
}

function formatTimeSlot(start: string | null, end: string | null): string {
  const s = cellText(start)
  const e = cellText(end)
  if (s === '' && e === '') return '—'
  if (s !== '' && e !== '') return `${s} – ${e}`
  return s || e
}

function unitsFromSectionOrCatalog(
  section: CourseSectionDetail | null,
  course: CourseCatalogItem,
): string {
  if (section) {
    const u = cellText(section.units)
    if (u !== '') return u
  }
  return displayOrDash(course.units)
}

type SectionPanelPhase = 'loading' | 'empty' | 'error' | 'data'

function sectionPanelPhase(
  sectionErr: string | undefined,
  sectionRows: CourseSectionDetail[] | undefined,
): SectionPanelPhase {
  if (sectionErr) return 'error'
  // Until the first response is stored, always treat as loading so the panel is never blank
  // (avoids a one-frame gap before `sectionsLoading` is true).
  if (sectionRows === undefined) return 'loading'
  if (sectionRows.length === 0) return 'empty'
  return 'data'
}

const PLACEHOLDER_REGISTERED = '0 of 0'

type SectionScheduleRowModel = {
  key: string | number
  section: string
  session: string
  type: string
  units: string
  registered: string
  time: string
  days: string
  instructor: string
  location: string
}

function sessionLabelFromSection(sec: CourseSectionDetail): string {
  const term = cellText(sec.term)
  const year = sec.year
  if (term === '' && (year === null || year === undefined || Number.isNaN(Number(year)))) {
    return '—'
  }
  if (term === '') return String(year)
  return `${term} ${year}`
}

function typeLabelFromSection(sec: CourseSectionDetail | null): string {
  if (!sec) return 'Lecture'
  const d = cellText(sec.delivery_mode)
  return d === '' ? 'Lecture' : d
}

function sectionScheduleRows(
  phase: SectionPanelPhase,
  sectionRows: CourseSectionDetail[] | undefined,
  course: CourseCatalogItem,
): SectionScheduleRowModel[] {
  if (phase === 'data' && sectionRows && sectionRows.length > 0) {
    return sectionRows.map((sec) => {
      const timeRaw = formatTimeSlot(sec.start_time, sec.end_time)
      const daysRaw = cellText(sec.weekday)
      const instRaw = cellText(sec.instructor)
      const locRaw = cellText(sec.room)
      const secCode = cellText(sec.section_code)
      return {
        key: sec.id,
        section: secCode === '' ? '—' : secCode,
        session: sessionLabelFromSection(sec),
        type: typeLabelFromSection(sec),
        units: unitsFromSectionOrCatalog(sec, course),
        registered: PLACEHOLDER_REGISTERED,
        time: timeRaw === '—' ? 'TBA' : timeRaw,
        days: daysRaw === '' ? 'TBA' : daysRaw,
        instructor: instRaw === '' ? 'TBA' : instRaw,
        location: locRaw === '' ? 'TBA' : locRaw,
      }
    })
  }

  const catalogUnits = displayOrDash(course.units)
  return [
    {
      key: 'placeholder',
      section: '—',
      session: '—',
      type: 'Lecture',
      units: catalogUnits === '' ? '—' : catalogUnits,
      registered: PLACEHOLDER_REGISTERED,
      time: 'TBA',
      days: 'TBA',
      instructor: 'TBA',
      location: 'TBA',
    },
  ]
}

function CourseSectionScheduleTable({
  courseCode,
  panelId,
  phase,
  sectionRows,
  course,
  sectionLoad,
  sectionErr,
  addToCourseBin,
}: {
  courseCode: string
  panelId: string
  phase: SectionPanelPhase
  sectionRows: CourseSectionDetail[] | undefined
  course: CourseCatalogItem
  sectionLoad: boolean
  sectionErr: string | undefined
  addToCourseBin: (item: CourseBinItem) => void
}) {
  const rows = sectionScheduleRows(phase, sectionRows, course)

  return (
    <div
      id={panelId}
      className="portal-course-search-sections-panel"
      role="region"
      aria-label={`Section schedule for ${courseCode}`}
    >
      {sectionLoad && (
        <p className="portal-course-search-sections-status" role="status" aria-live="polite">
          Loading section details…
        </p>
      )}
      {sectionErr && (
        <p
          className="portal-course-search-sections-status portal-inline-note portal-inline-note--flush"
          role="alert"
        >
          {sectionErr}
        </p>
      )}
      <div className="portal-course-search-sections-table-wrap portal-course-search-sections-table-wrap--schedule">
        <div className="portal-course-search-sections-table-scroll">
          <table className="portal-table portal-table--course-sections portal-table--course-section-schedule">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Session</th>
                <th scope="col">Type</th>
                <th scope="col">Units</th>
                <th scope="col">Registered</th>
                <th scope="col">Time</th>
                <th scope="col">Days</th>
                <th scope="col">Instructor</th>
                <th scope="col">Location</th>
                <th scope="col" className="portal-course-section-schedule-col-action">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.section}</td>
                  <td>{row.session}</td>
                  <td>{row.type}</td>
                  <td>{row.units}</td>
                  <td>{row.registered}</td>
                  <td>{row.time}</td>
                  <td>{row.days}</td>
                  <td>{row.instructor}</td>
                  <td>{row.location}</td>
                  <td className="portal-course-section-schedule-col-action">
                    <button
                      type="button"
                      className="portal-btn portal-btn--course-search-bin"
                      onClick={() => {
                        addToCourseBin({
                          course_code: cellText(courseCode),
                          eng_name: cellText(course.eng_name),
                          chi_name: cellText(course.chi_name),
                          units: row.units,
                          section: row.section,
                          session: row.session,
                          type: row.type,
                          registered: row.registered,
                          time: row.time,
                          days: row.days,
                          instructor: row.instructor,
                          location: row.location,
                        })
                      }}
                    >
                      Add to CourseBin
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function isCourseSectionDetailRow(v: unknown): v is CourseSectionDetail {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'number' && typeof o.section_code === 'string'
}

/**
 * Leading run of letters from the course code (dynamic; not limited to known prefixes).
 * Examples: AC201 → AC, ICM720 → ICM, PRO800 → PRO.
 */
function extractCoursePrefix(code: string): string {
  const upper = code.trim().toUpperCase()
  const m = upper.match(/^([A-Z]+)/)
  return m ? m[1] : NO_PREFIX_KEY
}

function prefixDisplayLabel(prefixKey: string): string {
  if (prefixKey === NO_PREFIX_KEY) return 'Other / Unmapped'
  return PREFIX_LABEL_MAP[prefixKey] ?? 'Other / Unmapped'
}

function panelIdForPrefix(prefixKey: string): string {
  const safe = prefixKey === NO_PREFIX_KEY ? 'no-prefix' : prefixKey.replace(/[^A-Z0-9_-]/gi, '-')
  return `course-catalog-panel-${safe}`
}

export function CourseSearchPage() {
  const registrationTermId = useRegistrationTermSearchParam()
  const { addToCourseBin } = useCourseBin()
  const [courses, setCourses] = useState<CourseCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expandedPrefixes, setExpandedPrefixes] = useState<Set<string>>(() => new Set())
  const [expandedCourseCodes, setExpandedCourseCodes] = useState<Set<string>>(() => new Set())
  const [sectionsByCode, setSectionsByCode] = useState<Record<string, CourseSectionDetail[]>>({})
  const [sectionsLoading, setSectionsLoading] = useState<Record<string, boolean>>({})
  const [sectionsError, setSectionsError] = useState<Record<string, string>>({})
  const sectionsInflightRef = useRef<Set<string>>(new Set())
  const sectionsByCodeRef = useRef(sectionsByCode)
  sectionsByCodeRef.current = sectionsByCode

  useEffect(() => {
    setSectionsByCode({})
    setSectionsError({})
    setSectionsLoading({})
    setExpandedCourseCodes(new Set())
    sectionsByCodeRef.current = {}
    sectionsInflightRef.current.clear()
  }, [registrationTermId])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data: unknown = await fetchApiJson('/api/courses')
        if (!Array.isArray(data)) {
          throw new Error('Unexpected response from the catalog.')
        }
        if (!cancelled) {
          setCourses(data as CourseCatalogItem[])
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load courses.')
          setCourses([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCourses = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => {
      const code = cellText(c.code)
      const codeLower = code.toLowerCase()
      const eng = cellText(c.eng_name).toLowerCase()
      const chi = cellText(c.chi_name).toLowerCase()
      const prefixKey = extractCoursePrefix(code)
      const prefixSearch =
        prefixKey === NO_PREFIX_KEY ? '' : prefixKey.toLowerCase()
      return (
        codeLower.includes(q) ||
        eng.includes(q) ||
        chi.includes(q) ||
        prefixSearch.includes(q)
      )
    })
  }, [courses, query])

  /**
   * Every filtered course is placed in exactly one bucket by `extractCoursePrefix`, so
   * sum(group.courses.length) always equals filteredCourses.length — nothing is omitted.
   */
  const groupedCatalog = useMemo(() => {
    const buckets = new Map<string, CourseCatalogItem[]>()
    for (const c of filteredCourses) {
      const prefixKey = extractCoursePrefix(cellText(c.code))
      const list = buckets.get(prefixKey)
      if (list) list.push(c)
      else buckets.set(prefixKey, [c])
    }
    for (const list of buckets.values()) {
      list.sort((a, b) =>
        cellText(a.code).localeCompare(cellText(b.code), undefined, { numeric: true }),
      )
    }
    const keys = [...buckets.keys()].sort((a, b) => {
      if (a === NO_PREFIX_KEY) return 1
      if (b === NO_PREFIX_KEY) return -1
      return a.localeCompare(b)
    })
    return keys.map((prefixKey) => ({
      prefixKey,
      displayPrefix: prefixKey === NO_PREFIX_KEY ? '—' : prefixKey,
      label: prefixDisplayLabel(prefixKey),
      courses: buckets.get(prefixKey)!,
    }))
  }, [filteredCourses])

  const searchActive = query.trim().length > 0
  const totalFiltered = filteredCourses.length

  function toggleGroup(prefixKey: string) {
    if (searchActive) return
    setExpandedPrefixes((prev) => {
      const next = new Set(prev)
      if (next.has(prefixKey)) next.delete(prefixKey)
      else next.add(prefixKey)
      return next
    })
  }

  function isGroupOpen(prefixKey: string): boolean {
    return searchActive || expandedPrefixes.has(prefixKey)
  }

  const loadSectionsForCourseCode = useCallback(async (courseCode: string) => {
    const code = courseCode.trim()
    if (code === '') return
    if (sectionsByCodeRef.current[code] !== undefined) return
    if (sectionsInflightRef.current.has(code)) return
    sectionsInflightRef.current.add(code)
    setSectionsLoading((prev) => ({ ...prev, [code]: true }))
    setSectionsError((prev) => {
      const next = { ...prev }
      delete next[code]
      return next
    })
    try {
      const encoded = encodeURIComponent(code)
      const tid = registrationTermId?.trim() ?? ''
      const qs =
        tid !== ''
          ? `?academic_term_id=${encodeURIComponent(tid)}`
          : ''
      const data: unknown = await fetchApiJson(
        `/api/courses/${encoded}/sections${qs}`,
      )
      if (!Array.isArray(data)) {
        throw new Error('Unexpected sections response.')
      }
      const rows = data.filter(isCourseSectionDetailRow)
      setSectionsByCode((prev) => ({ ...prev, [code]: rows }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load sections.'
      setSectionsError((prev) => ({ ...prev, [code]: msg }))
    } finally {
      sectionsInflightRef.current.delete(code)
      setSectionsLoading((prev) => {
        const next = { ...prev }
        delete next[code]
        return next
      })
    }
  }, [registrationTermId])

  function toggleCourseRow(courseCode: string) {
    const code = courseCode.trim()
    if (code === '') return
    let willOpen = false
    setExpandedCourseCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
        willOpen = true
      }
      return next
    })
    if (willOpen) void loadSectionsForCourseCode(code)
  }

  return (
    <main
      className="portal-page"
      data-registration-term={registrationTermId ?? undefined}
    >
      <section className="portal-card portal-stack" aria-labelledby="course-search-heading">
        <h2 id="course-search-heading" className="portal-section-heading">
          Course Search
        </h2>
        <div className="portal-registration-search">
          <label htmlFor="registration-course-search" className="visually-hidden">
            Search courses
          </label>
          <input
            id="registration-course-search"
            type="search"
            className="portal-registration-search-input"
            placeholder="Course code or keyword"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            disabled={loading}
          />
          <button type="button" className="portal-btn portal-btn--primary" disabled>
            Search
          </button>
        </div>

        {loading && (
          <div
            className="portal-registration-placeholder portal-registration-results-placeholder"
            role="status"
            aria-live="polite"
          >
            Loading course catalog…
          </div>
        )}

        {!loading && error && (
          <p className="portal-inline-note portal-inline-note--flush" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && courses.length === 0 && (
          <div
            className="portal-registration-placeholder portal-registration-results-placeholder"
            role="status"
          >
            No courses are available in the catalog right now.
          </div>
        )}

        {!loading && !error && courses.length > 0 && filteredCourses.length === 0 && (
          <div
            className="portal-registration-placeholder portal-registration-results-placeholder"
            role="status"
          >
            No courses match &ldquo;{query.trim()}&rdquo;. Try another code or keyword.
          </div>
        )}

        {!loading && !error && totalFiltered > 0 && (
          <div className="portal-course-catalog" role="region" aria-label="Course catalog by subject">
            <p className="visually-hidden">
              Course catalog: {totalFiltered} {totalFiltered === 1 ? 'course' : 'courses'}
              {query.trim() ? ' matching filter' : ''}, grouped by subject prefix.
            </p>
            <div className="portal-course-catalog-groups">
              {groupedCatalog.map((group) => {
                const open = isGroupOpen(group.prefixKey)
                const panelId = panelIdForPrefix(group.prefixKey)
                const count = group.courses.length
                return (
                  <section
                    key={group.prefixKey}
                    className="portal-course-catalog-group"
                    aria-labelledby={`${panelId}-heading`}
                  >
                    <button
                      type="button"
                      id={`${panelId}-heading`}
                      className="portal-course-catalog-group-header"
                      aria-expanded={open}
                      aria-controls={panelId}
                      onClick={() => toggleGroup(group.prefixKey)}
                    >
                      <span className="portal-course-catalog-group-chevron" aria-hidden>
                        {open ? '▼' : '▶'}
                      </span>
                      <span className="portal-course-catalog-group-titles">
                        <span className="portal-course-catalog-group-prefix">{group.displayPrefix}</span>
                        <span className="portal-course-catalog-group-label">{group.label}</span>
                      </span>
                      <span className="portal-course-catalog-group-count">
                        {count} {count === 1 ? 'course' : 'courses'}
                      </span>
                    </button>
                    {open && (
                      <div
                        id={panelId}
                        className="portal-course-catalog-group-body"
                        role="region"
                        aria-label={`${group.displayPrefix} ${group.label}`}
                      >
                        <div className="portal-table-wrap portal-table-wrap--nested">
                          <table className="portal-table portal-table--courses portal-table--course-search">
                            <thead>
                              <tr>
                                <th scope="col" className="portal-course-search-col-expand">
                                  <span className="visually-hidden">Show sections</span>
                                </th>
                                <th scope="col">Code</th>
                                <th scope="col">English name</th>
                                <th scope="col">Chinese name</th>
                                <th scope="col">Units</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.courses.map((c, i) => {
                                const code = cellText(c.code)
                                const rowKey = `${group.prefixKey}-${code || 'row'}-${i}`
                                const panelId = `course-sections-${rowKey}`
                                const courseOpen = expandedCourseCodes.has(code)
                                const sectionRows = sectionsByCode[code]
                                const sectionLoad = sectionsLoading[code] === true
                                const sectionErr = sectionsError[code]
                                const phase = sectionPanelPhase(sectionErr, sectionRows)
                                return (
                                  <Fragment key={rowKey}>
                                    <tr className="portal-course-search-summary-row">
                                      <td className="portal-course-search-col-expand">
                                        <button
                                          type="button"
                                          className="portal-course-search-expand-btn"
                                          aria-expanded={courseOpen}
                                          aria-controls={panelId}
                                          onClick={() => toggleCourseRow(code)}
                                          disabled={code === ''}
                                        >
                                          <span className="portal-course-catalog-group-chevron" aria-hidden>
                                            {courseOpen ? '▼' : '▶'}
                                          </span>
                                          <span className="visually-hidden">
                                            {courseOpen ? 'Collapse' : 'Expand'} sections for {code || 'course'}
                                          </span>
                                        </button>
                                      </td>
                                      <td>{displayOrDash(c.code)}</td>
                                      <td>{displayOrDash(c.eng_name)}</td>
                                      <td>{displayOrDash(c.chi_name)}</td>
                                      <td>{displayOrDash(c.units)}</td>
                                    </tr>
                                    {courseOpen && (
                                      <tr className="portal-course-search-detail-row">
                                        <td colSpan={5} className="portal-course-search-sections-cell">
                                          <CourseSectionScheduleTable
                                            courseCode={code}
                                            panelId={panelId}
                                            phase={phase}
                                            sectionRows={sectionRows}
                                            course={c}
                                            sectionLoad={sectionLoad}
                                            sectionErr={sectionErr}
                                            addToCourseBin={addToCourseBin}
                                          />
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

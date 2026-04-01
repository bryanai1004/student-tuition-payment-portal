import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const COURSES_API_URL = 'http://127.0.0.1:3001/api/courses'

function sectionsUrlForCourseCode(code: string): string {
  const trimmed = code.trim()
  const encoded = encodeURIComponent(trimmed)
  return `${COURSES_API_URL}/${encoded}/sections`
}

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

function categoryFromSectionOrCatalog(
  section: CourseSectionDetail | null,
  course: CourseCatalogItem,
): string {
  if (section) {
    const c = cellText(section.category)
    if (c !== '') return c
  }
  return displayOrDash(course.category)
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

function scheduleValue(
  phase: SectionPanelPhase,
  hasSection: boolean,
  valueWhenData: string,
): string {
  if (phase === 'loading') return '…'
  if (phase === 'error' || phase === 'empty' || !hasSection) return 'Not available yet'
  return valueWhenData === '' ? '—' : valueWhenData
}

function CourseSectionDetailCard({
  course,
  section,
  phase,
  heading,
}: {
  course: CourseCatalogItem
  section: CourseSectionDetail | null
  phase: SectionPanelPhase
  heading: string
}) {
  const hasSection = section !== null
  const weekday = scheduleValue(phase, hasSection, displayOrDash(section?.weekday))
  const timeSlot = scheduleValue(
    phase,
    hasSection,
    section ? formatTimeSlot(section.start_time, section.end_time) : '—',
  )
  const room = scheduleValue(phase, hasSection, displayOrDash(section?.room))
  const instructor = scheduleValue(phase, hasSection, displayOrDash(section?.instructor))
  const delivery = scheduleValue(phase, hasSection, displayOrDash(section?.delivery_mode))
  const notes = scheduleValue(phase, hasSection, displayOrDash(section?.notes))
  const units = unitsFromSectionOrCatalog(section, course)
  const category = categoryFromSectionOrCatalog(section, course)

  return (
    <div className="portal-course-detail-card">
      <h4 className="portal-course-detail-card-title">{heading}</h4>
      <dl className="portal-course-detail-dl">
        <div className="portal-course-detail-dl-row">
          <dt>Weekday</dt>
          <dd>{weekday}</dd>
        </div>
        <div className="portal-course-detail-dl-row">
          <dt>Time slot</dt>
          <dd>{timeSlot}</dd>
        </div>
        <div className="portal-course-detail-dl-row">
          <dt>Room</dt>
          <dd>{room}</dd>
        </div>
        <div className="portal-course-detail-dl-row">
          <dt>Instructor</dt>
          <dd>{instructor}</dd>
        </div>
        <div className="portal-course-detail-dl-row">
          <dt>Units</dt>
          <dd>{units}</dd>
        </div>
        <div className="portal-course-detail-dl-row">
          <dt>Category</dt>
          <dd>{category}</dd>
        </div>
        <div className="portal-course-detail-dl-row">
          <dt>Delivery mode</dt>
          <dd>{delivery}</dd>
        </div>
        <div className="portal-course-detail-dl-row">
          <dt>Notes</dt>
          <dd>{notes}</dd>
        </div>
      </dl>
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
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(COURSES_API_URL)
        const data: unknown = await res.json()
        if (!res.ok) {
          const body = data as { error?: string; message?: string }
          throw new Error(
            body.message ?? body.error ?? `Could not load courses (HTTP ${res.status}).`,
          )
        }
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
      const res = await fetch(sectionsUrlForCourseCode(code))
      const data: unknown = await res.json()
      if (!res.ok) {
        const body = data as { error?: string; message?: string }
        throw new Error(
          body.message ?? body.error ?? `Could not load sections (HTTP ${res.status}).`,
        )
      }
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
  }, [])

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
    <main className="portal-page">
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
                                          <div
                                            id={panelId}
                                            className="portal-course-search-sections-panel"
                                            role="region"
                                            aria-label={`Scheduled sections for ${code}`}
                                          >
                                            {sectionLoad && (
                                              <p
                                                className="portal-course-search-sections-status"
                                                role="status"
                                                aria-live="polite"
                                              >
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
                                            {phase === 'empty' && (
                                              <p className="portal-course-search-sections-status" role="status">
                                                No scheduled sections are listed for this course yet. Catalog
                                                fields are shown below where available.
                                              </p>
                                            )}
                                            <div className="portal-course-detail-stack">
                                              {phase === 'data' && sectionRows
                                                ? sectionRows.map((sec) => (
                                                    <CourseSectionDetailCard
                                                      key={sec.id}
                                                      course={c}
                                                      section={sec}
                                                      phase="data"
                                                      heading={
                                                        cellText(sec.section_code)
                                                          ? `Section ${cellText(sec.section_code)} · ${cellText(sec.term)} ${sec.year}`
                                                          : `Section · ${cellText(sec.term)} ${sec.year}`
                                                      }
                                                    />
                                                  ))
                                                : (
                                                    <CourseSectionDetailCard
                                                      course={c}
                                                      section={null}
                                                      phase={phase}
                                                      heading="Course details"
                                                    />
                                                  )}
                                            </div>
                                          </div>
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

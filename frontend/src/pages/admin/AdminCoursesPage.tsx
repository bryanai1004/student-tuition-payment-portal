import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminSchedulingQueryString } from '../../lib/adminSchedulingSearchParams'
import {
  fetchAcademicTerms,
  fetchAdminCoursesOpenForRegistration,
  fetchCourses,
  fetchCurrentAcademicTerm,
  type AcademicTerm,
  type CourseCatalogItem,
  type OpenRegistrationCourseRow,
} from '../../lib/api'
import { AllCoursesTable } from './courses/AllCoursesTable'
import { CoursesTabBar, type AdminCoursesTabId } from './courses/CoursesTabBar'
import { courseCatalogTitle } from './courses/courseCatalogDisplay'
import { OpenRegistrationCoursesTable } from './courses/OpenRegistrationCoursesTable'

export function AdminCoursesPage() {
  const [tab, setTab] = useState<AdminCoursesTabId>('all')

  const [catalog, setCatalog] = useState<CourseCatalogItem[] | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const [terms, setTerms] = useState<AcademicTerm[] | null>(null)
  const [termsLoading, setTermsLoading] = useState(true)
  const [termsError, setTermsError] = useState<string | null>(null)

  const [allSearch, setAllSearch] = useState('')

  const [openTermId, setOpenTermId] = useState('')
  const openTermAutoDone = useRef(false)

  const [openSearch, setOpenSearch] = useState('')
  const [openRowsRaw, setOpenRowsRaw] = useState<OpenRegistrationCourseRow[] | null>(null)
  const [openLoading, setOpenLoading] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  const reloadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const c = await fetchCourses()
      setCatalog(c)
    } catch (e) {
      setCatalog([])
      setCatalogError(
        e instanceof Error ? e.message : 'Could not load courses.',
      )
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    setCatalogLoading(true)
    setTermsLoading(true)
    setCatalogError(null)
    setTermsError(null)

    ;(async () => {
      try {
        const c = await fetchCourses({ signal: ac.signal })
        if (ac.signal.aborted) return
        setCatalog(c)
      } catch (e) {
        if (ac.signal.aborted) return
        setCatalog([])
        setCatalogError(
          e instanceof Error ? e.message : 'Could not load courses.',
        )
      } finally {
        if (!ac.signal.aborted) setCatalogLoading(false)
      }
    })()

    ;(async () => {
      try {
        const t = await fetchAcademicTerms({ signal: ac.signal })
        if (ac.signal.aborted) return
        setTerms(t)
      } catch (e) {
        if (ac.signal.aborted) return
        setTerms([])
        setTermsError(
          e instanceof Error ? e.message : 'Could not load academic terms.',
        )
      } finally {
        if (!ac.signal.aborted) setTermsLoading(false)
      }
    })()

    return () => ac.abort()
  }, [])

  useEffect(() => {
    if (!terms?.length || openTermAutoDone.current) return
    const ac = new AbortController()
    ;(async () => {
      try {
        const cur = await fetchCurrentAcademicTerm({ signal: ac.signal })
        if (ac.signal.aborted) return
        if (cur && terms.some((x) => x.id === cur.id)) {
          setOpenTermId(cur.id)
        } else {
          setOpenTermId(terms[0].id)
        }
      } catch {
        if (!ac.signal.aborted) setOpenTermId(terms[0].id)
      } finally {
        if (!ac.signal.aborted) openTermAutoDone.current = true
      }
    })()
    return () => ac.abort()
  }, [terms])

  useEffect(() => {
    if (tab !== 'open' || !openTermId) return
    const ac = new AbortController()
    setOpenLoading(true)
    setOpenError(null)
    ;(async () => {
      try {
        const rows = await fetchAdminCoursesOpenForRegistration({
          termId: openTermId,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setOpenRowsRaw(rows)
      } catch (e) {
        if (ac.signal.aborted) return
        setOpenRowsRaw(null)
        setOpenError(
          e instanceof Error ? e.message : 'Could not load open-registration courses.',
        )
      } finally {
        if (!ac.signal.aborted) setOpenLoading(false)
      }
    })()
    return () => ac.abort()
  }, [tab, openTermId])

  const filteredAll = useMemo(() => {
    const list = catalog ?? []
    const s = allSearch.trim().toLowerCase()
    if (!s) return list
    return list.filter((r) => {
      const title = courseCatalogTitle(r).toLowerCase()
      return r.code.toLowerCase().includes(s) || title.includes(s)
    })
  }, [catalog, allSearch])

  const filteredOpen = useMemo(() => {
    const list = openRowsRaw ?? []
    const s = openSearch.trim().toLowerCase()
    if (!s) return list
    return list.filter(
      (r) =>
        r.courseCode.toLowerCase().includes(s) ||
        r.courseTitle.toLowerCase().includes(s),
    )
  }, [openRowsRaw, openSearch])

  const openTabBlocking =
    tab === 'open' &&
    (termsLoading || (terms !== null && terms.length > 0 && openTermId === ''))

  const addCourseSearch = useMemo(
    () =>
      adminSchedulingQueryString({
        term: terms?.[0]?.id ?? '',
        course: catalog?.[0]?.code ?? '',
      }),
    [terms, catalog],
  )

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <h1 className="admin-page__title admin-page__title--inline">COURSES</h1>
      </div>

      <CoursesTabBar
        active={tab}
        onChange={(next) => {
          setTab(next)
          if (next === 'open') setOpenSearch('')
          if (next === 'all') setAllSearch('')
        }}
      />

      {tab === 'all' ? (
        <>
          <div className="admin-page__toolbar">
            <div className="admin-page__toolbar-actions">
              <input
                type="search"
                className="admin-input admin-input--search"
                placeholder="Search by course code or title"
                value={allSearch}
                onChange={(e) => setAllSearch(e.target.value)}
                aria-label="Search courses"
              />
              <Link
                to={{
                  pathname: '/admin/course-sections',
                  search: addCourseSearch ? `?${addCourseSearch}` : '',
                }}
                className="portal-btn portal-btn--primary"
              >
                Add Course
              </Link>
            </div>
          </div>
          <AllCoursesTable
            rows={filteredAll}
            loading={catalogLoading}
            error={catalogError}
            onCourseSaved={reloadCatalog}
          />
        </>
      ) : (
        <OpenRegistrationCoursesTable
          terms={terms}
          termId={openTermId}
          onTermIdChange={setOpenTermId}
          termsLoading={termsLoading}
          termsError={termsError}
          search={openSearch}
          onSearchChange={setOpenSearch}
          rows={filteredOpen}
          unfilteredCount={openRowsRaw?.length ?? 0}
          loading={openLoading || openTabBlocking}
          error={openError}
        />
      )}
    </main>
  )
}

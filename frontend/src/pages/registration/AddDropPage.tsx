import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '../../context/AccountContext'
import {
  fetchAcademicTerms,
  fetchCourses,
  fetchCurrentAcademicTerm,
  fetchStudentEnrolledSections,
  postStudentWithdraw,
  type AcademicTerm,
  type AdminCourseSection,
  type CourseCatalogItem,
} from '../../lib/api'
import { getPreferredCourseTitle } from '../../lib/courseDisplayName'
import { formatTimeRangeHmsForDisplay } from '../../lib/formatScheduleTime'
import { formatWeekdaysShortFromStored } from '../../lib/weekdaySchedule'
import { useRegistrationTermSearchParam } from './registrationTermSearch'

function localTodayYyyyMmDd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolveTermForSelectedId(
  selectedId: string,
  current: AcademicTerm | null,
  allTerms: AcademicTerm[],
): AcademicTerm | null {
  const id = selectedId.trim()
  if (id === '') return null
  if (current != null && current.id === id) return current
  return allTerms.find((termOpt) => termOpt.id === id) ?? null
}

export function AddDropPage() {
  const t = useStudentPortalT()
  const registrationTermId = useRegistrationTermSearchParam()
  const { currentStudentId, isAuthenticated } = useAccount()

  const [sections, setSections] = useState<AdminCourseSection[]>([])
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<AcademicTerm | null>(null)
  const [coursesCatalog, setCoursesCatalog] = useState<CourseCatalogItem[] | null>(null)
  const [withdrawingSectionId, setWithdrawingSectionId] = useState<number | null>(
    null,
  )
  const [rowErrorBySectionId, setRowErrorBySectionId] = useState<
    Record<number, string>
  >({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const termKey = registrationTermId?.trim() ?? ''
  const studentKey = currentStudentId?.trim() ?? ''
  const termMissing = registrationTermId == null || registrationTermId.trim() === ''

  const catalogByCode = useMemo(() => {
    const m = new Map<string, CourseCatalogItem>()
    if (coursesCatalog == null) return m
    for (const c of coursesCatalog) {
      m.set(c.code.trim().toUpperCase(), c)
    }
    return m
  }, [coursesCatalog])

  const withdrawEligibility = useMemo(() => {
    const deadlineYmd = selectedTerm?.withdraw_deadline ?? null
    if (deadlineYmd == null || deadlineYmd.trim() === '') {
      return {
        withdrawAllowed: false,
        reasonWhenDisabled: t('addDropWithdrawDeadlineNotConfigured'),
      }
    }
    const deadline = deadlineYmd.slice(0, 10)
    const today = localTodayYyyyMmDd()
    if (today > deadline) {
      return {
        withdrawAllowed: false,
        reasonWhenDisabled: t('addDropWithdrawDeadlinePassed'),
      }
    }
    return { withdrawAllowed: true, reasonWhenDisabled: null }
  }, [selectedTerm?.withdraw_deadline, t])

  const loadWorkspace = useCallback(async () => {
    if (termKey === '' || studentKey === '' || !isAuthenticated) {
      setSections([])
      setSelectedTerm(null)
      setCoursesCatalog(null)
      setLoadState('idle')
      setLoadError(null)
      return
    }
    const ac = new AbortController()
    setLoadState('loading')
    setLoadError(null)
    try {
      const [current, allTerms, enrolled, catalog] = await Promise.all([
        fetchCurrentAcademicTerm({ signal: ac.signal }),
        fetchAcademicTerms({ signal: ac.signal }),
        fetchStudentEnrolledSections(studentKey, termKey, { signal: ac.signal }).then(
          (r) => r.sections,
        ),
        fetchCourses({ signal: ac.signal }),
      ])
      if (ac.signal.aborted) return
      const term = resolveTermForSelectedId(termKey, current, allTerms)
      setSelectedTerm(term)
      setSections(enrolled)
      setCoursesCatalog(catalog)
      setLoadState('idle')
    } catch (e) {
      if (ac.signal.aborted) return
      setSections([])
      setSelectedTerm(null)
      setCoursesCatalog(null)
      setLoadState('error')
      setLoadError(e instanceof Error ? e.message : t('couldNotLoadAddDropData'))
    }
  }, [termKey, studentKey, isAuthenticated, t])

  const refetchEnrolledSectionsOnly = useCallback(async () => {
    if (termKey === '' || studentKey === '' || !isAuthenticated) return
    try {
      const { sections: enrolled } = await fetchStudentEnrolledSections(studentKey, termKey)
      setSections(enrolled)
    } catch {
      /* keep existing table; user can Retry for full reload */
    }
  }, [termKey, studentKey, isAuthenticated])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const handleWithdraw = async (row: AdminCourseSection) => {
    const code = row.course_code.trim()
    const sectionId = row.id
    if (code === '' || termKey === '' || studentKey === '' || sectionId <= 0) return
    if (!withdrawEligibility.withdrawAllowed) return

    const ok = window.confirm(t('addDropWithdrawConfirm').replace('{code}', code))
    if (!ok) return

    setRowErrorBySectionId((prev) => {
      const next = { ...prev }
      delete next[sectionId]
      return next
    })
    setWithdrawingSectionId(sectionId)
    try {
      const res = await postStudentWithdraw({
        studentId: studentKey,
        academic_term_id: termKey,
        course_section_id: sectionId,
      })
      if (!res.success || res.removedCount < 1) {
        setRowErrorBySectionId((prev) => ({
          ...prev,
          [sectionId]: t('addDropWithdrawNoEnrollment'),
        }))
        return
      }
      setSuccessMessage(t('addDropCourseWithdrawn'))
      window.setTimeout(() => setSuccessMessage(null), 4000)
      await refetchEnrolledSectionsOnly()
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('withdrawalFailedGeneric')
      setRowErrorBySectionId((prev) => ({ ...prev, [sectionId]: msg }))
    } finally {
      setWithdrawingSectionId(null)
    }
  }

  const tba = t('scheduleTba')

  return (
    <main
      className="portal-page portal-add-drop-page"
      data-registration-term={registrationTermId ?? undefined}
    >
      <p className="portal-page-lede">{t('addDropPageLede')}</p>

      {!isAuthenticated && (
        <section className="portal-card portal-stack" aria-labelledby="add-drop-auth-heading">
          <h2 id="add-drop-auth-heading" className="portal-section-heading">
            {t('signInRequiredHeading')}
          </h2>
          <p className="portal-text-muted" role="status">
            {t('addDropSignInBody')}
          </p>
        </section>
      )}

      {isAuthenticated && termMissing && (
        <section className="portal-card portal-stack" aria-labelledby="add-drop-term-heading">
          <h2 id="add-drop-term-heading" className="portal-section-heading">
            {t('addDropSelectTermHeading')}
          </h2>
          <p className="portal-text-muted" role="status">
            {t('addDropSelectTermBody')}
          </p>
        </section>
      )}

      {isAuthenticated && !termMissing && loadState === 'loading' && (
        <section className="portal-card portal-stack" aria-labelledby="add-drop-loading-heading">
          <h2 id="add-drop-loading-heading" className="portal-section-heading">
            {t('addDropLoadingHeading')}
          </h2>
          <p className="portal-text-muted" role="status">
            {t('addDropLoadingCourses')}
          </p>
        </section>
      )}

      {isAuthenticated && !termMissing && loadState === 'error' && (
        <section className="portal-card portal-stack" aria-labelledby="add-drop-error-heading">
          <h2 id="add-drop-error-heading" className="portal-section-heading">
            {t('addDropErrorHeading')}
          </h2>
          <p className="portal-text-muted" role="status">
            {loadError ?? t('somethingWentWrong')}
          </p>
          <button
            type="button"
            className="portal-btn portal-btn--primary portal-btn--compact"
            onClick={() => void loadWorkspace()}
          >
            {t('retry')}
          </button>
        </section>
      )}

      {isAuthenticated && !termMissing && loadState === 'idle' && (
        <section className="portal-card portal-stack" aria-labelledby="add-drop-workspace-heading">
          <h2 id="add-drop-workspace-heading" className="portal-section-heading">
            {t('yourCoursesHeading')}
          </h2>

          {!withdrawEligibility.withdrawAllowed && (
            <p className="portal-inline-note portal-inline-note--flush" role="status">
              {withdrawEligibility.reasonWhenDisabled}
            </p>
          )}

          {successMessage != null && (
            <p className="portal-inline-note portal-inline-note--flush" role="status">
              {successMessage}
            </p>
          )}

          {sections.length === 0 ? (
            <p className="portal-text-muted" role="status">
              {t('noRegisteredCoursesThisTerm')}
            </p>
          ) : (
            <div className="portal-course-search-sections-table-wrap portal-course-search-sections-table-wrap--schedule">
              <div className="portal-course-search-sections-table-scroll">
                <table className="portal-table portal-table--course-sections portal-table--course-section-schedule">
                  <caption className="visually-hidden">{t('addDropRegisteredSectionsCaption')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('courseColCourse')}</th>
                      <th scope="col">{t('sectionColSection')}</th>
                      <th scope="col">{t('sectionColDays')}</th>
                      <th scope="col">{t('sectionColTime')}</th>
                      <th scope="col">{t('sectionColInstructor')}</th>
                      <th scope="col">{t('sectionColLocation')}</th>
                      <th scope="col">{t('status')}</th>
                      <th scope="col" className="portal-course-section-schedule-col-action">
                        {t('tableColAction')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((row) => {
                      const code = row.course_code.trim()
                      const cat = catalogByCode.get(code.toUpperCase())
                      const title = getPreferredCourseTitle(
                        {
                          code: row.course_code,
                          eng_name: cat?.eng_name ?? row.course_code,
                          chi_name: cat?.chi_name ?? null,
                        },
                        row.schedule_track,
                      )
                      const daysRaw = formatWeekdaysShortFromStored(row.weekday)
                      const timeRaw = formatTimeRangeHmsForDisplay(row.start_time, row.end_time)
                      const days = daysRaw === '—' ? tba : daysRaw
                      const time = timeRaw === '—' ? tba : timeRaw
                      const inst =
                        row.instructor?.trim() && row.instructor.trim() !== ''
                          ? row.instructor.trim()
                          : tba
                      const loc =
                        row.room?.trim() && row.room.trim() !== '' ? row.room.trim() : tba
                      const rowErr = rowErrorBySectionId[row.id]
                      const submitting = withdrawingSectionId === row.id
                      return (
                        <tr key={row.id}>
                          <td>
                            <div className="portal-course-bin-course-cell">
                              <span className="portal-course-bin-course-code">
                                {code || '—'}
                              </span>
                              <span className="portal-course-bin-course-title">{title}</span>
                            </div>
                          </td>
                          <td>{row.section_code.trim() || '—'}</td>
                          <td>{days}</td>
                          <td>{time}</td>
                          <td>{inst}</td>
                          <td>{loc}</td>
                          <td>{t('enrollmentStatusActive')}</td>
                          <td className="portal-course-section-schedule-col-action">
                            <div className="portal-stack" style={{ gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="portal-btn portal-btn--course-search-bin"
                                disabled={
                                  !withdrawEligibility.withdrawAllowed || submitting || code === ''
                                }
                                onClick={() => void handleWithdraw(row)}
                              >
                                {submitting ? t('withdrawingEllipsis') : t('withdrawButton')}
                              </button>
                              {rowErr != null && rowErr !== '' ? (
                                <span className="portal-text-muted" style={{ fontSize: '0.85rem' }}>
                                  {rowErr}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

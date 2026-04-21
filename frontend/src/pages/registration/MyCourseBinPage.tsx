import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '../../context/AccountContext'
import {
  fetchAcademicTerms,
  fetchCurrentAcademicTerm,
  fetchStudentEnrolledSections,
  postStudentWithdraw,
  type AcademicTerm,
  type AdminCourseSection,
} from '../../lib/api'
import { getPreferredCourseTitle } from '../../lib/courseDisplayName'
import { formatTimeRangeHmsForDisplay } from '../../lib/formatScheduleTime'
import { formatPrerequisiteCourseDisplay } from '../../lib/prerequisiteCourse'
import { formatWeekdaysShortFromStored } from '../../lib/weekdaySchedule'
import {
  courseBinSectionKey,
  useCourseBin,
  type CourseBinItem,
} from './CourseBinContext'
import { useRegistrationTermSearchParam } from './registrationTermSearch'

function binRowKey(item: CourseBinItem): string {
  return courseBinSectionKey(item.course_code, item.section, item.schedule_track)
}

function prerequisiteText(item: CourseBinItem, label: string): string | null {
  const display = formatPrerequisiteCourseDisplay({
    courseCode: item.prerequisite_course_code,
    courseTitle: item.prerequisite_course_title,
  })
  return display ? `${label}: ${display}` : null
}

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

export function MyCourseBinPage() {
  const t = useStudentPortalT()
  const registrationTermId = useRegistrationTermSearchParam()
  const { currentStudentId, isAuthenticated } = useAccount()
  const navigate = useNavigate()
  const location = useLocation()
  const { items, removeFromCourseBin } = useCourseBin()
  const hasItems = items.length > 0
  const [registeredSections, setRegisteredSections] = useState<AdminCourseSection[]>([])
  const [registeredLoadState, setRegisteredLoadState] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  )
  const [registeredLoadError, setRegisteredLoadError] = useState<string | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<AcademicTerm | null>(null)
  const [withdrawingSectionId, setWithdrawingSectionId] = useState<number | null>(null)
  const [rowErrorBySectionId, setRowErrorBySectionId] = useState<Record<number, string>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const termKey = registrationTermId?.trim() ?? ''
  const studentKey = currentStudentId?.trim() ?? ''
  const termMissing = registrationTermId == null || registrationTermId.trim() === ''

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

  const loadRegisteredWorkspace = useCallback(async () => {
    if (termKey === '' || studentKey === '' || !isAuthenticated) {
      setRegisteredSections([])
      setSelectedTerm(null)
      setRegisteredLoadState('idle')
      setRegisteredLoadError(null)
      return
    }
    const ac = new AbortController()
    setRegisteredLoadState('loading')
    setRegisteredLoadError(null)
    try {
      const [current, allTerms, enrolled] = await Promise.all([
        fetchCurrentAcademicTerm({ signal: ac.signal }),
        fetchAcademicTerms({ signal: ac.signal }),
        fetchStudentEnrolledSections(studentKey, termKey, { signal: ac.signal }).then(
          (r) => r.sections,
        ),
      ])
      if (ac.signal.aborted) return
      setSelectedTerm(resolveTermForSelectedId(termKey, current, allTerms))
      setRegisteredSections(enrolled)
      setRegisteredLoadState('idle')
    } catch (e) {
      if (ac.signal.aborted) return
      setRegisteredSections([])
      setSelectedTerm(null)
      setRegisteredLoadState('error')
      setRegisteredLoadError(e instanceof Error ? e.message : t('couldNotLoadAddDropData'))
    }
  }, [isAuthenticated, studentKey, t, termKey])

  const refetchRegisteredSectionsOnly = useCallback(async () => {
    if (termKey === '' || studentKey === '' || !isAuthenticated) return
    try {
      const { sections } = await fetchStudentEnrolledSections(studentKey, termKey)
      setRegisteredSections(sections)
    } catch {
      /* keep existing table; user can retry full reload */
    }
  }, [isAuthenticated, studentKey, termKey])

  useEffect(() => {
    void loadRegisteredWorkspace()
  }, [loadRegisteredWorkspace])

  const handleWithdraw = useCallback(
    async (row: AdminCourseSection) => {
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
        await refetchRegisteredSectionsOnly()
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('withdrawalFailedGeneric')
        setRowErrorBySectionId((prev) => ({ ...prev, [sectionId]: msg }))
      } finally {
        setWithdrawingSectionId(null)
      }
    },
    [refetchRegisteredSectionsOnly, studentKey, t, termKey, withdrawEligibility.withdrawAllowed],
  )

  const handleCheckout = () => {
    navigate({
      pathname: '/registration/checkout',
      search: location.search,
    })
  }

  return (
    <main
      className="portal-page portal-course-bin-page"
      data-registration-term={registrationTermId ?? undefined}
    >
      <section className="portal-card portal-stack" aria-labelledby="course-bin-heading">
        <div className="portal-course-bin-card-header">
          <div className="portal-course-bin-card-header-text">
            <h2 id="course-bin-heading" className="portal-section-heading">
              {t('myCourseBin')}
            </h2>
            <p className="portal-page-lede portal-course-bin-lede">{t('myCourseBinLede')}</p>
          </div>
          <div className="portal-course-bin-card-header-actions">
            <button
              type="button"
              className="portal-btn portal-btn--primary portal-btn--compact"
              disabled={!hasItems}
              onClick={handleCheckout}
            >
              {t('checkoutButton')}
            </button>
          </div>
        </div>

        <div className="portal-course-search-sections-table-wrap portal-course-search-sections-table-wrap--schedule">
          <div className="portal-course-search-sections-table-scroll">
            <table className="portal-table portal-table--course-sections portal-table--course-section-schedule portal-table--course-bin">
              <caption className="visually-hidden">{t('courseBinTableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('courseColCourse')}</th>
                  <th scope="col">{t('sectionColSection')}</th>
                  <th scope="col">{t('sectionColSession')}</th>
                  <th scope="col">{t('sectionColType')}</th>
                  <th scope="col">{t('sectionColUnits')}</th>
                  <th scope="col">{t('sectionColRegistered')}</th>
                  <th scope="col">{t('sectionColTime')}</th>
                  <th scope="col">{t('sectionColDays')}</th>
                  <th scope="col">{t('sectionColInstructor')}</th>
                  <th scope="col">{t('sectionColLocation')}</th>
                  <th scope="col" className="portal-course-section-schedule-col-action">
                    {t('tableColAction')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const prerequisite = prerequisiteText(item, t('prerequisiteLabel'))
                  return (
                    <tr key={binRowKey(item)}>
                      <td>
                        <div className="portal-course-bin-course-cell">
                          <span className="portal-course-bin-course-code">{item.course_code.trim() || '—'}</span>
                          <span className="portal-course-bin-course-title">
                            {getPreferredCourseTitle(
                              {
                                code: item.course_code,
                                eng_name: item.eng_name,
                                chi_name: item.chi_name,
                              },
                              item.schedule_track,
                            )}
                          </span>
                          {prerequisite ? (
                            <span className="portal-text-muted">{prerequisite}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{item.section}</td>
                      <td>{item.session}</td>
                      <td>{item.type}</td>
                      <td>{item.units}</td>
                      <td>{item.registered}</td>
                      <td>{item.time}</td>
                      <td>{item.days}</td>
                      <td>{item.instructor}</td>
                      <td>{item.location}</td>
                      <td className="portal-course-section-schedule-col-action">
                        <button
                          type="button"
                          className="portal-btn portal-btn--course-search-bin"
                          onClick={() =>
                            removeFromCourseBin(
                              item.course_code,
                              item.section,
                              item.schedule_track,
                            )
                          }
                        >
                          {t('removedFromCourseBin')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isAuthenticated && !termMissing && (
        <section className="portal-card portal-stack" aria-labelledby="course-bin-registered-heading">
          <h2 id="course-bin-registered-heading" className="portal-section-heading">
            {t('yourCoursesHeading')}
          </h2>
          <p className="portal-text-muted" style={{ marginTop: 0 }}>
            {t('addDropPageLede')}
          </p>

          {registeredLoadState === 'loading' ? (
            <p className="portal-text-muted" role="status">
              {t('addDropLoadingCourses')}
            </p>
          ) : null}

          {registeredLoadState === 'error' ? (
            <>
              <p className="portal-text-muted" role="status">
                {registeredLoadError ?? t('somethingWentWrong')}
              </p>
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--compact"
                onClick={() => void loadRegisteredWorkspace()}
              >
                {t('retry')}
              </button>
            </>
          ) : null}

          {registeredLoadState === 'idle' ? (
            <>
              {!withdrawEligibility.withdrawAllowed ? (
                <p className="portal-inline-note portal-inline-note--flush" role="status">
                  {withdrawEligibility.reasonWhenDisabled}
                </p>
              ) : null}

              {successMessage != null ? (
                <p className="portal-inline-note portal-inline-note--flush" role="status">
                  {successMessage}
                </p>
              ) : null}

              {registeredSections.length === 0 ? (
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
                        {registeredSections.map((row) => {
                          const code = row.course_code.trim()
                          const title = getPreferredCourseTitle(
                            {
                              code: row.course_code,
                              eng_name: row.course_code,
                              chi_name: null,
                            },
                            row.schedule_track,
                          )
                          const daysRaw = formatWeekdaysShortFromStored(row.weekday)
                          const timeRaw = formatTimeRangeHmsForDisplay(row.start_time, row.end_time)
                          const tba = t('scheduleTba')
                          const days = daysRaw === '—' ? tba : daysRaw
                          const time = timeRaw === '—' ? tba : timeRaw
                          const inst =
                            row.instructor?.trim() && row.instructor.trim() !== ''
                              ? row.instructor.trim()
                              : tba
                          const loc = row.room?.trim() && row.room.trim() !== '' ? row.room.trim() : tba
                          const rowErr = rowErrorBySectionId[row.id]
                          const submitting = withdrawingSectionId === row.id
                          return (
                            <tr key={row.id}>
                              <td>
                                <div className="portal-course-bin-course-cell">
                                  <span className="portal-course-bin-course-code">{code || '—'}</span>
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
                                    disabled={!withdrawEligibility.withdrawAllowed || submitting || code === ''}
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
            </>
          ) : null}
        </section>
      )}
    </main>
  )
}

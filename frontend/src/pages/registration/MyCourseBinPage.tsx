import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLanguage, useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '../../context/AccountContext'
import {
  fetchAcademicTerms,
  fetchCurrentAcademicTerm,
  fetchStudentEnrolledSections,
  postStudentWithdraw,
  type AcademicTerm,
  type AdminCourseSection,
} from '../../lib/api'
import { currentTermLabel } from '../../lib/academicCourseRecordsDisplay'
import { getPreferredCourseTitle } from '../../lib/courseDisplayName'
import { PORTAL_STUDENT_ENROLLMENT_CHANGED } from '../../lib/portalStudentEnrollmentEvents'
import { formatPrerequisiteCourseDisplay } from '../../lib/prerequisiteCourse'
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

function formatWithdrawDeadlineForDisplay(
  raw: string | null | undefined,
  locale: 'en' | 'zh',
): string | null {
  const ymd = raw?.trim().slice(0, 10) ?? ''
  if (ymd === '' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  const d = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(locale === 'zh' ? 'zh-TW' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function MyCourseBinPage() {
  const t = useStudentPortalT()
  const { locale } = useLanguage()
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
  const [dropTarget, setDropTarget] = useState<AdminCourseSection | null>(null)

  const termKey = registrationTermId?.trim() ?? ''
  const studentKey = currentStudentId?.trim() ?? ''
  const termMissing = registrationTermId == null || registrationTermId.trim() === ''

  const withdrawDeadlineDisplay = useMemo(
    () => formatWithdrawDeadlineForDisplay(selectedTerm?.withdraw_deadline, locale),
    [locale, selectedTerm?.withdraw_deadline],
  )

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

  useEffect(() => {
    if (dropTarget == null) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setDropTarget(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dropTarget])

  const confirmDrop = useCallback(async () => {
    const row = dropTarget
    if (row == null) return
    const code = row.course_code.trim()
    const sectionId = row.id
    if (code === '' || termKey === '' || studentKey === '' || sectionId <= 0) return

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
        setDropTarget(null)
        return
      }
      setDropTarget(null)
      setSuccessMessage(t('courseDroppedSuccess'))
      window.setTimeout(() => setSuccessMessage(null), 4000)
      window.dispatchEvent(new Event(PORTAL_STUDENT_ENROLLMENT_CHANGED))
      await refetchRegisteredSectionsOnly()
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('withdrawalFailedGeneric')
      setRowErrorBySectionId((prev) => ({ ...prev, [sectionId]: msg }))
      setDropTarget(null)
    } finally {
      setWithdrawingSectionId(null)
    }
  }, [dropTarget, refetchRegisteredSectionsOnly, studentKey, t, termKey])

  const handleCheckout = () => {
    navigate({
      pathname: '/registration/checkout',
      search: location.search,
    })
  }

  const dropModalTitleId = 'course-bin-drop-modal-title'

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
            <p className="portal-text-muted" style={{ marginTop: '-0.25rem' }}>
              {t('myCourseBinNotRegisteredHint')}
            </p>
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
                          {t('courseBinRemoveButton')}
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
        <section className="portal-card portal-stack" aria-labelledby="registered-courses-heading">
          <h2 id="registered-courses-heading" className="portal-section-heading">
            {t('registeredCoursesHeading')}
          </h2>
          <p className="portal-text-muted" style={{ marginTop: 0 }}>
            {t('registeredCoursesLede')}
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
                      <caption className="visually-hidden">{t('registeredCoursesTableCaption')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('courseColCourse')}</th>
                          <th scope="col">{t('sectionColSection')}</th>
                          <th scope="col">{t('registeredColTerm')}</th>
                          <th scope="col">{t('sectionColUnits')}</th>
                          <th scope="col">{t('registeredColStatus')}</th>
                          <th scope="col">{t('registeredColGrade')}</th>
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
                              eng_name: row.course_title ?? row.course_code,
                              chi_name: null,
                            },
                            row.schedule_track,
                          )
                          const termLabel = currentTermLabel({ term: row.term, year: row.year })
                          const unitsDisplay =
                            row.units != null && Number.isFinite(row.units) ? String(row.units) : '—'
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
                              <td>{termLabel}</td>
                              <td>{unitsDisplay}</td>
                              <td>{t('enrollmentStatusActive')}</td>
                              <td>{t('registeredCourseGradePlaceholder')}</td>
                              <td className="portal-course-section-schedule-col-action">
                                <div className="portal-stack" style={{ gap: '0.35rem' }}>
                                  <button
                                    type="button"
                                    className="portal-btn portal-btn--course-search-bin"
                                    disabled={submitting || code === ''}
                                    onClick={() => setDropTarget(row)}
                                  >
                                    {t('dropCourseButton')}
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

      {dropTarget != null ? (
        <div
          className="portal-offered-section-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDropTarget(null)
          }}
        >
          <div
            className="portal-offered-section-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dropModalTitleId}
          >
            <h2 id={dropModalTitleId} className="portal-offered-section-modal__title">
              {t('dropCourseModalTitle')}
            </h2>
            <dl className="portal-offered-section-modal__dl">
              <div>
                <dt>{t('dropCourseModalCourseLabel')}</dt>
                <dd>{dropTarget.course_code.trim() || '—'}</dd>
              </div>
              <div>
                <dt>{t('dropCourseModalSectionLabel')}</dt>
                <dd>{dropTarget.section_code.trim() || '—'}</dd>
              </div>
              <div>
                <dt>{t('dropCourseModalTermLabel')}</dt>
                <dd>{currentTermLabel({ term: dropTarget.term, year: dropTarget.year })}</dd>
              </div>
              <div>
                <dt>{t('dropCourseModalUnitsLabel')}</dt>
                <dd>
                  {dropTarget.units != null && Number.isFinite(dropTarget.units)
                    ? String(dropTarget.units)
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>{t('dropCourseModalWithdrawDeadlineLabel')}</dt>
                <dd>
                  {withdrawDeadlineDisplay != null && withdrawDeadlineDisplay !== ''
                    ? withdrawDeadlineDisplay
                    : t('dropCourseModalWithdrawDeadlineNotSet')}
                </dd>
              </div>
            </dl>
            <p className="portal-text-muted" style={{ margin: '0.75rem 0 0' }}>
              {t('dropCourseModalWWarning')}
            </p>
            <div className="portal-offered-section-modal__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={withdrawingSectionId === dropTarget.id}
                onClick={() => setDropTarget(null)}
              >
                {t('dropCourseModalCancel')}
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--primary portal-btn--compact"
                disabled={withdrawingSectionId === dropTarget.id}
                onClick={() => void confirmDrop()}
              >
                {withdrawingSectionId === dropTarget.id ? t('droppingEllipsis') : t('dropCourseModalConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

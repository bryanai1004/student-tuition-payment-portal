import { useCallback, useEffect, useId, useState } from 'react'
import { useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '../../context/AccountContext'
import { PORTAL_STUDENT_ENROLLMENT_CHANGED } from '../../lib/portalStudentEnrollmentEvents'
import { getPreferredCourseTitle } from '../../lib/courseDisplayName'
import { formatPrerequisiteCourseDisplay } from '../../lib/prerequisiteCourse'
import { courseBinSectionKey, type CourseBinItem } from './CourseBinContext'
import { registerFromCourseBinItems } from './registerFromCourseBinItems'
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

function sectionSubtitle(item: CourseBinItem): string {
  return item.session.trim() !== ''
    ? item.session.trim()
    : item.type.trim() !== ''
      ? item.type.trim()
      : '—'
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  )
}

function OptionsHeaderIcon() {
  return (
    <span className="portal-class-plan-options-modal__header-icon" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" focusable="false">
        <circle cx="12" cy="12" r="10" fill="#1f5582" />
        <path fill="#fff" d="M11 10h2v8h-2v-8zm0-4h2v2h-2V6z" />
      </svg>
    </span>
  )
}

export type ClassPlanPanelProps = {
  items: CourseBinItem[]
  /** Keys from {@link courseBinSectionKey} / enrolled API rows for this term. */
  enrolledKeys: Set<string>
  removeFromCourseBin: (
    courseCode: string,
    section: string,
    scheduleTrack?: 'EN' | 'CN',
  ) => void
  showToast: (message: string) => void
}

export function ClassPlanPanel({
  items,
  enrolledKeys,
  removeFromCourseBin,
  showToast,
}: ClassPlanPanelProps) {
  const t = useStudentPortalT()
  const registrationTermId = useRegistrationTermSearchParam()
  const { currentStudentId, isAuthenticated, reload: reloadStudentAccount } = useAccount()
  const dialogTitleId = useId()
  const [optionsFor, setOptionsFor] = useState<CourseBinItem | null>(null)
  const [enrollBusy, setEnrollBusy] = useState(false)
  const hasItems = items.length > 0

  const termMissing = registrationTermId == null || registrationTermId.trim() === ''

  const onEnrollThisSection = useCallback(async () => {
    if (optionsFor == null) return
    if (enrolledKeys.has(binRowKey(optionsFor))) {
      showToast(t('offeredAlreadyEnrolledToast'))
      return
    }
    if (termMissing) {
      showToast(t('checkoutErrorSelectTerm'))
      return
    }
    if (!isAuthenticated || !currentStudentId?.trim()) {
      showToast(t('checkoutErrorSignIn'))
      return
    }
    setEnrollBusy(true)
    try {
      const res = await registerFromCourseBinItems({
        studentId: currentStudentId,
        academicTermId: registrationTermId.trim(),
        items: [optionsFor],
        t,
      })
      if (!res.ok) {
        showToast(res.message)
        return
      }
      reloadStudentAccount()
      window.dispatchEvent(new Event(PORTAL_STUDENT_ENROLLMENT_CHANGED))
      const msg =
        res.insertedCount === 0
          ? t('checkoutSuccessAlreadyEnrolled')
          : t('checkoutSuccessAddedCount').replace('{n}', String(res.insertedCount))
      showToast(msg)
      removeFromCourseBin(
        optionsFor.course_code,
        optionsFor.section,
        optionsFor.schedule_track,
      )
      setOptionsFor(null)
    } finally {
      setEnrollBusy(false)
    }
  }, [
    currentStudentId,
    isAuthenticated,
    optionsFor,
    registrationTermId,
    reloadStudentAccount,
    removeFromCourseBin,
    showToast,
    t,
    termMissing,
    enrolledKeys,
  ])

  useEffect(() => {
    if (optionsFor == null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOptionsFor(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [optionsFor])

  const closeOptions = () => setOptionsFor(null)

  const optionsCourseTitle =
    optionsFor != null
      ? getPreferredCourseTitle(
          {
            code: optionsFor.course_code,
            eng_name: optionsFor.eng_name,
            chi_name: optionsFor.chi_name,
          },
          optionsFor.schedule_track,
        )
      : ''
  const optionsCode = optionsFor != null ? optionsFor.course_code.trim() || '—' : ''
  const optionsSectionLine =
    optionsFor != null
      ? t('registrationPlanSectionLine')
          .replace('{section}', optionsFor.section.trim() || '—')
          .replace('{subtitle}', sectionSubtitle(optionsFor))
      : ''

  const optionsEnrolled = optionsFor != null && enrolledKeys.has(binRowKey(optionsFor))

  return (
    <div className="portal-registration-class-plan portal-class-plan-v2">
      {!hasItems ? (
        <p className="portal-text-muted" role="status">
          {t('registrationPlanClassPlanEmpty')}
        </p>
      ) : (
        <>
          <div className="portal-class-plan-cards" role="list">
            {items.map((item, index) => {
              const key = binRowKey(item)
              const rowEnrolled = enrolledKeys.has(key)
              const code = item.course_code.trim() || '—'
              const title = getPreferredCourseTitle(
                {
                  code: item.course_code,
                  eng_name: item.eng_name,
                  chi_name: item.chi_name,
                },
                item.schedule_track,
              )
              const subtitle = sectionSubtitle(item)
              const prerequisite = prerequisiteText(item, t('prerequisiteLabel'))
              const cardTitle = t('registrationPlanCardTitle')
                .replace('{n}', String(index + 1))
                .replace('{code}', code)
                .replace('{title}', title)
              const sectionLine = t('registrationPlanSectionLine')
                .replace('{section}', item.section.trim() || '—')
                .replace('{subtitle}', subtitle)

              return (
                <article key={key} className="portal-class-plan-card" role="listitem">
                  <header className="portal-class-plan-card__header">
                    <div className="portal-class-plan-card__heading-block">
                      <h3 className="portal-class-plan-card__title">{cardTitle}</h3>
                      <p className="portal-class-plan-card__section-line">{sectionLine}</p>
                      {prerequisite ? (
                        <p className="portal-text-muted portal-class-plan-card__meta">{prerequisite}</p>
                      ) : null}
                      <p className="portal-text-muted portal-class-plan-card__final">
                        {t('registrationPlanFinalExamLine')}
                      </p>
                    </div>
                  </header>

                  <div className="portal-table-wrap portal-class-plan-card__table-wrap">
                    <table className="portal-table portal-class-plan-detail-table">
                      <caption className="visually-hidden">
                        {t('registrationPlanClassDetailCaption').replace('{code}', code)}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="portal-class-plan-detail-table__col-change">
                            {t('registrationPlanColChange')}
                          </th>
                          <th scope="col">{t('sectionColSection')}</th>
                          <th scope="col">{t('registrationPlanColStatus')}</th>
                          <th scope="col">{t('registrationPlanColInfo')}</th>
                          <th scope="col">{t('sectionColDays')}</th>
                          <th scope="col">{t('sectionColTime')}</th>
                          <th scope="col">{t('sectionColLocation')}</th>
                          <th scope="col">{t('sectionColUnits')}</th>
                          <th scope="col">{t('sectionColInstructor')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="portal-class-plan-detail-table__col-change">
                            <button
                              type="button"
                              className="portal-class-plan-change-btn"
                              title={t('registrationPlanChangeButtonTitle')}
                              aria-label={t('registrationPlanColChange')}
                              aria-haspopup="dialog"
                              aria-expanded={optionsFor != null && binRowKey(optionsFor) === key}
                              onClick={() => setOptionsFor(item)}
                            >
                              <PencilIcon />
                            </button>
                          </td>
                          <td>{item.section.trim() || '—'}</td>
                          <td>
                            <span
                              className={[
                                'portal-class-plan-status',
                                rowEnrolled
                                  ? 'portal-class-plan-status--enrolled'
                                  : 'portal-class-plan-status--plan',
                              ].join(' ')}
                            >
                              {rowEnrolled
                                ? t('registrationPlanStatusEnrolled')
                                : t('registrationPlanStatusInPlan')}
                            </span>
                          </td>
                          <td>
                            <span
                              className="portal-class-plan-info-badge"
                              title={t('registrationPlanInfoBadgeTitle')}
                              aria-hidden
                            >
                              i
                            </span>
                          </td>
                          <td>{item.days.trim() || '—'}</td>
                          <td>{item.time.trim() || '—'}</td>
                          <td>{item.location.trim() || '—'}</td>
                          <td>{item.units.trim() || '—'}</td>
                          <td>{item.instructor.trim() || '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              )
            })}
          </div>

          <p
            className="portal-text-muted portal-registration-class-plan__enrollment-note"
            style={{ marginTop: '0.75rem' }}
          >
            {t('registrationPlanEnrollmentNote')}
          </p>
        </>
      )}

      {optionsFor != null ? (
        <div
          className="portal-offered-section-modal-backdrop portal-class-plan-options-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeOptions()
          }}
        >
          <div
            className="portal-offered-section-modal portal-class-plan-options-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
          >
            <div className="portal-class-plan-options-modal__header">
              <OptionsHeaderIcon />
              <h2 id={dialogTitleId} className="portal-class-plan-options-modal__header-title">
                {t('registrationPlanOptionsModalTitle')}
              </h2>
            </div>
            <div className="portal-class-plan-options-modal__body">
              <p className="portal-class-plan-options-modal__lead">
                {t('registrationPlanOptionsModalCourseLead')
                  .replace('{code}', optionsCode)
                  .replace('{title}', optionsCourseTitle)}
              </p>
              <p className="portal-text-muted portal-class-plan-options-modal__section-label">
                {t('registrationPlanOptionsModalSectionsIntro')}
              </p>
              <ul className="portal-class-plan-options-modal__section-list">
                <li>{optionsSectionLine}</li>
              </ul>
              <p className="portal-class-plan-options-modal__enroll-hint">
                {optionsEnrolled
                  ? t('offeredModalAlreadyEnrolledNote')
                  : t('registrationPlanOptionsModalEnrollLead')}
              </p>
            </div>
            <div className="portal-class-plan-options-modal__footer">
              <div className="portal-class-plan-options-modal__footer-main">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary portal-btn--compact"
                  disabled={enrollBusy}
                  onClick={() => {
                    removeFromCourseBin(
                      optionsFor.course_code,
                      optionsFor.section,
                      optionsFor.schedule_track,
                    )
                    closeOptions()
                  }}
                >
                  {t('registrationPlanOptionsModalRemoveFromPlanner')}
                </button>
                <button
                  type="button"
                  className="portal-btn portal-btn--primary portal-btn--compact"
                  disabled={
                    enrollBusy ||
                    optionsEnrolled ||
                    termMissing ||
                    !isAuthenticated ||
                    !currentStudentId?.trim()
                  }
                  onClick={() => void onEnrollThisSection()}
                >
                  {enrollBusy ? t('registeringEllipsis') : t('enroll')}
                </button>
              </div>
              <button type="button" className="portal-btn portal-btn--secondary portal-btn--compact" onClick={closeOptions}>
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

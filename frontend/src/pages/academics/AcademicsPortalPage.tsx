import { useEffect, useMemo, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useLanguage, useStudentPortalT } from '../../LanguageContext'
import type { PortalLocale } from '../../lib/i18n'
import {
  fetchStudentAcademics,
  postStudentWithdraw,
  fetchStudentTranscriptPreview,
  fetchStudentProgramProgress,
  type StudentAcademicsResponse,
  type StudentTranscriptPreviewResponse,
  type StudentProgramProgressResponse,
} from '../../lib/api'
import { ProgramProgressPanel } from '../../components/academics/ProgramProgressPanel'
import { CourseFeedbackCell } from '../../components/academics/CourseFeedbackCell'
import { CourseFeedbackModal } from '../../components/academics/CourseFeedbackModal'
import {
  academicStatusLabel,
  formatCreditsCell,
  formatGradeCell,
} from '../../lib/academicCourseRecordsDisplay'
import {
  courseRowDisplayTitle,
  formatCreditCell,
  groupRowsByTermYear,
  groupTranscriptByTermYear,
  termYearKey,
} from '../../lib/academicsTranscriptDisplay'

type AcademicsTab = 'history' | 'transcript'

type EnrollmentHistoryRow = StudentAcademicsResponse['enrollmentHistory'][number]

function formatIssueDate(locale: PortalLocale): string {
  const loc = locale === 'zh' ? 'zh-Hant' : 'en-US'
  try {
    return new Date().toLocaleDateString(loc, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

const GRADES_TABLE_CLASS =
  'portal-table portal-table--grades portal-academics-portal-grades-table'

const REGISTRATION_HISTORY_TABLE_CLASS = `${GRADES_TABLE_CLASS} portal-academics-registration-history-table`

function instructorCell(v: string | null | undefined, dash: string): string {
  const s = v?.trim()
  return s && s.length > 0 ? s : dash
}

function hasFinalGrade(grade: string | null | undefined): boolean {
  const g = grade?.trim()
  return g != null && g !== ''
}

function canShowWithdraw(row: EnrollmentHistoryRow): boolean {
  if (row.canWithdraw !== true) return false
  if ((row.sectionId ?? null) == null) return false
  if ((row.academicTermId ?? '').trim() === '') return false
  if (hasFinalGrade(row.grade)) return false
  const status = (row.status ?? '').trim().toLowerCase()
  return !['completed', 'withdrawn', 'dropped'].includes(status)
}

export function AcademicsPortalPage() {
  const { locale } = useLanguage()
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const dash = t('dashEm')
  const [tab, setTab] = useState<AcademicsTab>('history')
  const [academics, setAcademics] = useState<StudentAcademicsResponse | null>(null)
  const [academicsError, setAcademicsError] = useState<string | null>(null)
  const [academicsLoading, setAcademicsLoading] = useState(false)
  const [transcriptPreview, setTranscriptPreview] =
    useState<StudentTranscriptPreviewResponse | null>(null)
  const [transcriptPreviewError, setTranscriptPreviewError] = useState<string | null>(null)
  const [transcriptPreviewLoading, setTranscriptPreviewLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [feedbackModal, setFeedbackModal] = useState<
    | { mode: 'submit'; row: EnrollmentHistoryRow }
    | { mode: 'view'; row: EnrollmentHistoryRow }
    | null
  >(null)
  const [selectedRegistrationTermKey, setSelectedRegistrationTermKey] = useState('')
  const [withdrawTarget, setWithdrawTarget] = useState<EnrollmentHistoryRow | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [programProgress, setProgramProgress] = useState<StudentProgramProgressResponse | null>(null)
  const [programProgressError, setProgramProgressError] = useState<string | null>(null)
  const [programProgressLoading, setProgramProgressLoading] = useState(false)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setAcademics(null)
      setAcademicsError(null)
      setAcademicsLoading(false)
      setTranscriptPreview(null)
      setTranscriptPreviewError(null)
      setTranscriptPreviewLoading(false)
      setProgramProgress(null)
      setProgramProgressError(null)
      setProgramProgressLoading(false)
      return
    }

    const ac = new AbortController()
    setAcademics(null)
    setAcademicsError(null)
    setAcademicsLoading(true)
    setTranscriptPreview(null)
    setTranscriptPreviewError(null)
    setTranscriptPreviewLoading(true)
    setProgramProgress(null)
    setProgramProgressError(null)
    setProgramProgressLoading(true)

    void (async () => {
      try {
        const data = await fetchStudentAcademics(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setAcademics(data)
        setAcademicsError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setAcademics(null)
        setAcademicsError(
          e instanceof Error ? e.message : t('couldNotLoadAcademicRecordsFallback'),
        )
      } finally {
        if (!ac.signal.aborted) setAcademicsLoading(false)
      }

      if (ac.signal.aborted) return

      try {
        const data = await fetchStudentTranscriptPreview(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setTranscriptPreview(data)
        setTranscriptPreviewError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setTranscriptPreview(null)
        setTranscriptPreviewError(
          e instanceof Error ? e.message : t('couldNotLoadTranscriptPreviewFallback'),
        )
      } finally {
        if (!ac.signal.aborted) setTranscriptPreviewLoading(false)
      }

      if (ac.signal.aborted) return

      try {
        const data = await fetchStudentProgramProgress(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setProgramProgress(data)
        setProgramProgressError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setProgramProgress(null)
        setProgramProgressError(
          e instanceof Error ? e.message : t('couldNotLoadProgramProgress'),
        )
      } finally {
        if (!ac.signal.aborted) setProgramProgressLoading(false)
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, reloadKey, t])

  const registrationGroups = useMemo(
    () => (academics ? groupRowsByTermYear(academics.enrollmentHistory) : []),
    [academics],
  )
  const registrationTermOptions = useMemo(
    () =>
      registrationGroups.map((g) => ({
        key: termYearKey(g.term, g.year),
        label: `${g.term} ${g.year}`,
        term: g.term,
        year: g.year,
        rows: g.rows,
      })),
    [registrationGroups],
  )
  const selectedRegistrationGroup = useMemo(() => {
    if (registrationTermOptions.length === 0) return null
    return (
      registrationTermOptions.find((opt) => opt.key === selectedRegistrationTermKey) ??
      registrationTermOptions[0]!
    )
  }, [registrationTermOptions, selectedRegistrationTermKey])

  useEffect(() => {
    if (withdrawTarget == null) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !withdrawing) setWithdrawTarget(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [withdrawTarget, withdrawing])

  const confirmWithdraw = async () => {
    if (!currentStudentId || withdrawTarget == null) return
    const sectionId = withdrawTarget.sectionId
    const termId = withdrawTarget.academicTermId?.trim() ?? ''
    if (sectionId == null || sectionId <= 0 || termId === '') return
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      const res = await postStudentWithdraw({
        studentId: currentStudentId,
        academic_term_id: termId,
        course_section_id: sectionId,
      })
      if (!res.success || res.removedCount < 1) {
        setWithdrawError(t('withdrawalFailedGeneric'))
        return
      }
      setWithdrawTarget(null)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : t('withdrawalFailedGeneric'))
    } finally {
      setWithdrawing(false)
    }
  }

  const groupedPreview = useMemo(
    () =>
      transcriptPreview ? groupTranscriptByTermYear(transcriptPreview.transcript) : [],
    [transcriptPreview],
  )

  const id = currentStudentId?.trim()
  const showEmpty = !id
  const issueDate = formatIssueDate(locale)

  const academicsBlocking =
    academicsLoading && academics === null && academicsError === null
  const transcriptBlocking =
    transcriptPreviewLoading &&
    transcriptPreview === null &&
    transcriptPreviewError === null

  const showAcademicsError = academicsError != null && academics === null && !academicsLoading
  const showTranscriptError =
    transcriptPreviewError != null && transcriptPreview === null && !transcriptPreviewLoading

  useEffect(() => {
    if (registrationTermOptions.length === 0) {
      if (selectedRegistrationTermKey !== '') {
        setSelectedRegistrationTermKey('')
      }
      return
    }
    const hasSelected = registrationTermOptions.some(
      (opt) => opt.key === selectedRegistrationTermKey,
    )
    if (!hasSelected) {
      setSelectedRegistrationTermKey(registrationTermOptions[0]!.key)
    }
  }, [registrationTermOptions, selectedRegistrationTermKey])

  return (
    <main className="portal-page portal-stack">
      {id && feedbackModal ? (
        <CourseFeedbackModal
          key={`${feedbackModal.mode}-${feedbackModal.row.courseCode}-${feedbackModal.row.term}-${feedbackModal.row.year}`}
          mode={feedbackModal.mode}
          row={feedbackModal.row}
          studentId={id}
          onClose={() => setFeedbackModal(null)}
          onSubmitted={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
      {id && withdrawTarget ? (
        <div
          className="portal-offered-section-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !withdrawing) setWithdrawTarget(null)
          }}
        >
          <div className="portal-offered-section-modal" role="dialog" aria-modal="true">
            <h2 className="portal-offered-section-modal__title">
              Withdraw from {withdrawTarget.courseCode} - {courseRowDisplayTitle(withdrawTarget)}?
            </h2>
            <p className="portal-text-muted" style={{ margin: '0.75rem 0 0' }}>
              This will update the registration status and record a W grade if applicable.
            </p>
            {withdrawError ? (
              <p className="portal-text-muted" style={{ margin: '0.75rem 0 0' }}>
                {withdrawError}
              </p>
            ) : null}
            <div className="portal-offered-section-modal__actions">
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={withdrawing}
                onClick={() => setWithdrawTarget(null)}
              >
                {t('dropCourseModalCancel')}
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--compact"
                disabled={withdrawing}
                onClick={() => void confirmWithdraw()}
              >
                {withdrawing ? t('droppingEllipsis') : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className="portal-academics-print-hide portal-academics-sections-tabs"
        role="tablist"
        aria-label={t('academicsSectionsAria')}
      >
        <div className="portal-tab-group portal-academics-portal-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={['portal-tab', tab === 'history' ? 'portal-tab--active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('history')}
          >
            {t('tabRegistrationHistory')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'transcript'}
            className={['portal-tab', tab === 'transcript' ? 'portal-tab--active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('transcript')}
          >
            {t('transcriptHeading')}
          </button>
        </div>
      </div>

      {showEmpty ? (
        <section
          className="portal-card portal-profile-state"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">{t('signInToViewAcademics')}</p>
          <p className="portal-profile-state__detail">
            {t('academicsPortalSignInDetail')}
          </p>
        </section>
      ) : null}

      {!showEmpty && tab === 'history' ? (
        <>
          <div className="portal-stack portal-academics-program-progress-outer">
            <ProgramProgressPanel
              t={t}
              loading={programProgressLoading}
              error={programProgressError}
              progress={programProgress}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>
          {academicsBlocking ? (
            <section className="portal-card portal-profile-state" aria-busy="true" aria-live="polite">
              <p className="portal-profile-state__title">{t('loadingRegistrationHistory')}</p>
              <p className="portal-profile-state__detail">
                {t('loadingRegistrationHistoryEnrollmentDetail')}
              </p>
            </section>
          ) : null}
          {showAcademicsError ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
              aria-live="assertive"
            >
              <p className="portal-profile-state__title">{t('couldNotLoadRegistrationHistory')}</p>
              <p className="portal-profile-state__detail">{academicsError}</p>
              <div className="portal-actions portal-profile-state__actions">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  {t('tryAgain')}
                </button>
              </div>
            </section>
          ) : null}
          {!academicsBlocking && !showAcademicsError && academics ? (
            <section className="portal-stack portal-academics-registration-history" aria-label={t('registrationHistorySectionAria')}>
              {registrationGroups.length === 0 ? (
                <div className="portal-card portal-academics-empty-state" aria-live="polite">
                  <h2 className="portal-academics-empty-state__title">{t('noRegistrationHistoryTitle')}</h2>
                  <p className="portal-academics-empty-state__text">
                    {t('noRegistrationHistoryDetail')}
                  </p>
                </div>
              ) : (
                <>
                  {selectedRegistrationGroup ? (
                    <div
                      key={selectedRegistrationGroup.key}
                      className="portal-academics-registration-history-term"
                    >
                      <div className="portal-account-ledger__toolbar portal-academics-term-toolbar">
                        <label
                          className="portal-account-ledger__quarter-label"
                          htmlFor="registration-history-term-select"
                        >
                          <span className="portal-card-note">{t('term')}</span>
                          <select
                            id="registration-history-term-select"
                            className="portal-account-ledger__select"
                            value={selectedRegistrationTermKey}
                            onChange={(e) => setSelectedRegistrationTermKey(e.target.value)}
                          >
                            {registrationTermOptions.map((termOpt) => (
                              <option key={termOpt.key} value={termOpt.key}>
                                {termOpt.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="portal-table-wrap">
                        <table className={REGISTRATION_HISTORY_TABLE_CLASS}>
                          <thead>
                            <tr>
                              <th scope="col">{t('courseCode')}</th>
                              <th scope="col">{t('courseTitle')}</th>
                              <th scope="col">{t('credits')}</th>
                              <th scope="col">{t('status')}</th>
                              <th scope="col">{t('grade')}</th>
                              <th scope="col">{t('instructor')}</th>
                              <th scope="col">{t('courseFeedbackColumn')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRegistrationGroup.rows.map((row, idx) => (
                              <tr
                                key={`${row.courseCode}-${selectedRegistrationGroup.term}-${selectedRegistrationGroup.year}-${idx}`}
                              >
                                <td>{row.courseCode}</td>
                                <td className="portal-academics-course-title-cell">
                                  <span className="portal-academics-course-title__en">
                                    {courseRowDisplayTitle(row)}
                                  </span>
                                </td>
                                <td>{formatCreditsCell(row.credits)}</td>
                                <td>{academicStatusLabel(row.status, locale)}</td>
                                <td>{formatGradeCell(row.grade)}</td>
                                <td>{instructorCell(row.instructor, dash)}</td>
                                <td>
                                  <div className="portal-stack" style={{ gap: '0.35rem' }}>
                                    <CourseFeedbackCell
                                      row={row}
                                      onOpenSubmit={(r) =>
                                        setFeedbackModal({ mode: 'submit', row: r })
                                      }
                                      onOpenView={(r) => setFeedbackModal({ mode: 'view', row: r })}
                                    />
                                    {canShowWithdraw(row) ? (
                                      <button
                                        type="button"
                                        className="portal-btn portal-btn--secondary portal-btn--compact"
                                        onClick={() => {
                                          setWithdrawError(null)
                                          setWithdrawTarget(row)
                                        }}
                                      >
                                        Withdraw
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {!showEmpty && tab === 'transcript' ? (
        <>
          {transcriptBlocking ? (
            <section className="portal-card portal-profile-state" aria-busy="true" aria-live="polite">
              <p className="portal-profile-state__title">{t('loadingTranscript')}</p>
              <p className="portal-profile-state__detail">{t('transcriptLoadingDetail')}</p>
            </section>
          ) : null}
          {showTranscriptError ? (
            <section
              className="portal-card portal-profile-state portal-profile-state--error"
              role="alert"
              aria-live="assertive"
            >
              <p className="portal-profile-state__title">{t('couldNotLoadTranscript')}</p>
              <p className="portal-profile-state__detail">{transcriptPreviewError}</p>
              <div className="portal-actions portal-profile-state__actions">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  {t('tryAgain')}
                </button>
              </div>
            </section>
          ) : null}
          {!transcriptBlocking && !showTranscriptError && transcriptPreview ? (
            <div className="portal-academics-transcript-preview portal-stack">
              <div className="portal-academics-print-hide portal-academics-transcript-preview__actions">
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  onClick={() => window.print()}
                >
                  {t('printButton')}
                </button>
              </div>

              <div className="portal-academics-transcript-sheet">
                <header className="portal-academics-transcript-sheet__masthead">
                  <div className="portal-academics-transcript-sheet__masthead-inner">
                    <img
                      className="portal-academics-transcript-sheet__logo"
                      src="/AMULogo.png"
                      alt=""
                    />
                    <p className="portal-academics-transcript-sheet__school">{t('amuOfficialTranscriptSchoolName')}</p>
                    <p className="portal-academics-transcript-sheet__title">{t('unofficialTranscript')}</p>
                  </div>
                </header>

                <dl className="portal-academics-transcript-sheet__meta">
                  <div className="portal-academics-transcript-sheet__meta-row">
                    <dt>{t('studentName')}</dt>
                    <dd>{transcriptPreview.studentName}</dd>
                  </div>
                  <div className="portal-academics-transcript-sheet__meta-row">
                    <dt>{t('studentId')}</dt>
                    <dd>{transcriptPreview.studentId}</dd>
                  </div>
                  <div className="portal-academics-transcript-sheet__meta-row">
                    <dt>{t('dateIssued')}</dt>
                    <dd>{issueDate}</dd>
                  </div>
                </dl>

                {groupedPreview.length === 0 ? (
                  <p className="portal-card-note">{t('noTranscriptRows')}</p>
                ) : (
                  <div className="portal-academics-transcript-sheet__terms">
                    {groupedPreview.map((g) => (
                      <section
                        key={termYearKey(g.term, g.year)}
                        className="portal-academics-transcript-sheet__term-block"
                      >
                        <h3 className="portal-academics-transcript-sheet__term-heading">
                          {g.term} {g.year}
                        </h3>
                        <div className="portal-table-wrap">
                          <table
                            className={`${GRADES_TABLE_CLASS} portal-academics-transcript-sheet__table`}
                          >
                            <thead>
                              <tr>
                                <th scope="col">{t('tableCode')}</th>
                                <th scope="col">{t('courseTitle')}</th>
                                <th scope="col">{t('grade')}</th>
                                <th scope="col">{t('numeric')}</th>
                                <th scope="col">{t('credit')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.rows.map((row, idx) => (
                                <tr key={`${row.courseCode}-${g.term}-${g.year}-${idx}`}>
                                  <td>{row.courseCode}</td>
                                  <td className="portal-academics-course-title-cell">
                                    <span className="portal-academics-course-title__en">
                                      {courseRowDisplayTitle(row)}
                                    </span>
                                  </td>
                                  <td>{row.grade?.trim() ? row.grade : dash}</td>
                                  <td>
                                    {row.numericGrade != null && Number.isFinite(row.numericGrade)
                                      ? String(row.numericGrade)
                                      : dash}
                                  </td>
                                  <td>{formatCreditCell(row)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    ))}
                  </div>
                )}

                <section
                  className="portal-academics-transcript-sheet__cumulative"
                  aria-labelledby="transcript-cumulative-heading"
                >
                  <h3
                    id="transcript-cumulative-heading"
                    className="portal-academics-transcript-sheet__cumulative-heading"
                  >
                    {t('cumulativeTotal')}
                  </h3>
                  <dl className="portal-academics-transcript-sheet__cumulative-dl">
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>{t('unitsTransferred')}</dt>
                      <dd>45.0</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>{t('clinicHourTransferred')}</dt>
                      <dd>100 Hours</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>{t('unitsCompleted')}</dt>
                      <dd>198.0</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>{t('clinicCompleted')}</dt>
                      <dd>980 Hours</dd>
                    </div>
                    <div className="portal-academics-transcript-sheet__cumulative-row">
                      <dt>{t('gpa')}</dt>
                      <dd>3.76</dd>
                    </div>
                  </dl>
                </section>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  )
}

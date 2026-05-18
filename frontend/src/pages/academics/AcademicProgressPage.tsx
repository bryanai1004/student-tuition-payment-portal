import { useEffect, useState } from 'react'
import { ProgramProgressPanel } from '../../components/academics/ProgramProgressPanel'
import { useAccount } from '../../context/AccountContext'
import { useStudentPortalT } from '../../LanguageContext'
import {
  fetchStudentProgramProgress,
  type StudentProgramProgressResponse,
} from '../../lib/api'

const MILESTONE_KEYS = [
  { labelKey: 'milestonePreClinicalCore' as const, statusKey: 'milestoneStatusInProgress' as const },
  { labelKey: 'milestoneUsmleStep1' as const, statusKey: 'milestoneStatusUpcoming' as const },
  { labelKey: 'milestoneClinicalRotationsCore' as const, statusKey: 'milestoneStatusNotStarted' as const },
]

export function AcademicProgressPage() {
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const studentId = currentStudentId?.trim() ?? ''

  const [progress, setProgress] = useState<StudentProgramProgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!studentId) {
      setProgress(null)
      setLoading(false)
      setError(null)
      return
    }
    const ac = new AbortController()
    setProgress(null)
    setError(null)
    setLoading(true)
    void (async () => {
      try {
        const data = await fetchStudentProgramProgress(studentId, { signal: ac.signal })
        if (ac.signal.aborted) return
        setProgress(data)
      } catch (e) {
        if (ac.signal.aborted) return
        setProgress(null)
        setError(e instanceof Error ? e.message : t('couldNotLoadProgramProgress'))
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()
    return () => ac.abort()
  }, [studentId, reloadKey, t])

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">{t('academicProgressHeading')}</h2>
      <p className="portal-page-lede">{t('academicProgressLede')}</p>

      {!studentId ? (
        <section className="portal-card portal-profile-state" aria-live="polite">
          <p className="portal-profile-state__title">{t('signInToViewAcademics')}</p>
          <p className="portal-profile-state__detail">{t('academicsPortalSignInDetail')}</p>
        </section>
      ) : (
        <div className="portal-stack portal-academics-program-progress-outer">
          <ProgramProgressPanel
            t={t}
            loading={loading}
            error={error}
            progress={progress}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </div>
      )}

      <section className="portal-module-panel" aria-labelledby="milestones-heading">
        <h3 id="milestones-heading" className="portal-module-panel-heading">
          {t('requiredMilestones')}
        </h3>
        <ul className="portal-module-list">
          {MILESTONE_KEYS.map((m) => (
            <li key={m.labelKey} className="portal-module-list-item">
              <span className="portal-module-list-label">{t(m.labelKey)}</span>
              <span className="portal-module-list-badge">{t(m.statusKey)}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="portal-note">
        <strong>{t('progressComingLaterLabel')}</strong> {t('progressComingLaterDetail')}
      </p>
    </main>
  )
}

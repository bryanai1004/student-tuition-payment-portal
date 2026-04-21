import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import {
  fetchCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  type AcademicTerm,
} from '../../lib/api'
import {
  mergeTermOptions,
  pickDefaultRegistrationTermId,
  REGISTRATION_TERMS_LOAD_ERROR,
} from './registrationTermSearch'

export function RegistrationHomePage() {
  const t = useStudentPortalT()
  const actions = useMemo(
    () =>
      [
        {
          to: 'course-bin' as const,
          titleKey: 'regActionAddDropTitle' as const,
          descKey: 'regActionAddDropDesc' as const,
          appendTermQuery: true as const,
        },
        {
          to: 'offered-timetable' as const,
          titleKey: 'regActionCourseSearchTitle' as const,
          descKey: 'regActionCourseSearchDesc' as const,
          appendTermQuery: true as const,
        },
        {
          to: '/dashboard' as const,
          titleKey: 'regActionMyTimetableTitle' as const,
          descKey: 'regActionMyTimetableDesc' as const,
          appendTermQuery: false as const,
        },
        {
          to: 'form' as const,
          titleKey: 'regActionRegistrationFormTitle' as const,
          descKey: 'regActionRegistrationFormDesc' as const,
          appendTermQuery: true as const,
        },
        {
          to: 'status' as const,
          titleKey: 'regActionRegistrationStatusTitle' as const,
          descKey: 'regActionRegistrationStatusDesc' as const,
          appendTermQuery: true as const,
        },
      ] as const,
    [],
  )

  const [recentTerms, setRecentTerms] = useState<AcademicTerm[]>([])
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const options = useMemo(
    () => mergeTermOptions(recentTerms, currentTerm),
    [recentTerms, currentTerm],
  )

  useEffect(() => {
    const ac = new AbortController()
    setLoadState('loading')
    setLoadError(null)
    void (async () => {
      const recentP = fetchRecentAcademicTerms(3, { signal: ac.signal })
      const currentP = fetchCurrentAcademicTerm({ signal: ac.signal })
      const [recentR, currentR] = await Promise.allSettled([recentP, currentP])
      if (ac.signal.aborted) return

      let recent: AcademicTerm[] = []
      let current: AcademicTerm | null = null
      let anyRejected = false

      if (recentR.status === 'fulfilled') {
        recent = recentR.value
      } else {
        anyRejected = true
        console.error('[registration/home] recent terms failed', recentR.reason)
      }
      if (currentR.status === 'fulfilled') {
        current = currentR.value
      } else {
        anyRejected = true
        console.error('[registration/home] current term failed', currentR.reason)
      }

      setRecentTerms(recent)
      setCurrentTerm(current)
      const merged = mergeTermOptions(recent, current)
      setSelectedId(pickDefaultRegistrationTermId(merged, current))

      const haveAnyTerm = merged.length > 0
      if (!haveAnyTerm && anyRejected) {
        setLoadState('error')
        setLoadError(REGISTRATION_TERMS_LOAD_ERROR)
      } else {
        setLoadState('ready')
      }
    })()
    return () => ac.abort()
  }, [])

  const termQuery =
    selectedId.trim() !== '' ? `?term=${encodeURIComponent(selectedId.trim())}` : ''

  const termsErrorDisplay =
    loadError === REGISTRATION_TERMS_LOAD_ERROR
      ? t('registrationTermsLoadError')
      : (loadError ?? t('registrationCouldNotLoadTerms'))

  return (
    <main className="portal-page portal-stack">
      <section
        className="portal-module-panel portal-registration-term-panel"
        aria-labelledby="registration-term-heading"
      >
        <h2 id="registration-term-heading" className="portal-module-panel-heading">
          {t('registrationSelectTermHeading')}
        </h2>
        {loadState === 'loading' ? (
          <p className="portal-text-muted portal-registration-term-status" role="status">
            {t('registrationLoadingTermsShort')}
          </p>
        ) : null}
        {loadState === 'error' ? (
          <p className="portal-text-muted portal-registration-term-status" role="alert">
            {termsErrorDisplay}
          </p>
        ) : null}
        {loadState === 'ready' && options.length === 0 ? (
          <p className="portal-text-muted portal-registration-term-status" role="status">
            {t('registrationNoTermsAvailable')}
          </p>
        ) : null}
        {loadState === 'ready' && options.length > 0 ? (
          <>
            <div className="portal-registration-term-field">
              <label htmlFor="registration-term-select" className="portal-registration-term-label">
                {t('registrationTermFieldLabel')}
              </label>
              <select
                id="registration-term-select"
                className="portal-account-ledger__select portal-registration-term-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {options.map((termOpt) => (
                  <option key={termOpt.id} value={termOpt.id}>
                    {termOpt.term_label}
                  </option>
                ))}
              </select>
            </div>
            <p className="portal-text-muted portal-registration-term-hint">
              {t('registrationRecentTermsHint')}
            </p>
          </>
        ) : null}
      </section>

      <section className="portal-module-panel" aria-labelledby="registration-actions-heading">
        <h2 id="registration-actions-heading" className="portal-module-panel-heading">
          {t('registrationServicesHeading')}
        </h2>
        <ul className="portal-registration-action-grid">
          {actions.map((action) => (
            <li key={action.to}>
              <NavLink
                to={
                  action.to.startsWith('/')
                    ? action.to
                    : `${action.to}${action.appendTermQuery ? termQuery : ''}`
                }
                className="portal-registration-action-card"
              >
                <span className="portal-registration-action-arrow" aria-hidden="true">
                  →
                </span>
                <h3 className="portal-registration-action-title">{t(action.titleKey)}</h3>
                <p className="portal-registration-action-desc">{t(action.descKey)}</p>
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

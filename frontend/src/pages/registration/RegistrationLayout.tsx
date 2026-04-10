import { useEffect, useMemo, useState } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { useLanguage } from '@/LanguageContext'
import { portalStudentLabel } from '@/lib/portalLocaleStrings'
import { BackToDashboardLink } from '../../components/BackToDashboardLink'
import {
  fetchCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  type AcademicTerm,
  type AcademicTermName,
} from '../../lib/api'
import { CourseBinProvider } from './CourseBinContext'
import { RegistrationNav } from './RegistrationNav'
import {
  mergeTermOptions,
  readRegistrationTermIdFromSearch,
  REGISTRATION_TERMS_LOAD_ERROR,
  resolveSelectedRegistrationTermId,
} from './registrationTermSearch'

/** Lets `?term=<id>` stay valid when the id is not in recent/current (admin may still schedule it). */
function academicTermStubForDeepLink(termId: string): AcademicTerm {
  const id = termId.trim()
  const term_name: AcademicTermName = 'Spring'
  return {
    id,
    term_label: id,
    year: 0,
    term_name,
    quarter_index: 0,
    sequence_no: -1,
    start_date: null,
    end_date: null,
    registration_open: null,
    registration_close: null,
    withdraw_deadline: null,
    payment_due_date: null,
    lock_registration_if_overdue: false,
    status: 'planned',
    is_visible: true,
  }
}

export function RegistrationLayout() {
  const { locale } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const [recentTerms, setRecentTerms] = useState<AcademicTerm[]>([])
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const options = useMemo(() => {
    const merged = mergeTermOptions(recentTerms, currentTerm)
    const urlT = readRegistrationTermIdFromSearch(searchParams)?.trim() ?? ''
    if (urlT === '' || merged.some((t) => t.id === urlT)) return merged
    return [academicTermStubForDeepLink(urlT), ...merged]
  }, [recentTerms, currentTerm, searchParams])

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
        console.error('[registration/layout] recent terms failed', recentR.reason)
      }
      if (currentR.status === 'fulfilled') {
        current = currentR.value
      } else {
        anyRejected = true
        console.error('[registration/layout] current term failed', currentR.reason)
      }

      setRecentTerms(recent)
      setCurrentTerm(current)

      const merged = mergeTermOptions(recent, current)
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

  useEffect(() => {
    if (loadState !== 'ready') return
    const urlTerm = readRegistrationTermIdFromSearch(searchParams)
    const resolvedId = resolveSelectedRegistrationTermId(
      urlTerm,
      options,
      currentTerm,
    )

    if (options.length === 0) {
      if (searchParams.has('term')) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('term')
            return next
          },
          { replace: true },
        )
      }
      return
    }

    if (resolvedId === '') return

    const urlTrim = urlTerm?.trim() ?? ''
    const urlValid = urlTrim !== '' && options.some((t) => t.id === urlTrim)
    if (!urlValid || urlTrim !== resolvedId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('term', resolvedId)
          return next
        },
        { replace: true },
      )
    }
  }, [loadState, options, currentTerm, searchParams, setSearchParams])

  const urlTerm = readRegistrationTermIdFromSearch(searchParams)
  const selectedTermId = resolveSelectedRegistrationTermId(
    urlTerm,
    options,
    currentTerm,
  )

  const termLinkSearch =
    selectedTermId.trim() !== '' ? `?term=${encodeURIComponent(selectedTermId.trim())}` : ''

  const courseBinKey = selectedTermId.trim() !== '' ? selectedTermId.trim() : 'none'

  return (
    <CourseBinProvider key={courseBinKey} registrationTermId={selectedTermId.trim()}>
      <div className="portal-registration-module">
        <header className="portal-module-header">
          <BackToDashboardLink />
          <h1 className="portal-page-title">
            {portalStudentLabel(locale, 'registrationModule')}
          </h1>
        </header>

        <div
          className="portal-registration-layout-term"
          aria-labelledby="registration-layout-term-label"
        >
          <div className="portal-registration-layout-term__row">
            <span id="registration-layout-term-label" className="portal-registration-layout-term__title">
              Select Term
            </span>
            {loadState === 'loading' ? (
              <p className="portal-text-muted portal-registration-layout-term__status" role="status">
                Loading terms…
              </p>
            ) : null}
            {loadState === 'error' ? (
              <p className="portal-text-muted portal-registration-layout-term__status" role="alert">
                {loadError ?? 'Could not load terms.'}
              </p>
            ) : null}
            {loadState === 'ready' && options.length === 0 ? (
              <p className="portal-text-muted portal-registration-layout-term__status" role="status">
                No academic terms available.
              </p>
            ) : null}
            {loadState === 'ready' && options.length > 0 ? (
              <select
                id="registration-layout-term-select"
                className="portal-account-ledger__select portal-registration-layout-term__select"
                aria-labelledby="registration-layout-term-label"
                value={options.some((t) => t.id === selectedTermId) ? selectedTermId : ''}
                onChange={(e) => {
                  const next = e.target.value.trim()
                  if (next === '') return
                  setSearchParams(
                    (prev) => {
                      const p = new URLSearchParams(prev)
                      p.set('term', next)
                      return p
                    },
                    { replace: false },
                  )
                }}
              >
                {options.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.term_label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {loadState === 'ready' && options.length > 0 ? (
            <p className="portal-text-muted portal-registration-layout-term__hint">
              Recent terms shown here are published by the registrar.
            </p>
          ) : null}
        </div>

        <RegistrationNav termLinkSearch={termLinkSearch} />
        <div className="portal-registration-outlet">
          <Outlet />
        </div>
      </div>
    </CourseBinProvider>
  )
}

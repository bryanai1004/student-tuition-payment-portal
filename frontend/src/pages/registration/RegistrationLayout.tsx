import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useOptionalPortalLocale, useStudentPortalT } from '@/LanguageContext'
import { BackToDashboardLink } from '../../components/BackToDashboardLink'
import {
  fetchCurrentAcademicTerm,
  fetchPostedCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  type AcademicTerm,
  type AcademicTermName,
} from '../../lib/api'
import { CourseBinProvider } from './CourseBinContext'
import { RegistrationNav } from './RegistrationNav'
import { RegistrationSectionNav } from './RegistrationSectionNav'
import { useAccount } from '../../context/AccountContext'
import {
  mergeTermOptions,
  readRegistrationTermIdFromSearch,
  REGISTRATION_TERMS_LOAD_ERROR,
  resolveSelectedRegistrationTermId,
} from './registrationTermSearch'

function formatPortalToday(locale: 'en' | 'zh'): { iso: string; label: string } {
  const d = new Date()
  const iso = d.toISOString().slice(0, 10)
  const label = d.toLocaleDateString(locale === 'zh' ? 'zh-TW' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return { iso, label }
}

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
    clinicAppointmentDeadline: null,
    lock_registration_if_overdue: false,
    status: 'planned',
    is_visible: true,
    is_posted_to_dashboard: false,
  }
}

export function RegistrationLayout() {
  const t = useStudentPortalT()
  const locale = useOptionalPortalLocale()
  const { currentStudentId } = useAccount()
  const { pathname } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const isClinicalSection = pathname.startsWith('/registration/clinical')

  const [recentTerms, setRecentTerms] = useState<AcademicTerm[]>([])
  const [postedTerm, setPostedTerm] = useState<AcademicTerm | null>(null)
  const [registrationOpenTerm, setRegistrationOpenTerm] = useState<AcademicTerm | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const options = useMemo(() => {
    const merged = mergeTermOptions(recentTerms, postedTerm, registrationOpenTerm)
    const urlT = readRegistrationTermIdFromSearch(searchParams)?.trim() ?? ''
    if (urlT === '' || merged.some((t) => t.id === urlT)) return merged
    return [academicTermStubForDeepLink(urlT), ...merged]
  }, [recentTerms, postedTerm, registrationOpenTerm, searchParams])

  useEffect(() => {
    const ac = new AbortController()
    setLoadState('loading')
    setLoadError(null)
    void (async () => {
      const recentP = fetchRecentAcademicTerms(3, { signal: ac.signal })
      const postedP = fetchPostedCurrentAcademicTerm({ signal: ac.signal })
      const openP = fetchCurrentAcademicTerm({ signal: ac.signal })
      const [recentR, postedR, openR] = await Promise.allSettled([recentP, postedP, openP])
      if (ac.signal.aborted) return

      let recent: AcademicTerm[] = []
      let posted: AcademicTerm | null = null
      let open: AcademicTerm | null = null
      let anyRejected = false

      if (recentR.status === 'fulfilled') {
        recent = recentR.value
      } else {
        anyRejected = true
        console.error('[registration/layout] recent terms failed', recentR.reason)
      }
      if (postedR.status === 'fulfilled') {
        posted = postedR.value
      } else {
        anyRejected = true
        console.error('[registration/layout] posted current term failed', postedR.reason)
      }
      if (openR.status === 'fulfilled') {
        open = openR.value
      } else {
        anyRejected = true
        console.error('[registration/layout] registration_open current term failed', openR.reason)
      }

      setRecentTerms(recent)
      setPostedTerm(posted)
      setRegistrationOpenTerm(open)

      const merged = mergeTermOptions(recent, posted, open)
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
      postedTerm,
      registrationOpenTerm,
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
  }, [loadState, options, postedTerm, registrationOpenTerm, searchParams, setSearchParams])

  useEffect(() => {
    const section = searchParams.get('section')
    if (isClinicalSection) {
      if (section !== 'clinical') {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('section', 'clinical')
            return next
          },
          { replace: true },
        )
      }
      return
    }
    if (section === 'clinical') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('section')
          return next
        },
        { replace: true },
      )
    }
  }, [isClinicalSection, searchParams, setSearchParams])

  const urlTerm = readRegistrationTermIdFromSearch(searchParams)
  const selectedTermId = resolveSelectedRegistrationTermId(
    urlTerm,
    options,
    postedTerm,
    registrationOpenTerm,
  )

  const termLinkSearch =
    selectedTermId.trim() !== '' ? `?term=${encodeURIComponent(selectedTermId.trim())}` : ''

  const courseBinKey = selectedTermId.trim() !== '' ? selectedTermId.trim() : 'none'
  const courseBinStudentKey = currentStudentId?.trim() ?? ''

  const today = formatPortalToday(locale)

  return (
    <CourseBinProvider
      key={`${courseBinKey}:${courseBinStudentKey}`}
      registrationTermId={selectedTermId.trim()}
      studentId={courseBinStudentKey}
    >
      <div className="portal-registration-module">
        <header className="portal-module-header">
          <BackToDashboardLink />
          <h1 className="portal-page-title">{t('registrationModule')}</h1>
        </header>

        <RegistrationSectionNav />

        {!isClinicalSection ? (
          <div
            className="portal-registration-layout-term"
            aria-labelledby="registration-layout-term-label"
          >
            <div
              className={[
                'portal-registration-layout-term__row',
                loadState === 'ready' && options.length > 0
                  ? 'portal-registration-layout-term__row--with-today-date'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span id="registration-layout-term-label" className="portal-registration-layout-term__title">
                {t('selectTerm')}
              </span>
              {loadState === 'loading' ? (
                <p className="portal-text-muted portal-registration-layout-term__status" role="status">
                  {t('loadingTerms')}
                </p>
              ) : null}
              {loadState === 'error' ? (
                <p className="portal-text-muted portal-registration-layout-term__status" role="alert">
                  {loadError === REGISTRATION_TERMS_LOAD_ERROR
                    ? t('registrationTermsLoadError')
                    : (loadError ?? t('couldNotLoadTerms'))}
                </p>
              ) : null}
              {loadState === 'ready' && options.length === 0 ? (
                <p className="portal-text-muted portal-registration-layout-term__status" role="status">
                  {t('noAcademicTermsAvailable')}
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
                  {options.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.term_label}
                    </option>
                  ))}
                </select>
              ) : null}
              {loadState === 'ready' && options.length > 0 ? (
                <time
                  className="portal-registration-layout-term__today"
                  dateTime={today.iso}
                  aria-label={t('registrationLayoutTodayAria')}
                >
                  {today.label}
                </time>
              ) : null}
            </div>
            {loadState === 'ready' && options.length > 0 ? (
              <p className="portal-text-muted portal-registration-layout-term__hint">
                {t('registrationRecentTermsHint')}
              </p>
            ) : null}
          </div>
        ) : null}

        {!isClinicalSection ? <RegistrationNav termLinkSearch={termLinkSearch} /> : null}
        <div className="portal-registration-outlet">
          <Outlet />
        </div>
      </div>
    </CourseBinProvider>
  )
}

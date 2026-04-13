import { useEffect, useState } from 'react'
import { BackToDashboardLink } from '../components/BackToDashboardLink'
import { useAccount } from '../context/AccountContext'
import { useStudentPortalT } from '../LanguageContext'
import {
  fetchStudentProfile,
  type StudentProfileResponse,
} from '../lib/api'

function dashText(value: string | null | undefined, dash: string): string {
  const s = value?.trim() ?? ''
  return s.length > 0 ? s : dash
}

/** Display ISO `YYYY-MM-DD` (or datetime) as MM/DD/YYYY. */
function formatUsMdY(iso: string | null | undefined, dash: string): string {
  const s = iso?.trim() ?? ''
  if (!s) return dash
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    return `${mo}/${d}/${y}`
  }
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dash
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = d.getFullYear()
  return `${mm}/${dd}/${yy}`
}

function displayAge(age: number | null | undefined, dash: string): string {
  if (age == null || !Number.isFinite(age)) return dash
  return String(Math.trunc(age))
}

function displayCredits(n: number | null | undefined, dash: string): string {
  if (n == null || !Number.isFinite(n)) return dash
  return String(n)
}

export function ProfilePage() {
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const dash = t('dashEm')

  const [profile, setProfile] = useState<StudentProfileResponse | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileReloadKey, setProfileReloadKey] = useState(0)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setProfile(null)
      setProfileLoading(false)
      setProfileError(null)
      return
    }

    const ac = new AbortController()
    setProfile(null)
    setProfileLoading(true)
    setProfileError(null)

    ;(async () => {
      try {
        const p = await fetchStudentProfile(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setProfile(p)
        setProfileError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setProfile(null)
        setProfileError(
          e instanceof Error ? e.message : t('couldNotLoadProfileFallback'),
        )
      } finally {
        if (!ac.signal.aborted) {
          setProfileLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, profileReloadKey, t])

  const profileSectionLoading =
    profileLoading && profile === null && profileError === null

  return (
    <main className="portal-page portal-module-page portal-profile-page">
      <header className="portal-module-header">
        <BackToDashboardLink />
        <h1 className="portal-page-title">{t('myAccountPageTitle')}</h1>
      </header>

      {profileSectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">{t('loadingYourProfile')}</p>
          <p className="portal-profile-state__detail">
            {t('profileLoadingDetail')}
          </p>
        </section>
      ) : null}

      {!profileSectionLoading && profileError ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">{t('couldNotLoadProfile')}</p>
          <p className="portal-profile-state__detail">{profileError}</p>
          <div className="portal-actions portal-profile-state__actions">
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => setProfileReloadKey((k) => k + 1)}
            >
              {t('tryAgain')}
            </button>
          </div>
        </section>
      ) : null}

      {!profileSectionLoading && !profileError && profile ? (
        <section
          className="portal-card portal-stack portal-profile-card"
          aria-labelledby="profile-student-heading"
        >
          <h2 id="profile-student-heading" className="portal-section-heading">
            {t('studentProfile')}
          </h2>
          <dl>
            <div className="portal-row">
              <dt>{t('fullName')}</dt>
              <dd>{dashText(profile.fullName, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('studentId')}</dt>
              <dd>{dashText(profile.studentId, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('program')}</dt>
              <dd>{profile.program}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('track')}</dt>
              <dd>{dashText(profile.track ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('gender')}</dt>
              <dd>{dashText(profile.gender ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('age')}</dt>
              <dd>{displayAge(profile.age, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('enrollmentDate')}</dt>
              <dd>{formatUsMdY(profile.enrollmentDate ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('background')}</dt>
              <dd>{dashText(profile.background ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('credits')}</dt>
              <dd>{displayCredits(profile.credits, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('highestDegree')}</dt>
              <dd>{dashText(profile.highestDegree ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('race')}</dt>
              <dd>{dashText(profile.race ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('address')}</dt>
              <dd>{dashText(profile.address ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('city')}</dt>
              <dd>{dashText(profile.city ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('state')}</dt>
              <dd>{dashText(profile.state ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('zip')}</dt>
              <dd>{dashText(profile.zip ?? undefined, dash)}</dd>
            </div>
            <div className="portal-row">
              <dt>{t('email')}</dt>
              <dd>{dashText(profile.email ?? undefined, dash)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </main>
  )
}

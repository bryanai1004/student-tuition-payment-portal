import { useEffect, useState } from 'react'
import { BackToDashboardLink } from '../components/BackToDashboardLink'
import { useAccount } from '../context/AccountContext'
import {
  fetchStudentProfile,
  type StudentProfileResponse,
} from '../lib/api'

function dashText(value: string | null | undefined): string {
  const s = value?.trim() ?? ''
  return s.length > 0 ? s : '—'
}

/** Display ISO `YYYY-MM-DD` (or datetime) as MM/DD/YYYY. */
function formatUsMdY(iso: string | null | undefined): string {
  const s = iso?.trim() ?? ''
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    return `${mo}/${d}/${y}`
  }
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = d.getFullYear()
  return `${mm}/${dd}/${yy}`
}

function displayAge(age: number | null | undefined): string {
  if (age == null || !Number.isFinite(age)) return '—'
  return String(Math.trunc(age))
}

function displayCredits(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return String(n)
}

export function ProfilePage() {
  const { currentStudentId } = useAccount()

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
          e instanceof Error ? e.message : 'Could not load your student profile.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setProfileLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, profileReloadKey])

  const profileSectionLoading =
    profileLoading && profile === null && profileError === null

  return (
    <main className="portal-page portal-module-page portal-profile-page">
      <header className="portal-module-header">
        <BackToDashboardLink />
        <h1 className="portal-module-title">My Account</h1>
        <p className="portal-module-subtitle">
          Your enrollment and billing snapshot for the signed-in student. Additional
          profile tools will roll out over time.
        </p>
      </header>

      {profileSectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading your profile</p>
          <p className="portal-profile-state__detail">
            Please wait while we load your student information.
          </p>
        </section>
      ) : null}

      {!profileSectionLoading && profileError ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load your profile</p>
          <p className="portal-profile-state__detail">{profileError}</p>
          <div className="portal-actions portal-profile-state__actions">
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => setProfileReloadKey((k) => k + 1)}
            >
              Try again
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
            Student profile
          </h2>
          <dl>
            <div className="portal-row">
              <dt>Full name</dt>
              <dd>{dashText(profile.fullName)}</dd>
            </div>
            <div className="portal-row">
              <dt>Student ID</dt>
              <dd>{dashText(profile.studentId)}</dd>
            </div>
            <div className="portal-row">
              <dt>Track</dt>
              <dd>{dashText(profile.track ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Gender</dt>
              <dd>{dashText(profile.gender ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Age</dt>
              <dd>{displayAge(profile.age)}</dd>
            </div>
            <div className="portal-row">
              <dt>Enrollment date</dt>
              <dd>{formatUsMdY(profile.enrollmentDate ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Background</dt>
              <dd>{dashText(profile.background ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Credits</dt>
              <dd>{displayCredits(profile.credits)}</dd>
            </div>
            <div className="portal-row">
              <dt>Highest tertiary ed. degree</dt>
              <dd>{dashText(profile.highestDegree ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Race</dt>
              <dd>{dashText(profile.race ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Address</dt>
              <dd>{dashText(profile.address ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>City</dt>
              <dd>{dashText(profile.city ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>State</dt>
              <dd>{dashText(profile.state ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Zip</dt>
              <dd>{dashText(profile.zip ?? undefined)}</dd>
            </div>
            <div className="portal-row">
              <dt>Email</dt>
              <dd>{dashText(profile.email ?? undefined)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </main>
  )
}

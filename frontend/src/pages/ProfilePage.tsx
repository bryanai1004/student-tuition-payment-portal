import { useEffect, useRef, useState, type ChangeEventHandler } from 'react'
import { BackToDashboardLink } from '../components/BackToDashboardLink'
import { StudentLoginEmailPanel } from '../components/StudentLoginEmailPanel'
import { useAccount } from '../context/AccountContext'
import { useStudentPortalT } from '../LanguageContext'
import {
  fetchApiJson,
  fetchMyStudentPhotoUrl,
  uploadMyStudentPhoto,
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

type EditableProfileFields = {
  dob: string
  ssn: string
  visa: string
  address: string
  phone1: string
  phone2: string
  phone3: string
  email: string
  citizenship: string
  race: string
  marital: string
}

type StudentProfileWithSensitive = StudentProfileResponse & {
  dob: string | null
  ssn: string | null
  visa: string | null
  phone1: string | null
  phone2: string | null
  phone3: string | null
  citizenship: string | null
  marital: string | null
}

const EMPTY_EDITABLE_PROFILE: EditableProfileFields = {
  dob: '',
  ssn: '',
  visa: '',
  address: '',
  phone1: '',
  phone2: '',
  phone3: '',
  email: '',
  citizenship: '',
  race: '',
  marital: '',
}

const RACE_OPTIONS = [
  'Asian/Pacific Islander',
  'White',
  'Hispanic',
  'African American',
  'American Indian/Alaska Native',
  'Other',
] as const

const CITIZENSHIP_OPTIONS = [
  'US Citizen',
  'Permanent Resident',
  'International Student (F-1)',
  'Work Visa (H1-B)',
  'Other',
] as const

const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'Other'] as const

function nullableString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapApiProfile(data: unknown): StudentProfileWithSensitive {
  if (
    data == null ||
    typeof data !== 'object' ||
    typeof (data as { studentId?: unknown }).studentId !== 'string' ||
    typeof (data as { fullName?: unknown }).fullName !== 'string'
  ) {
    throw new Error('Unexpected student profile response')
  }
  const profile = data as Record<string, unknown>
  return {
    studentId: profile.studentId as string,
    fullName: profile.fullName as string,
    program: profile.program === 'DAHM' ? 'DAHM' : 'MAHM',
    track: nullableString(profile.track),
    gender: nullableString(profile.gender),
    age: typeof profile.age === 'number' && Number.isFinite(profile.age) ? profile.age : null,
    enrollmentDate: nullableString(profile.enrollmentDate),
    background: nullableString(profile.background),
    credits:
      typeof profile.credits === 'number' && Number.isFinite(profile.credits)
        ? profile.credits
        : null,
    highestDegree: nullableString(profile.highestDegree),
    race: nullableString(profile.race),
    address: nullableString(profile.address),
    city: nullableString(profile.city),
    state: nullableString(profile.state),
    zip: nullableString(profile.zip),
    email: nullableString(profile.email),
    dob: nullableString(profile.dob),
    ssn: nullableString(profile.ssn),
    visa: nullableString(profile.visa),
    phone1: nullableString(profile.phone1),
    phone2: nullableString(profile.phone2),
    phone3: nullableString(profile.phone3),
    citizenship: nullableString(profile.citizenship),
    marital: nullableString(profile.marital),
  }
}

function toEditableState(profile: StudentProfileWithSensitive): EditableProfileFields {
  return {
    dob: profile.dob ?? '',
    ssn: profile.ssn ?? '',
    visa: profile.visa ?? '',
    address: profile.address ?? '',
    phone1: profile.phone1 ?? '',
    phone2: profile.phone2 ?? '',
    phone3: profile.phone3 ?? '',
    email: profile.email ?? '',
    citizenship: profile.citizenship ?? '',
    race: profile.race ?? '',
    marital: profile.marital ?? '',
  }
}

function toPatchValue(v: string): string | null {
  const trimmed = v.trim()
  return trimmed.length > 0 ? trimmed : null
}

function maskedSsnDisplay(raw: string, dash: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return dash
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 4) return '***-**-****'
  return `***-**-${digits.slice(-4)}`
}

export function ProfilePage() {
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const dash = t('dashEm')

  const [profile, setProfile] = useState<StudentProfileWithSensitive | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileReloadKey, setProfileReloadKey] = useState(0)
  const [editable, setEditable] = useState<EditableProfileFields>(EMPTY_EDITABLE_PROFILE)
  const [isEditing, setIsEditing] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoFilename, setPhotoFilename] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [photoSuccess, setPhotoSuccess] = useState<string | null>(null)
  const [photoReloadKey, setPhotoReloadKey] = useState(0)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

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
        const p = mapApiProfile(
          await fetchApiJson(`/api/students/${encodeURIComponent(id)}/profile`, {
            signal: ac.signal,
          }),
        )
        if (ac.signal.aborted) return
        setProfile(p)
        setEditable(toEditableState(p))
        setIsEditing(false)
        setSaveError(null)
        setSaveSuccess(null)
        setProfileError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setProfile(null)
        setEditable(EMPTY_EDITABLE_PROFILE)
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

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setPhotoUrl(null)
      setPhotoLoading(false)
      setPhotoError(null)
      setPhotoSuccess(null)
      return
    }

    const ac = new AbortController()
    setPhotoLoading(true)
    setPhotoError(null)

    ;(async () => {
      try {
        const result = await fetchMyStudentPhotoUrl({ signal: ac.signal })
        if (ac.signal.aborted) return
        setPhotoUrl(result.photoUrl)
      } catch (e) {
        if (ac.signal.aborted) return
        setPhotoUrl(null)
        setPhotoError(
          e instanceof Error ? e.message : 'Unable to load profile photo right now.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setPhotoLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, photoReloadKey])

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
    }
  }, [photoPreviewUrl])

  const profileSectionLoading =
    profileLoading && profile === null && profileError === null

  const setEditableField = (field: keyof EditableProfileFields, value: string) => {
    setEditable((prev) => ({ ...prev, [field]: value }))
  }

  const normalizedSaveError =
    saveError && /(authentication required|http 401|401)/i.test(saveError)
      ? 'Please sign in again to update profile details.'
      : saveError

  const handleStartEdit = () => {
    if (!profile) return
    setEditable(toEditableState(profile))
    setIsEditing(true)
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleCancelEdit = () => {
    if (!profile) return
    setEditable(toEditableState(profile))
    setIsEditing(false)
    setSaveError(null)
    setSaveSuccess(null)
  }

  const handleSaveProfile = async () => {
    if (!profile) return
    setSaveLoading(true)
    setSaveError(null)
    setSaveSuccess(null)
    try {
      const patch = {
        dob: toPatchValue(editable.dob),
        ssn: toPatchValue(editable.ssn),
        visa: toPatchValue(editable.visa),
        address: toPatchValue(editable.address),
        phone1: toPatchValue(editable.phone1),
        phone2: toPatchValue(editable.phone2),
        phone3: toPatchValue(editable.phone3),
        email: toPatchValue(editable.email),
        citizenship: toPatchValue(editable.citizenship),
        race: toPatchValue(editable.race),
        marital: toPatchValue(editable.marital),
      }
      const updated = mapApiProfile(
        await fetchApiJson('/api/student/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      )
      setProfile(updated)
      setEditable(toEditableState(updated))
      setIsEditing(false)
      setSaveSuccess('Profile saved successfully.')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Unable to save profile right now.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handlePhotoSelect: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
      setPhotoPreviewUrl(null)
      setPhotoFile(null)
      setPhotoFilename(null)
      return
    }
    const nextUrl = URL.createObjectURL(file)
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl)
    }
    setPhotoPreviewUrl(nextUrl)
    setPhotoFile(file)
    setPhotoFilename(file.name)
    setPhotoError(null)
    setPhotoSuccess(null)
  }

  const normalizedPhotoError =
    photoError && /(authentication required|http 401|401)/i.test(photoError)
      ? 'Please sign in again to upload your profile photo.'
      : photoError

  const handlePhotoUpload = async () => {
    if (!photoFile) return
    setPhotoUploading(true)
    setPhotoError(null)
    setPhotoSuccess(null)
    try {
      const uploaded = await uploadMyStudentPhoto(photoFile)
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
      setPhotoPreviewUrl(null)
      setPhotoFile(null)
      setPhotoFilename(null)
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      if (uploaded.photoUrl) {
        setPhotoUrl(uploaded.photoUrl)
      } else {
        setPhotoReloadKey((k) => k + 1)
      }
      setPhotoSuccess('Profile photo uploaded successfully.')
    } catch (e) {
      setPhotoError(
        e instanceof Error ? e.message : 'Unable to upload profile photo right now.',
      )
    } finally {
      setPhotoUploading(false)
    }
  }

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
          <div className="portal-profile-layout">
            <section
              className="portal-profile-photo-card"
              aria-labelledby="profile-photo-heading"
            >
              <h3 id="profile-photo-heading" className="portal-section-heading">
                Profile Photo
              </h3>
              <div className="portal-profile-photo-frame" aria-live="polite">
                {photoPreviewUrl || photoUrl ? (
                  <img
                    src={photoPreviewUrl ?? photoUrl ?? ''}
                    alt={photoPreviewUrl ? 'Selected profile photo preview' : 'Profile photo'}
                    className="portal-profile-photo-image"
                  />
                ) : (
                  <span className="portal-profile-photo-placeholder">No photo</span>
                )}
              </div>
              <label className="portal-btn portal-btn--secondary portal-profile-photo-upload">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  className="portal-profile-photo-upload-input"
                  disabled={photoUploading}
                />
                Choose photo
              </label>
              <button
                type="button"
                className="portal-btn portal-btn--primary"
                onClick={handlePhotoUpload}
                disabled={!photoFile || photoUploading}
              >
                {photoUploading ? 'Uploading...' : 'Upload photo'}
              </button>
              {photoLoading ? (
                <p className="portal-card-note portal-profile-photo-filename">
                  Loading current photo...
                </p>
              ) : null}
              {photoFilename ? (
                <p className="portal-card-note portal-profile-photo-filename">
                  Selected: {photoFilename}
                </p>
              ) : null}
              {photoSuccess ? (
                <p className="portal-card-note" role="status" aria-live="polite">
                  {photoSuccess}
                </p>
              ) : null}
              {photoError ? (
                <p className="portal-card-note" role="alert" aria-live="assertive">
                  {normalizedPhotoError}
                </p>
              ) : null}
            </section>

            <dl className="portal-profile-details">
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
              <dd>
                <select
                  className="portal-profile-input"
                  value={editable.race}
                  onChange={(e) => setEditableField('race', e.target.value)}
                  disabled={!isEditing || saveLoading}
                >
                  <option value="">{dash}</option>
                  {RACE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div className="portal-row">
              <dt>{t('address')}</dt>
              <dd>
                <input
                  className="portal-profile-input"
                  type="text"
                  value={editable.address}
                  onChange={(e) => setEditableField('address', e.target.value)}
                  disabled={!isEditing || saveLoading}
                />
              </dd>
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
              <dd>
                <input
                  className="portal-profile-input"
                  type="email"
                  value={editable.email}
                  onChange={(e) => setEditableField('email', e.target.value)}
                  disabled={!isEditing || saveLoading}
                />
              </dd>
            </div>
            <div className="portal-row">
              <dt>Date of Birth</dt>
              <dd>
                <input
                  className="portal-profile-input"
                  type="date"
                  value={editable.dob}
                  onChange={(e) => setEditableField('dob', e.target.value)}
                  disabled={!isEditing || saveLoading}
                />
              </dd>
            </div>
            <div className="portal-row">
              <dt>SSN</dt>
              <dd>
                {isEditing ? (
                  <input
                    className="portal-profile-input"
                    type="text"
                    value={editable.ssn}
                    onChange={(e) => setEditableField('ssn', e.target.value)}
                    disabled={saveLoading}
                    placeholder="000-00-0000"
                  />
                ) : (
                  maskedSsnDisplay(editable.ssn, dash)
                )}
              </dd>
            </div>
            <div className="portal-row">
              <dt>Visa</dt>
              <dd>
                <input
                  className="portal-profile-input"
                  type="text"
                  value={editable.visa}
                  onChange={(e) => setEditableField('visa', e.target.value)}
                  disabled={!isEditing || saveLoading}
                />
              </dd>
            </div>
            <div className="portal-row">
              <dt>Phone 1</dt>
              <dd>
                <input
                  className="portal-profile-input"
                  type="text"
                  value={editable.phone1}
                  onChange={(e) => setEditableField('phone1', e.target.value)}
                  disabled={!isEditing || saveLoading}
                />
              </dd>
            </div>
            <div className="portal-row">
              <dt>Phone 2</dt>
              <dd>
                <input
                  className="portal-profile-input"
                  type="text"
                  value={editable.phone2}
                  onChange={(e) => setEditableField('phone2', e.target.value)}
                  disabled={!isEditing || saveLoading}
                />
              </dd>
            </div>
            <div className="portal-row">
              <dt>Phone 3</dt>
              <dd>
                <input
                  className="portal-profile-input"
                  type="text"
                  value={editable.phone3}
                  onChange={(e) => setEditableField('phone3', e.target.value)}
                  disabled={!isEditing || saveLoading}
                />
              </dd>
            </div>
            <div className="portal-row">
              <dt>Citizenship</dt>
              <dd>
                <select
                  className="portal-profile-input"
                  value={editable.citizenship}
                  onChange={(e) => setEditableField('citizenship', e.target.value)}
                  disabled={!isEditing || saveLoading}
                >
                  <option value="">{dash}</option>
                  {CITIZENSHIP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            <div className="portal-row">
              <dt>Marital Status</dt>
              <dd>
                <select
                  className="portal-profile-input"
                  value={editable.marital}
                  onChange={(e) => setEditableField('marital', e.target.value)}
                  disabled={!isEditing || saveLoading}
                >
                  <option value="">{dash}</option>
                  {MARITAL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
            </dl>
          </div>
          <div className="portal-actions">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="portal-btn portal-btn--primary"
                  onClick={handleSaveProfile}
                  disabled={saveLoading}
                >
                  {saveLoading ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="portal-btn portal-btn--secondary"
                  onClick={handleCancelEdit}
                  disabled={saveLoading}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="portal-btn portal-btn--secondary"
                onClick={handleStartEdit}
              >
                Edit
              </button>
            )}
          </div>
          {saveSuccess ? (
            <p role="status" aria-live="polite">
              {saveSuccess}
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" aria-live="assertive">
              {normalizedSaveError}
            </p>
          ) : null}
        </section>
      ) : null}

      <StudentLoginEmailPanel
        ready={!profileSectionLoading && !profileError && profile != null}
      />
    </main>
  )
}

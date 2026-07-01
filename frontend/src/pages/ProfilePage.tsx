import { useEffect, useRef, useState, type ChangeEventHandler } from 'react'
import { BackToDashboardLink } from '../components/BackToDashboardLink'
import {
  ProfileField,
  ProfileReadonlyValue,
  ProfileSection,
} from '../components/ProfileFieldGrid'
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
  phone: string
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
  phone: '',
  email: '',
  citizenship: '',
  race: '',
  marital: '',
}

function primaryPhone(
  phone1: string | null | undefined,
  phone2: string | null | undefined,
  phone3: string | null | undefined,
): string {
  for (const value of [phone1, phone2, phone3]) {
    const trimmed = value?.trim() ?? ''
    if (trimmed.length > 0) return trimmed
  }
  return ''
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
    phone: primaryPhone(profile.phone1, profile.phone2, profile.phone3),
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

function profileInitials(fullName: string): string {
  const parts = fullName
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
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
        setPhotoError(null)
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
        phone1: toPatchValue(editable.phone),
        phone2: null,
        phone3: null,
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
      setPhotoFilename(null)
      return
    }
    const nextUrl = URL.createObjectURL(file)
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl)
    }
    setPhotoPreviewUrl(nextUrl)
    setPhotoFilename(file.name)
    setPhotoError(null)
    setPhotoSuccess(null)
    void uploadPhotoFile(file, nextUrl)
  }

  const uploadPhotoFile = async (file: File, previewUrl?: string) => {
    setPhotoUploading(true)
    setPhotoError(null)
    setPhotoSuccess(null)
    try {
      const uploaded = await uploadMyStudentPhoto(file)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPhotoPreviewUrl(null)
      setPhotoFilename(null)
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      setPhotoUrl(uploaded.photoUrl)
      setPhotoReloadKey((k) => k + 1)
      setPhotoSuccess(
        uploaded.photoUrl
          ? 'Profile photo saved.'
          : 'Photo uploaded — refresh if it does not appear.',
      )
    } catch (e) {
      setPhotoError(
        e instanceof Error ? e.message : 'Unable to upload profile photo right now.',
      )
    } finally {
      setPhotoUploading(false)
    }
  }

  const hasSavedPhoto = Boolean(photoUrl)
  const hasPhotoDisplay = Boolean(photoPreviewUrl || photoUrl)

  const normalizedPhotoError =
    photoError && /(authentication required|http 401|401)/i.test(photoError)
      ? 'Please sign in again to upload your profile photo.'
      : photoError

  const renderTextField = (
    field: keyof EditableProfileFields,
    options?: { type?: string; placeholder?: string },
  ) => {
    const value = editable[field]
    if (!isEditing) {
      const display =
        field === 'dob'
          ? formatUsMdY(value || null, dash)
          : dashText(value, dash)
      return (
        <ProfileReadonlyValue muted={!value.trim()}>
          {display}
        </ProfileReadonlyValue>
      )
    }
    return (
      <input
        className="portal-profile-control"
        type={options?.type ?? 'text'}
        value={value}
        placeholder={options?.placeholder}
        onChange={(e) => setEditableField(field, e.target.value)}
        disabled={saveLoading}
      />
    )
  }

  const renderSelectField = (
    field: 'race' | 'citizenship' | 'marital',
    options: readonly string[],
  ) => {
    const value = editable[field]
    if (!isEditing) {
      return (
        <ProfileReadonlyValue muted={!value.trim()}>
          {dashText(value, dash)}
        </ProfileReadonlyValue>
      )
    }
    return (
      <select
        className="portal-profile-control"
        value={value}
        onChange={(e) => setEditableField(field, e.target.value)}
        disabled={saveLoading}
      >
        <option value="">{dash}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
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
          <header className="portal-profile-hero">
            <div className="portal-profile-hero__main">
              <div className="portal-profile-hero__photo-wrap">
                <div className="portal-profile-hero__photo" aria-live="polite">
                  {hasPhotoDisplay ? (
                    <img
                      src={photoPreviewUrl ?? photoUrl ?? ''}
                      alt={
                        photoPreviewUrl ? 'Selected profile photo preview' : 'Profile photo'
                      }
                      className="portal-profile-photo-image"
                      onError={() => {
                        if (photoPreviewUrl) return
                        setPhotoUrl(null)
                        setPhotoReloadKey((k) => k + 1)
                      }}
                    />
                  ) : (
                    <span className="portal-profile-photo-placeholder portal-profile-photo-placeholder--initials">
                      {profileInitials(profile.fullName)}
                    </span>
                  )}
                </div>
                <label className="portal-profile-hero__photo-btn">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    onChange={handlePhotoSelect}
                    className="portal-profile-photo-upload-input"
                    disabled={photoUploading}
                  />
                  {photoUploading
                    ? 'Uploading…'
                    : hasSavedPhoto || hasPhotoDisplay
                      ? 'Change photo'
                      : 'Add photo'}
                </label>
              </div>
              <div className="portal-profile-hero__identity">
                <h2 id="profile-student-heading" className="portal-profile-hero__name">
                  {dashText(profile.fullName, dash)}
                </h2>
                <p className="portal-profile-hero__meta">
                  <span>{dashText(profile.studentId, dash)}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{profile.program}</span>
                </p>
                {photoLoading ? (
                  <p className="portal-profile-hero__note">Loading photo…</p>
                ) : null}
                {photoFilename ? (
                  <p className="portal-profile-hero__note">Selected: {photoFilename}</p>
                ) : null}
                {photoSuccess ? (
                  <p className="portal-profile-hero__note portal-profile-hero__note--success" role="status">
                    {photoSuccess}
                  </p>
                ) : null}
                {photoError ? (
                  <p className="portal-profile-hero__note portal-profile-hero__note--error" role="alert">
                    {normalizedPhotoError}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="portal-profile-hero__actions">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    className="portal-btn portal-btn--primary"
                    onClick={handleSaveProfile}
                    disabled={saveLoading}
                  >
                    {saveLoading ? 'Saving…' : 'Save'}
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
                  Edit profile
                </button>
              )}
            </div>
          </header>

          {saveSuccess ? (
            <p className="portal-profile-banner portal-profile-banner--success" role="status">
              {saveSuccess}
            </p>
          ) : null}
          {saveError ? (
            <p className="portal-profile-banner portal-profile-banner--error" role="alert">
              {normalizedSaveError}
            </p>
          ) : null}

          <div className="portal-profile-body">
            <ProfileSection title="Academic record">
              <ProfileField label={t('track')}>
                <ProfileReadonlyValue muted={!profile.track}>
                  {dashText(profile.track ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('gender')}>
                <ProfileReadonlyValue muted={!profile.gender}>
                  {dashText(profile.gender ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('age')}>
                <ProfileReadonlyValue muted={profile.age == null}>
                  {displayAge(profile.age, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('enrollmentDate')}>
                <ProfileReadonlyValue muted={!profile.enrollmentDate}>
                  {formatUsMdY(profile.enrollmentDate ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('background')}>
                <ProfileReadonlyValue muted={!profile.background}>
                  {dashText(profile.background ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('credits')}>
                <ProfileReadonlyValue muted={profile.credits == null}>
                  {displayCredits(profile.credits, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('highestDegree')}>
                <ProfileReadonlyValue muted={!profile.highestDegree}>
                  {dashText(profile.highestDegree ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('race')}>
                {renderSelectField('race', RACE_OPTIONS)}
              </ProfileField>
            </ProfileSection>

            <ProfileSection title="Contact">
              <ProfileField label={t('address')} fullWidth>
                {renderTextField('address')}
              </ProfileField>
              <ProfileField label={t('city')}>
                <ProfileReadonlyValue muted={!profile.city}>
                  {dashText(profile.city ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('state')}>
                <ProfileReadonlyValue muted={!profile.state}>
                  {dashText(profile.state ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label={t('zip')}>
                <ProfileReadonlyValue muted={!profile.zip}>
                  {dashText(profile.zip ?? undefined, dash)}
                </ProfileReadonlyValue>
              </ProfileField>
              <ProfileField label="Phone">{renderTextField('phone')}</ProfileField>
              <ProfileField
                label={t('email')}
                fullWidth
                note="Contact email — saved with Edit profile. For sign-in, use Login email below."
              >
                {renderTextField('email', { type: 'email' })}
              </ProfileField>
            </ProfileSection>

            <ProfileSection title="Personal information">
              <ProfileField label="Date of birth">
                {renderTextField('dob', { type: 'date' })}
              </ProfileField>
              <ProfileField label="SSN">
                {isEditing ? (
                  <input
                    className="portal-profile-control"
                    type="text"
                    value={editable.ssn}
                    onChange={(e) => setEditableField('ssn', e.target.value)}
                    disabled={saveLoading}
                    placeholder="000-00-0000"
                  />
                ) : (
                  <ProfileReadonlyValue muted={!editable.ssn.trim()}>
                    {maskedSsnDisplay(editable.ssn, dash)}
                  </ProfileReadonlyValue>
                )}
              </ProfileField>
              <ProfileField label="Visa">{renderTextField('visa')}</ProfileField>
              <ProfileField label="Citizenship">
                {renderSelectField('citizenship', CITIZENSHIP_OPTIONS)}
              </ProfileField>
              <ProfileField label="Marital status">
                {renderSelectField('marital', MARITAL_OPTIONS)}
              </ProfileField>
            </ProfileSection>
          </div>

          <StudentLoginEmailPanel embedded ready />
        </section>
      ) : null}
    </main>
  )
}

import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchAdminStudentDetail,
  updateAdminStudent,
  type AdminStudentDetail,
  type AdminStudentUpdatePayload,
  type StudentProgram,
} from '../../lib/api'
import {
  ADMIN_GENDER_SELECT_VALUES,
  ADMIN_HIGHEST_DEGREE_VALUES,
  genderToSelectValue,
  highestDegreeToSelectValue,
} from '../../lib/adminStudentFields'

const ADMIN_RACE_OPTIONS = [
  'Asian/Pacific Islander',
  'White',
  'Hispanic',
  'African American',
  'American Indian/Alaska Native',
  'Other',
] as const

const ADMIN_CITIZENSHIP_OPTIONS = [
  'US Citizen',
  'Permanent Resident',
  'International Student (F-1)',
  'Work Visa (H1-B)',
  'Other',
] as const

const ADMIN_MARITAL_OPTIONS = [
  'Single',
  'Married',
  'Divorced',
  'Widowed',
  'Other',
] as const

function nullableTrim(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

function detailToFormState(d: AdminStudentDetail): Record<string, string> {
  const gRaw = d.gender ?? ''
  const gender = genderToSelectValue(gRaw) || gRaw.trim()
  const degRaw = d.highestDegree ?? ''
  const highestDegree =
    highestDegreeToSelectValue(degRaw) || degRaw.trim()

  return {
    name: d.name,
    program: d.program,
    email: d.email ?? '',
    gender,
    backgroundSchool: d.backgroundSchool ?? '',
    highestDegree,
    requirementsId: d.requirementsId ?? '',
    address: d.address ?? '',
    city: d.city ?? '',
    state: d.state ?? '',
    zip: d.zip ?? '',
    signedDate: d.signedDate?.slice(0, 10) ?? '',
    enrollStartDate: d.enrollStartDate?.slice(0, 10) ?? '',
    ssn: d.ssn ?? '',
    visa: d.visa ?? '',
    dob: d.dob?.slice(0, 10) ?? '',
    phone1: d.phone1 ?? '',
    phone2: d.phone2 ?? '',
    phone3: d.phone3 ?? '',
    citizenship: d.citizenship ?? '',
    race: d.race ?? '',
    marital: d.marital ?? '',
  }
}

function formToPayload(f: Record<string, string>): AdminStudentUpdatePayload {
  return {
    name: f.name.trim(),
    program: f.program as StudentProgram,
    email: nullableTrim(f.email),
    gender: nullableTrim(f.gender),
    backgroundSchool: nullableTrim(f.backgroundSchool),
    highestDegree: nullableTrim(f.highestDegree),
    requirementsId: nullableTrim(f.requirementsId),
    address: nullableTrim(f.address),
    city: nullableTrim(f.city),
    state: nullableTrim(f.state),
    zip: nullableTrim(f.zip),
    signedDate: nullableTrim(f.signedDate),
    enrollStartDate: nullableTrim(f.enrollStartDate),
    ssn: nullableTrim(f.ssn),
    visa: nullableTrim(f.visa),
    dob: nullableTrim(f.dob),
    phone1: nullableTrim(f.phone1),
    phone2: nullableTrim(f.phone2),
    phone3: nullableTrim(f.phone3),
    citizenship: nullableTrim(f.citizenship),
    race: nullableTrim(f.race),
    marital: nullableTrim(f.marital),
  }
}

export function AdminStudentEditPage() {
  const { studentId: studentIdParam } = useParams<{ studentId: string }>()
  const studentId = studentIdParam ?? ''
  const navigate = useNavigate()

  const [form, setForm] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!studentId.trim()) {
      setForm(null)
      setLoading(false)
      setError('Missing student id.')
      return
    }

    const ac = new AbortController()
    setForm(null)
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const d = await fetchAdminStudentDetail(studentId, {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setForm(detailToFormState(d))
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setForm(null)
        setError(
          e instanceof Error ? e.message : 'Could not load student.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [studentId, reloadKey])

  const sectionLoading = loading && form === null && error === null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form || !studentId.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = formToPayload(form)
      await updateAdminStudent(studentId, payload)
      navigate(`/admin/students/${encodeURIComponent(studentId)}`, {
        replace: true,
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save changes.',
      )
    } finally {
      setSaving(false)
    }
  }

  const genderOptions = ADMIN_GENDER_SELECT_VALUES as readonly string[]
  const degreeOptions = ADMIN_HIGHEST_DEGREE_VALUES as readonly string[]
  const raceOptions = ADMIN_RACE_OPTIONS as readonly string[]
  const citizenshipOptions = ADMIN_CITIZENSHIP_OPTIONS as readonly string[]
  const maritalOptions = ADMIN_MARITAL_OPTIONS as readonly string[]

  function field(
    key: keyof ReturnType<typeof detailToFormState>,
    label: string,
    opts?: { type?: string; id?: string },
  ) {
    if (!form) return null
    const id = opts?.id ?? `admin-edit-${key}`
    return (
      <div className="portal-stack" style={{ gap: '0.35rem' }}>
        <label htmlFor={id} className="portal-card-note" style={{ margin: 0 }}>
          {label}
        </label>
        <input
          id={id}
          name={key}
          type={opts?.type ?? 'text'}
          className="admin-input"
          style={{ width: '100%', maxWidth: '100%' }}
          value={form[key]}
          onChange={(ev) =>
            setForm((prev) =>
              prev ? { ...prev, [key]: ev.target.value } : prev,
            )
          }
          disabled={saving}
        />
      </div>
    )
  }

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <div>
          <Link
            to={
              studentId
                ? `/admin/students/${encodeURIComponent(studentId)}`
                : '/admin/students'
            }
            className="portal-text-muted"
            style={{ fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Back
          </Link>
          <h1 className="admin-page__title admin-page__title--inline">
            Edit student
          </h1>
        </div>
      </div>

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading student</p>
          <p className="portal-profile-state__detail">
            Please wait while we load this record.
          </p>
        </section>
      ) : null}

      {!sectionLoading && error && form === null ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load this student</p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
            <Link to="/admin/students" className="portal-btn portal-btn--secondary">
              Back to list
            </Link>
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Try again
            </button>
          </div>
        </section>
      ) : null}

      {!sectionLoading && form ? (
        <form
          onSubmit={onSubmit}
          className="portal-card portal-stack"
          style={{ gap: '1.25rem', width: '100%', maxWidth: '100%' }}
        >
          {error ? (
            <p
              className="portal-profile-state__detail portal-profile-state--error"
              role="alert"
              style={{ margin: 0 }}
            >
              {error}
            </p>
          ) : null}

          <fieldset
            disabled={saving}
            className="portal-stack"
            style={{ gap: '1rem', border: 'none', margin: 0, padding: 0 }}
          >
            <legend className="portal-section-heading" style={{ padding: 0 }}>
              Profile fields
            </legend>
            {field('name', 'Name *')}
            {form ? (
              <div className="portal-stack" style={{ gap: '0.35rem' }}>
                <label
                  htmlFor="admin-edit-program"
                  className="portal-card-note"
                  style={{ margin: 0 }}
                >
                  Program *
                </label>
                <select
                  id="admin-edit-program"
                  className="admin-input"
                  style={{ width: '100%', maxWidth: '100%' }}
                  value={form.program}
                  onChange={(ev) =>
                    setForm((prev) =>
                      prev ? { ...prev, program: ev.target.value } : prev,
                    )
                  }
                  disabled={saving}
                >
                  <option value="DAHM">DAHM</option>
                  <option value="MAHM">MAHM</option>
                </select>
              </div>
            ) : null}
            {field('email', 'Email')}
            {form ? (
              <div className="portal-stack" style={{ gap: '0.35rem' }}>
                <label
                  htmlFor="admin-edit-gender"
                  className="portal-card-note"
                  style={{ margin: 0 }}
                >
                  Gender
                </label>
                <select
                  id="admin-edit-gender"
                  className="admin-input"
                  style={{ width: '100%', maxWidth: '100%' }}
                  value={form.gender}
                  onChange={(ev) =>
                    setForm((prev) =>
                      prev ? { ...prev, gender: ev.target.value } : prev,
                    )
                  }
                  disabled={saving}
                >
                  <option value="">Select…</option>
                  {!genderOptions.includes(form.gender) && form.gender !== '' ? (
                    <option value={form.gender}>
                      {form.gender} (legacy)
                    </option>
                  ) : null}
                  {ADMIN_GENDER_SELECT_VALUES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {field('backgroundSchool', 'Background school')}
            {form ? (
              <div className="portal-stack" style={{ gap: '0.35rem' }}>
                <label
                  htmlFor="admin-edit-degree"
                  className="portal-card-note"
                  style={{ margin: 0 }}
                >
                  Highest degree
                </label>
                <select
                  id="admin-edit-degree"
                  className="admin-input"
                  style={{ width: '100%', maxWidth: '100%' }}
                  value={form.highestDegree}
                  onChange={(ev) =>
                    setForm((prev) =>
                      prev
                        ? { ...prev, highestDegree: ev.target.value }
                        : prev,
                    )
                  }
                  disabled={saving}
                >
                  <option value="">Select…</option>
                  {!degreeOptions.includes(form.highestDegree) &&
                  form.highestDegree !== '' ? (
                    <option value={form.highestDegree}>
                      {form.highestDegree} (legacy)
                    </option>
                  ) : null}
                  {ADMIN_HIGHEST_DEGREE_VALUES.map((deg) => (
                    <option key={deg} value={deg}>
                      {deg}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {field('requirementsId', 'Requirements ID')}
            {field('address', 'Address')}
            {field('city', 'City')}
            {field('state', 'State')}
            {field('zip', 'Zip')}
            {field('signedDate', 'Signed date', { type: 'date', id: 'admin-edit-signed' })}
            {field('enrollStartDate', 'Enroll start date', {
              type: 'date',
              id: 'admin-edit-enroll',
            })}
            {field('dob', 'Date of Birth', { type: 'date', id: 'admin-edit-dob' })}
            {field('ssn', 'SSN')}
            {field('visa', 'Visa')}
            {field('phone1', 'Phone 1')}
            {field('phone2', 'Phone 2')}
            {field('phone3', 'Phone 3')}
            {form ? (
              <div className="portal-stack" style={{ gap: '0.35rem' }}>
                <label
                  htmlFor="admin-edit-citizenship"
                  className="portal-card-note"
                  style={{ margin: 0 }}
                >
                  Citizenship
                </label>
                <select
                  id="admin-edit-citizenship"
                  className="admin-input"
                  style={{ width: '100%', maxWidth: '100%' }}
                  value={form.citizenship}
                  onChange={(ev) =>
                    setForm((prev) =>
                      prev ? { ...prev, citizenship: ev.target.value } : prev,
                    )
                  }
                  disabled={saving}
                >
                  <option value="">Select…</option>
                  {!citizenshipOptions.includes(form.citizenship) &&
                  form.citizenship !== '' ? (
                    <option value={form.citizenship}>
                      {form.citizenship} (legacy)
                    </option>
                  ) : null}
                  {ADMIN_CITIZENSHIP_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {form ? (
              <div className="portal-stack" style={{ gap: '0.35rem' }}>
                <label
                  htmlFor="admin-edit-race"
                  className="portal-card-note"
                  style={{ margin: 0 }}
                >
                  Race
                </label>
                <select
                  id="admin-edit-race"
                  className="admin-input"
                  style={{ width: '100%', maxWidth: '100%' }}
                  value={form.race}
                  onChange={(ev) =>
                    setForm((prev) =>
                      prev ? { ...prev, race: ev.target.value } : prev,
                    )
                  }
                  disabled={saving}
                >
                  <option value="">Select…</option>
                  {!raceOptions.includes(form.race) && form.race !== '' ? (
                    <option value={form.race}>{form.race} (legacy)</option>
                  ) : null}
                  {ADMIN_RACE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {form ? (
              <div className="portal-stack" style={{ gap: '0.35rem' }}>
                <label
                  htmlFor="admin-edit-marital"
                  className="portal-card-note"
                  style={{ margin: 0 }}
                >
                  Marital Status
                </label>
                <select
                  id="admin-edit-marital"
                  className="admin-input"
                  style={{ width: '100%', maxWidth: '100%' }}
                  value={form.marital}
                  onChange={(ev) =>
                    setForm((prev) =>
                      prev ? { ...prev, marital: ev.target.value } : prev,
                    )
                  }
                  disabled={saving}
                >
                  <option value="">Select…</option>
                  {!maritalOptions.includes(form.marital) &&
                  form.marital !== '' ? (
                    <option value={form.marital}>{form.marital} (legacy)</option>
                  ) : null}
                  {ADMIN_MARITAL_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </fieldset>

          <div className="portal-actions">
            <button
              type="submit"
              className="portal-btn portal-btn--primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <Link
              to={`/admin/students/${encodeURIComponent(studentId)}`}
              className="portal-btn portal-btn--secondary"
            >
              Cancel
            </Link>
          </div>
        </form>
      ) : null}
    </main>
  )
}

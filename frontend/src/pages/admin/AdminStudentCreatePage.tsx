import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createAdminStudent,
  fetchNextAdminStudentId,
  type AdminDivision,
  type CreateAdminStudentBody,
} from '../../lib/api'

function nullableTrim(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

function parseRequirementsId(s: string): number | null | 'invalid' {
  const t = s.trim()
  if (t === '') return null
  const n = Number.parseInt(t, 10)
  if (!Number.isFinite(n)) return 'invalid'
  return n
}

function localCalendarDateIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isValidEntryDateIso(s: string): boolean {
  const t = s.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false
  const y = Number(t.slice(0, 4))
  const mo = Number(t.slice(5, 7))
  const d = Number(t.slice(8, 10))
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const check = new Date(y, mo - 1, d)
  return (
    check.getFullYear() === y &&
    check.getMonth() === mo - 1 &&
    check.getDate() === d
  )
}

const defaultEntryDate = localCalendarDateIso()

export function AdminStudentCreatePage() {
  const navigate = useNavigate()

  const [division, setDivision] = useState<AdminDivision | ''>('')
  const [entryDate, setEntryDate] = useState<string>(defaultEntryDate)

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('')
  const [requirementsId, setRequirementsId] = useState('')
  const [highestDegree, setHighestDegree] = useState('')
  const [backgroundSchool, setBackgroundSchool] = useState('')
  const [signedDate, setSignedDate] = useState('')
  const [enrollStartDate, setEnrollStartDate] = useState('')
  const [address, setAddress] = useState('')
  const [address2, setAddress2] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canPreview =
    division === 'Chinese' || division === 'English'
      ? isValidEntryDateIso(entryDate)
      : false

  useEffect(() => {
    if (!canPreview) {
      setPreviewId(null)
      setPreviewLoading(false)
      setPreviewError(null)
      return
    }

    if (division !== 'Chinese' && division !== 'English') {
      return
    }

    const ac = new AbortController()
    setPreviewLoading(true)
    setPreviewError(null)
    setPreviewId(null)

    ;(async () => {
      try {
        const id = await fetchNextAdminStudentId(division, entryDate.trim(), {
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setPreviewId(id)
        setPreviewError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setPreviewId(null)
        setPreviewError(
          e instanceof Error ? e.message : 'Could not load next student id.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setPreviewLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [canPreview, division, entryDate])

  const requirementsParsed = useMemo(
    () => parseRequirementsId(requirementsId),
    [requirementsId],
  )

  const formValid =
    canPreview &&
    !previewLoading &&
    previewId != null &&
    previewError == null &&
    name.trim() !== '' &&
    initialPassword.trim() !== '' &&
    requirementsParsed !== 'invalid'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formValid) return
    if (division !== 'Chinese' && division !== 'English') return

    const reqId = requirementsParsed

    const body: CreateAdminStudentBody = {
      division,
      entryDate: entryDate.trim(),
      name: name.trim(),
      initialPassword,
      email: nullableTrim(email),
      gender: nullableTrim(gender),
      requirementsId: reqId,
      highestDegree: nullableTrim(highestDegree),
      backgroundSchool: nullableTrim(backgroundSchool),
      signedDate: nullableTrim(signedDate),
      enrollStartDate: nullableTrim(enrollStartDate),
      address: nullableTrim(address),
      address2: nullableTrim(address2),
      city: nullableTrim(city),
      state: nullableTrim(state),
      zip: nullableTrim(zip),
    }

    setSaving(true)
    setError(null)
    try {
      const res = await createAdminStudent(body)
      navigate(`/admin/students/${encodeURIComponent(res.studentId)}`, {
        replace: true,
      })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create student.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-page__toolbar">
        <div>
          <Link
            to="/admin/students"
            className="portal-text-muted"
            style={{ fontSize: '0.875rem', textDecoration: 'none' }}
          >
            ← Back
          </Link>
          <h1 className="admin-page__title admin-page__title--inline">
            Add student
          </h1>
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="portal-card portal-stack"
        style={{ gap: '1.25rem', maxWidth: '40rem' }}
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

        <section
          className="portal-stack"
          style={{ gap: '0.5rem' }}
          aria-live="polite"
        >
          <p className="portal-card-note" style={{ margin: 0 }}>
            Next student ID (preview)
          </p>
          {previewLoading ? (
            <p className="portal-profile-state__detail" style={{ margin: 0 }}>
              Computing next id…
            </p>
          ) : null}
          {previewError ? (
            <p
              className="portal-profile-state__detail portal-profile-state--error"
              role="alert"
              style={{ margin: 0 }}
            >
              {previewError}
            </p>
          ) : null}
          {!previewLoading && previewId ? (
            <p
              className="portal-section-heading"
              style={{ margin: 0, fontSize: '1.125rem' }}
            >
              Generated Student ID: {previewId}
            </p>
          ) : null}
          {!previewLoading && !canPreview ? (
            <p className="portal-profile-state__detail" style={{ margin: 0 }}>
              Select division and a valid entry date to preview the next id.
            </p>
          ) : null}
          {!previewLoading &&
          canPreview &&
          previewId == null &&
          !previewError ? (
            <p className="portal-profile-state__detail" style={{ margin: 0 }}>
              Loading preview…
            </p>
          ) : null}
        </section>

        <fieldset
          disabled={saving}
          className="portal-stack"
          style={{ gap: '1rem', border: 'none', margin: 0, padding: 0 }}
        >
          <legend className="portal-section-heading" style={{ padding: 0 }}>
            New student
          </legend>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-division" className="portal-card-note" style={{ margin: 0 }}>
              Division *
            </label>
            <select
              id="admin-create-division"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={division}
              onChange={(ev) =>
                setDivision(ev.target.value as AdminDivision | '')
              }
            >
              <option value="">Select…</option>
              <option value="Chinese">Chinese</option>
              <option value="English">English</option>
            </select>
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-entry-date" className="portal-card-note" style={{ margin: 0 }}>
              Entry date *
            </label>
            <input
              id="admin-create-entry-date"
              type="date"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={entryDate}
              onChange={(ev) => setEntryDate(ev.target.value)}
            />
            <p className="portal-profile-state__detail" style={{ margin: 0, fontSize: '0.8125rem' }}>
              Student ID uses division, the entry year (last two digits), and the entry month from this date.
            </p>
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-name" className="portal-card-note" style={{ margin: 0 }}>
              Name *
            </label>
            <input
              id="admin-create-name"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={name}
              onChange={(ev) => setName(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-password" className="portal-card-note" style={{ margin: 0 }}>
              Initial password *
            </label>
            <input
              id="admin-create-password"
              type="password"
              autoComplete="new-password"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={initialPassword}
              onChange={(ev) => setInitialPassword(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-email" className="portal-card-note" style={{ margin: 0 }}>
              Email
            </label>
            <input
              id="admin-create-email"
              type="email"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-gender" className="portal-card-note" style={{ margin: 0 }}>
              Gender
            </label>
            <input
              id="admin-create-gender"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={gender}
              onChange={(ev) => setGender(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-req" className="portal-card-note" style={{ margin: 0 }}>
              Requirements ID
            </label>
            <input
              id="admin-create-req"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={requirementsId}
              onChange={(ev) => setRequirementsId(ev.target.value)}
            />
            {requirementsParsed === 'invalid' ? (
              <span className="portal-profile-state--error" style={{ fontSize: '0.875rem' }}>
                Enter a whole number or leave blank.
              </span>
            ) : null}
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-degree" className="portal-card-note" style={{ margin: 0 }}>
              Highest degree
            </label>
            <input
              id="admin-create-degree"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={highestDegree}
              onChange={(ev) => setHighestDegree(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-bg" className="portal-card-note" style={{ margin: 0 }}>
              Background school
            </label>
            <input
              id="admin-create-bg"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={backgroundSchool}
              onChange={(ev) => setBackgroundSchool(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-signed" className="portal-card-note" style={{ margin: 0 }}>
              Signed date
            </label>
            <input
              id="admin-create-signed"
              type="date"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={signedDate}
              onChange={(ev) => setSignedDate(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-enroll" className="portal-card-note" style={{ margin: 0 }}>
              Enroll start date
            </label>
            <input
              id="admin-create-enroll"
              type="date"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={enrollStartDate}
              onChange={(ev) => setEnrollStartDate(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-addr" className="portal-card-note" style={{ margin: 0 }}>
              Address
            </label>
            <input
              id="admin-create-addr"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={address}
              onChange={(ev) => setAddress(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-addr2" className="portal-card-note" style={{ margin: 0 }}>
              Address 2
            </label>
            <input
              id="admin-create-addr2"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={address2}
              onChange={(ev) => setAddress2(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-city" className="portal-card-note" style={{ margin: 0 }}>
              City
            </label>
            <input
              id="admin-create-city"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={city}
              onChange={(ev) => setCity(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-state" className="portal-card-note" style={{ margin: 0 }}>
              State
            </label>
            <input
              id="admin-create-state"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={state}
              onChange={(ev) => setState(ev.target.value)}
            />
          </div>

          <div className="portal-stack" style={{ gap: '0.35rem' }}>
            <label htmlFor="admin-create-zip" className="portal-card-note" style={{ margin: 0 }}>
              Zip
            </label>
            <input
              id="admin-create-zip"
              className="admin-input"
              style={{ maxWidth: '28rem', width: '100%' }}
              value={zip}
              onChange={(ev) => setZip(ev.target.value)}
            />
          </div>
        </fieldset>

        <div className="portal-actions">
          <button
            type="submit"
            className="portal-btn portal-btn--primary"
            disabled={saving || !formValid}
          >
            {saving ? 'Creating…' : 'Create student'}
          </button>
          <Link to="/admin/students" className="portal-btn portal-btn--secondary">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}

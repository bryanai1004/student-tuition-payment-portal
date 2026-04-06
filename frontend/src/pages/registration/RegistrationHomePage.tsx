import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  fetchCurrentAcademicTerm,
  fetchRecentAcademicTerms,
  type AcademicTerm,
} from '../../lib/api'

const ACTIONS = [
  {
    to: 'add-drop',
    title: 'Add / Drop Courses',
    description: 'Adjust your course load during the published add/drop period.',
  },
  {
    to: 'search',
    title: 'Course Search',
    description: 'Browse sections, seats, and meeting times before you register.',
  },
  {
    to: 'schedule',
    title: 'My Timetable',
    description: 'View your weekly class and exam schedule for the term.',
  },
  {
    to: 'form',
    title: 'Registration Form',
    description: 'Download or submit program registration paperwork when required.',
  },
  {
    to: 'status',
    title: 'Registration Status',
    description: 'See holds, approvals, and credits registered for the current term.',
  },
] as const

function mergeTermOptions(
  recent: AcademicTerm[],
  current: AcademicTerm | null,
): AcademicTerm[] {
  const byId = new Map<string, AcademicTerm>()
  for (const t of recent) {
    byId.set(t.id, t)
  }
  if (current && !byId.has(current.id)) {
    byId.set(current.id, current)
  }
  return Array.from(byId.values()).sort((a, b) => b.sequence_no - a.sequence_no)
}

export function RegistrationHomePage() {
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
    ;(async () => {
      try {
        const [recent, current] = await Promise.all([
          fetchRecentAcademicTerms(3, { signal: ac.signal }),
          fetchCurrentAcademicTerm({ signal: ac.signal }),
        ])
        if (ac.signal.aborted) return
        setRecentTerms(recent)
        setCurrentTerm(current)
        const defaultId =
          current?.id ?? (recent.length > 0 ? recent[0]!.id : '')
        setSelectedId(defaultId)
        setLoadState('ready')
      } catch (e) {
        if (ac.signal.aborted) return
        setLoadState('error')
        setLoadError(e instanceof Error ? e.message : 'Could not load terms.')
      }
    })()
    return () => ac.abort()
  }, [])

  const termQuery =
    selectedId.trim() !== '' ? `?term=${encodeURIComponent(selectedId.trim())}` : ''

  return (
    <main className="portal-page portal-stack">
      <section
        className="portal-module-panel portal-registration-term-panel"
        aria-labelledby="registration-term-heading"
      >
        <h2 id="registration-term-heading" className="portal-module-panel-heading">
          Select Term
        </h2>
        {loadState === 'loading' ? (
          <p className="portal-text-muted portal-registration-term-status" role="status">
            Loading terms…
          </p>
        ) : null}
        {loadState === 'error' ? (
          <p className="portal-text-muted portal-registration-term-status" role="alert">
            {loadError ?? 'Could not load terms.'}
          </p>
        ) : null}
        {loadState === 'ready' && options.length === 0 ? (
          <p className="portal-text-muted portal-registration-term-status" role="status">
            No registration terms are currently available.
          </p>
        ) : null}
        {loadState === 'ready' && options.length > 0 ? (
          <>
            <div className="portal-registration-term-field">
              <label htmlFor="registration-term-select" className="portal-registration-term-label">
                Registration term
              </label>
              <select
                id="registration-term-select"
                className="portal-account-ledger__select portal-registration-term-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {options.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.term_label}
                  </option>
                ))}
              </select>
            </div>
            <p className="portal-text-muted portal-registration-term-hint">
              Recent terms shown here are published by the registrar.
            </p>
          </>
        ) : null}
      </section>

      <section className="portal-module-panel" aria-labelledby="registration-actions-heading">
        <h2 id="registration-actions-heading" className="portal-module-panel-heading">
          Registration services
        </h2>
        <ul className="portal-registration-action-grid">
          {ACTIONS.map((action) => (
            <li key={action.to}>
              <NavLink
                to={`${action.to}${termQuery}`}
                className="portal-registration-action-card"
              >
                <span className="portal-registration-action-arrow" aria-hidden="true">
                  →
                </span>
                <h3 className="portal-registration-action-title">{action.title}</h3>
                <p className="portal-registration-action-desc">{action.description}</p>
              </NavLink>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

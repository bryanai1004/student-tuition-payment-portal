import { useEffect, useMemo, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentAcademics,
  type StudentAcademicsResponse,
} from '../../lib/api'

type AcademicsMode = 'quarter' | 'transcript'
type TranscriptRow = StudentAcademicsResponse['transcript'][number]

const SCHOOL_TITLE = 'Alhambra Medical University'

function termYearKey(term: string, year: number): string {
  return `${term}\t${year}`
}

function defaultTermKey(data: StudentAcademicsResponse): string | null {
  const ct = data.currentTerm
  if (ct) {
    const inList = data.availableTerms.some(
      (t) => t.term === ct.term && t.year === ct.year,
    )
    if (inList) return termYearKey(ct.term, ct.year)
  }
  if (data.availableTerms.length > 0) {
    const a = data.availableTerms[0]
    return termYearKey(a.term, a.year)
  }
  if (ct) return termYearKey(ct.term, ct.year)
  return null
}

function termRank(term: string): number {
  const t = term.trim().toLowerCase()
  if (t === 'fall') return 4
  if (t === 'summer') return 3
  if (t === 'spring') return 2
  if (t === 'winter') return 1
  return 0
}

function compareTermGroups(
  a: { year: number; term: string },
  b: { year: number; term: string },
): number {
  if (a.year !== b.year) return b.year - a.year
  return termRank(b.term) - termRank(a.term)
}

function groupTranscriptByTermYear(
  transcript: TranscriptRow[],
): Array<{ year: number; term: string; rows: TranscriptRow[] }> {
  const order: Array<{ year: number; term: string }> = []
  const map = new Map<string, TranscriptRow[]>()
  for (const row of transcript) {
    const key = `${row.year}\t${row.term}`
    if (!map.has(key)) {
      map.set(key, [])
      order.push({ year: row.year, term: row.term })
    }
    map.get(key)!.push(row)
  }
  const sortedKeys = [...order].sort(compareTermGroups)
  return sortedKeys.map(({ year, term }) => ({
    year,
    term,
    rows: map.get(`${year}\t${term}`)!,
  }))
}

function formatIssueDate(): string {
  try {
    return new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function AcademicsPortalPage() {
  const { currentStudentId } = useAccount()
  const [mode, setMode] = useState<AcademicsMode>('quarter')
  const [academics, setAcademics] = useState<StudentAcademicsResponse | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setAcademics(null)
      setLoading(false)
      setError(null)
      setSelectedKey(null)
      return
    }

    const ac = new AbortController()
    setAcademics(null)
    setLoading(true)
    setError(null)
    setSelectedKey(null)

    ;(async () => {
      try {
        const data = await fetchStudentAcademics(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setAcademics(data)
        setSelectedKey(defaultTermKey(data))
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setAcademics(null)
        setError(
          e instanceof Error
            ? e.message
            : 'Could not load your academic record.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, reloadKey])

  const grouped = useMemo(
    () =>
      academics ? groupTranscriptByTermYear(academics.transcript) : [],
    [academics],
  )

  const id = currentStudentId?.trim()
  const showEmpty = !id
  const sectionLoading = loading && academics === null && error === null

  let selectedTerm = ''
  let selectedYear = NaN
  if (selectedKey) {
    const parts = selectedKey.split('\t')
    selectedTerm = parts[0] ?? ''
    selectedYear = Number(parts[1])
  }

  const quarterRows =
    academics && selectedTerm && Number.isFinite(selectedYear)
      ? academics.transcript.filter(
          (r) => r.term === selectedTerm && r.year === selectedYear,
        )
      : []

  const issueDate = formatIssueDate()

  return (
    <main className="portal-page">
      <div
        className="portal-academics-print-hide"
        role="tablist"
        aria-label="Academics view"
      >
        <div className="portal-academics-mode-toggle">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'quarter'}
            className={[
              'portal-academics-mode-toggle__btn',
              mode === 'quarter'
                ? 'portal-academics-mode-toggle__btn--active'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setMode('quarter')}
          >
            Quarter Grades
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'transcript'}
            className={[
              'portal-academics-mode-toggle__btn',
              mode === 'transcript'
                ? 'portal-academics-mode-toggle__btn--active'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setMode('transcript')}
          >
            Transcript Preview
          </button>
        </div>
      </div>

      {showEmpty ? (
        <section
          className="portal-card portal-profile-state"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Sign in to view academics</p>
          <p className="portal-profile-state__detail">
            Your grades and transcript appear here after you log in with your
            student account.
          </p>
        </section>
      ) : null}

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading academics</p>
          <p className="portal-profile-state__detail">
            Please wait while we load your record.
          </p>
        </section>
      ) : null}

      {!showEmpty && !sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">
            We could not load your academics
          </p>
          <p className="portal-profile-state__detail">{error}</p>
          <div className="portal-actions portal-profile-state__actions">
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

      {!showEmpty && !sectionLoading && !error && academics && mode === 'quarter' ? (
        <>
          <div className="portal-stack portal-account-ledger__toolbar portal-academics-print-hide">
            <label
              className="portal-account-ledger__quarter-label"
              htmlFor="academics-term-select"
            >
              <span className="portal-card-note">Term</span>
              <select
                id="academics-term-select"
                className="portal-account-ledger__select"
                value={selectedKey ?? ''}
                onChange={(e) => setSelectedKey(e.target.value || null)}
              >
                {academics.availableTerms.length === 0 ? (
                  <option value="">No terms on file</option>
                ) : null}
                {academics.availableTerms.map((t) => (
                  <option
                    key={termYearKey(t.term, t.year)}
                    value={termYearKey(t.term, t.year)}
                  >
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="portal-table-wrap">
            <table className="portal-table portal-table--grades">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Course Title</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Numeric Grade</th>
                </tr>
              </thead>
              <tbody>
                {quarterRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="portal-card-note">
                      No graded courses for this term.
                    </td>
                  </tr>
                ) : (
                  quarterRows.map((row, idx) => (
                    <tr
                      key={`${row.courseCode}-${row.term}-${row.year}-${idx}`}
                    >
                      <td>{row.courseCode}</td>
                      <td>{row.courseTitle}</td>
                      <td>
                        <span className="portal-status">
                          {row.grade?.trim() ? row.grade : '—'}
                        </span>
                      </td>
                      <td>
                        {row.numericGrade != null &&
                        Number.isFinite(row.numericGrade)
                          ? String(row.numericGrade)
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {!showEmpty && !sectionLoading && !error && academics && mode === 'transcript' ? (
        <div className="portal-academics-transcript-preview">
          <div className="portal-academics-print-hide portal-academics-transcript-preview__actions">
            <button
              type="button"
              className="portal-btn portal-btn--secondary"
              onClick={() => window.print()}
            >
              Print
            </button>
          </div>

          <div className="portal-academics-transcript-sheet">
            <header className="portal-academics-transcript-sheet__masthead">
              <p className="portal-academics-transcript-sheet__school">
                {SCHOOL_TITLE}
              </p>
              <h2 className="portal-academics-transcript-sheet__title">
                UNOFFICIAL TRANSCRIPT
              </h2>
            </header>

            <dl className="portal-academics-transcript-sheet__meta">
              <div className="portal-academics-transcript-sheet__meta-row">
                <dt>Student name</dt>
                <dd>{academics.studentName}</dd>
              </div>
              <div className="portal-academics-transcript-sheet__meta-row">
                <dt>Student ID</dt>
                <dd>{academics.studentId}</dd>
              </div>
              <div className="portal-academics-transcript-sheet__meta-row">
                <dt>Date issued</dt>
                <dd>{issueDate}</dd>
              </div>
              <div className="portal-academics-transcript-sheet__meta-row">
                <dt>Date of birth</dt>
                <dd className="portal-academics-transcript-sheet__omitted">
                  Not on file in portal
                </dd>
              </div>
              <div className="portal-academics-transcript-sheet__meta-row">
                <dt>Address</dt>
                <dd className="portal-academics-transcript-sheet__omitted">
                  Not on file in portal
                </dd>
              </div>
              <div className="portal-academics-transcript-sheet__meta-row">
                <dt>Program / major</dt>
                <dd className="portal-academics-transcript-sheet__omitted">
                  Not on file in portal
                </dd>
              </div>
              <div className="portal-academics-transcript-sheet__meta-row">
                <dt>Transfer credits</dt>
                <dd className="portal-academics-transcript-sheet__omitted">
                  Not on file in portal
                </dd>
              </div>
            </dl>

            <p className="portal-academics-transcript-sheet__disclaimer">
              This web preview is unofficial and not certified for external use.
            </p>

            {grouped.length === 0 ? (
              <p className="portal-card-note">No transcript rows on file yet.</p>
            ) : (
              <div className="portal-academics-transcript-sheet__terms">
                {grouped.map((g) => (
                  <section
                    key={`${g.year}-${g.term}`}
                    className="portal-academics-transcript-sheet__term-block"
                  >
                    <h3 className="portal-academics-transcript-sheet__term-heading">
                      {g.term} {g.year}
                    </h3>
                    <div className="portal-table-wrap">
                      <table className="portal-table portal-table--grades portal-academics-transcript-sheet__table">
                        <thead>
                          <tr>
                            <th scope="col">Code</th>
                            <th scope="col">Course Title</th>
                            <th scope="col">Grade</th>
                            <th scope="col">Numeric</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((row, idx) => (
                            <tr
                              key={`${row.courseCode}-${g.term}-${g.year}-${idx}`}
                            >
                              <td>{row.courseCode}</td>
                              <td>{row.courseTitle}</td>
                              <td>
                                {row.grade?.trim() ? row.grade : '—'}
                              </td>
                              <td>
                                {row.numericGrade != null &&
                                Number.isFinite(row.numericGrade)
                                  ? String(row.numericGrade)
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}

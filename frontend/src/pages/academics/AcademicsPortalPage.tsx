import { useEffect, useMemo, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentAcademics,
  type StudentAcademicsResponse,
} from '../../lib/api'
import {
  bilingualCourseTitleParts,
  buildTranscriptTermOptions,
  defaultTermKeyFromTranscript,
  formatCreditCell,
  groupTranscriptByTermYear,
  rowsForSelectedTerm,
  termYearKey,
  type TranscriptRow,
} from '../../lib/academicsTranscriptDisplay'

type AcademicsMode = 'quarter' | 'transcript'

const SCHOOL_TITLE = 'Alhambra Medical University'

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

function CourseTitleCell({ row }: { row: TranscriptRow }) {
  const { primary, secondary } = bilingualCourseTitleParts(row)
  return (
    <td className="portal-academics-course-title-cell">
      <span className="portal-academics-course-title__en">{primary}</span>
      {secondary ? (
        <span className="portal-academics-course-title__zh" lang="zh-Hant">
          {secondary}
        </span>
      ) : null}
    </td>
  )
}

const GRADES_TABLE_CLASS =
  'portal-table portal-table--grades portal-academics-portal-grades-table'

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
        const opts = buildTranscriptTermOptions(data.transcript)
        setSelectedKey(defaultTermKeyFromTranscript(data, opts))
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

  const termOptions = useMemo(
    () => (academics ? buildTranscriptTermOptions(academics.transcript) : []),
    [academics],
  )

  useEffect(() => {
    if (!academics) return
    if (termOptions.length === 0) {
      if (selectedKey != null) setSelectedKey(null)
      return
    }
    const valid = new Set(termOptions.map((o) => o.key))
    if (selectedKey != null && !valid.has(selectedKey)) {
      setSelectedKey(defaultTermKeyFromTranscript(academics, termOptions))
    }
  }, [academics, termOptions, selectedKey])

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
    academics && selectedKey
      ? rowsForSelectedTerm(
          academics.transcript,
          selectedTerm,
          selectedYear,
        )
      : []

  const issueDate = formatIssueDate()

  return (
    <main className="portal-page portal-stack">
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
        <section className="portal-stack" aria-label="Quarter grades">
          <div className="portal-account-ledger__toolbar portal-academics-print-hide">
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
                {termOptions.length === 0 ? (
                  <option value="">No terms on file</option>
                ) : null}
                {termOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="portal-table-wrap">
            <table className={GRADES_TABLE_CLASS}>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Course title</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Numeric grade</th>
                  <th scope="col">Credit</th>
                </tr>
              </thead>
              <tbody>
                {quarterRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="portal-card-note">
                      No graded courses for this term.
                    </td>
                  </tr>
                ) : (
                  quarterRows.map((row, idx) => (
                    <tr
                      key={`${row.courseCode}-${row.term}-${row.year}-${idx}`}
                    >
                      <td>{row.courseCode}</td>
                      <CourseTitleCell row={row} />
                      <td>{row.grade?.trim() ? row.grade : '—'}</td>
                      <td>
                        {row.numericGrade != null &&
                        Number.isFinite(row.numericGrade)
                          ? String(row.numericGrade)
                          : '—'}
                      </td>
                      <td>{formatCreditCell(row)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!showEmpty && !sectionLoading && !error && academics && mode === 'transcript' ? (
        <div className="portal-academics-transcript-preview portal-stack">
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
                    key={termYearKey(g.term, g.year)}
                    className="portal-academics-transcript-sheet__term-block"
                  >
                    <h3 className="portal-academics-transcript-sheet__term-heading">
                      {g.term} {g.year}
                    </h3>
                    <div className="portal-table-wrap">
                      <table
                        className={`${GRADES_TABLE_CLASS} portal-academics-transcript-sheet__table`}
                      >
                        <thead>
                          <tr>
                            <th scope="col">Code</th>
                            <th scope="col">Course title</th>
                            <th scope="col">Grade</th>
                            <th scope="col">Numeric</th>
                            <th scope="col">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((row, idx) => (
                            <tr
                              key={`${row.courseCode}-${g.term}-${g.year}-${idx}`}
                            >
                              <td>{row.courseCode}</td>
                              <CourseTitleCell row={row} />
                              <td>{row.grade?.trim() ? row.grade : '—'}</td>
                              <td>
                                {row.numericGrade != null &&
                                Number.isFinite(row.numericGrade)
                                  ? String(row.numericGrade)
                                  : '—'}
                              </td>
                              <td>{formatCreditCell(row)}</td>
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

import { useEffect, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentAcademics,
  type StudentAcademicsResponse,
} from '../../lib/api'

function termYearKey(term: string, year: number): string {
  return `${term}\t${year}`
}

export function GradesPage() {
  const { currentStudentId } = useAccount()

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
        const ct = data.currentTerm
        if (ct) {
          setSelectedKey(termYearKey(ct.term, ct.year))
        } else if (data.availableTerms.length > 0) {
          const a = data.availableTerms[0]
          setSelectedKey(termYearKey(a.term, a.year))
        } else {
          setSelectedKey(null)
        }
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setAcademics(null)
        setError(
          e instanceof Error ? e.message : 'Could not load your grades.',
        )
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false)
        }
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, reloadKey])

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

  const rows =
    academics && selectedTerm && Number.isFinite(selectedYear)
      ? academics.transcript.filter(
          (r) => r.term === selectedTerm && r.year === selectedYear,
        )
      : []

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">Grades</h2>
      <p className="portal-page-lede">
        Course grades and numeric scores for the term you select. Data comes from your student record.
      </p>

      {showEmpty ? (
        <section
          className="portal-card portal-profile-state"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Sign in to view grades</p>
          <p className="portal-profile-state__detail">
            Your graded coursework appears here after you log in with your student account.
          </p>
        </section>
      ) : null}

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading grades</p>
          <p className="portal-profile-state__detail">
            Please wait while we load your academic record.
          </p>
        </section>
      ) : null}

      {!showEmpty && !sectionLoading && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
          aria-live="assertive"
        >
          <p className="portal-profile-state__title">We could not load your grades</p>
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

      {!showEmpty && !sectionLoading && !error && academics ? (
        <>
          <div className="portal-stack portal-account-ledger__toolbar">
            <label
              className="portal-account-ledger__quarter-label"
              htmlFor="grades-term-select"
            >
              <span className="portal-card-note">Term</span>
              <select
                id="grades-term-select"
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
                  <th scope="col">Course</th>
                  <th scope="col">Title</th>
                  <th scope="col">Term</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Numeric Grade</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="portal-card-note">
                      No graded courses for this term.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={`${row.courseCode}-${row.term}-${row.year}-${idx}`}
                    >
                      <td>{row.courseCode}</td>
                      <td>{row.courseTitle}</td>
                      <td>
                        {row.term} {row.year}
                      </td>
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
    </main>
  )
}

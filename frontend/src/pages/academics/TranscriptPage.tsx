import { useEffect, useMemo, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentAcademics,
  type StudentAcademicsResponse,
} from '../../lib/api'

type TranscriptRow = StudentAcademicsResponse['transcript'][number]

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

/**
 * Groups transcript rows by (year, term), preserves API row order within each group,
 * and orders groups by year DESC then Fall &gt; Summer &gt; Spring &gt; Winter.
 */
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

export function TranscriptPage() {
  const { currentStudentId } = useAccount()

  const [academics, setAcademics] = useState<StudentAcademicsResponse | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setAcademics(null)
      setLoading(false)
      setError(null)
      return
    }

    const ac = new AbortController()
    setAcademics(null)
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const data = await fetchStudentAcademics(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setAcademics(data)
        setError(null)
      } catch (e) {
        if (ac.signal.aborted) return
        setAcademics(null)
        setError(
          e instanceof Error ? e.message : 'Could not load your transcript.',
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

  const termsOnRecord = useMemo(
    () => grouped.map((g) => `${g.term} ${g.year}`),
    [grouped],
  )

  const id = currentStudentId?.trim()
  const showEmpty = !id
  const sectionLoading = loading && academics === null && error === null

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">Transcript</h2>
      <p className="portal-page-lede">
        Your transcript is the official record of your academic work. Unofficial copies are available for your
        review; official transcripts are issued on request and may incur a processing fee.
      </p>

      {showEmpty ? (
        <section
          className="portal-card portal-profile-state"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Sign in to view your transcript</p>
          <p className="portal-profile-state__detail">
            Your coursework history appears here after you log in with your student account.
          </p>
        </section>
      ) : null}

      {sectionLoading ? (
        <section
          className="portal-card portal-profile-state"
          aria-busy="true"
          aria-live="polite"
        >
          <p className="portal-profile-state__title">Loading transcript</p>
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
          <p className="portal-profile-state__title">We could not load your transcript</p>
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
        <div className="portal-stack">
          <section className="portal-card portal-academics-transcript-section" aria-labelledby="unofficial-heading">
            <h3 id="unofficial-heading" className="portal-section-heading">
              Unofficial transcript
            </h3>
            <p className="portal-card-note portal-academics-transcript-desc">
              View a web-based summary for advising and planning. This document is not certified for external use.
            </p>
            {grouped.length === 0 ? (
              <p className="portal-card-note">No transcript rows on file yet.</p>
            ) : (
              <div className="portal-stack">
                {grouped.map((g) => (
                  <div key={`${g.year}-${g.term}`}>
                    <p className="portal-card-label">{g.term} {g.year}</p>
                    <div className="portal-table-wrap">
                      <table className="portal-table portal-table--grades">
                        <thead>
                          <tr>
                            <th scope="col">Course</th>
                            <th scope="col">Title</th>
                            <th scope="col">Grade</th>
                            <th scope="col">Numeric Grade</th>
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="portal-card portal-academics-transcript-section" aria-labelledby="official-heading">
            <h3 id="official-heading" className="portal-section-heading">
              Official transcript
            </h3>
            <p className="portal-card-note portal-academics-transcript-desc">
              Order a certified transcript for employers, licensing boards, or other institutions. Delivery options
              will be available in a later release.
            </p>
            <div className="portal-actions portal-academics-transcript-actions">
              <button type="button" className="portal-btn portal-btn--secondary">
                Request official transcript
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {!showEmpty && !sectionLoading && !error && academics ? (
        <section className="portal-module-panel" aria-labelledby="terms-heading">
          <h3 id="terms-heading" className="portal-module-panel-heading">
            Terms on record
          </h3>
          <ul className="portal-module-list">
            {termsOnRecord.length === 0 ? (
              <li className="portal-module-list-item">
                <span className="portal-module-list-label">None yet</span>
              </li>
            ) : (
              termsOnRecord.map((term) => (
                <li key={term} className="portal-module-list-item">
                  <span className="portal-module-list-label">{term}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}

      {!showEmpty && !sectionLoading && !error && academics ? (
        <div className="portal-card portal-academics-summary-block">
          <p className="portal-card-label">Summary</p>
          <p className="portal-card-value">{academics.studentName}</p>
          <p className="portal-card-note">
            Credits earned and GPA details may appear in a later release. This summary reflects your unofficial
            transcript data only.
          </p>
        </div>
      ) : null}
    </main>
  )
}

import { useEffect, useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useStudentPortalT } from '../../LanguageContext'
import { fetchStudentGpa, type StudentGpaResponse } from '../../lib/api'

function formatGpa(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

export function GpaPage() {
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const [gpa, setGpa] = useState<StudentGpaResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const id = currentStudentId?.trim()
    if (!id) {
      setGpa(null)
      setLoading(false)
      setError(null)
      return
    }

    const ac = new AbortController()
    setGpa(null)
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const data = await fetchStudentGpa(id, { signal: ac.signal })
        if (ac.signal.aborted) return
        setGpa(data)
      } catch (e) {
        if (ac.signal.aborted) return
        setGpa(null)
        setError(e instanceof Error ? e.message : t('couldNotLoadGradesFallback'))
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()

    return () => ac.abort()
  }, [currentStudentId, t])

  const id = currentStudentId?.trim()
  const showEmpty = !id

  const latestTermLabel =
    gpa?.latestTerm != null &&
    gpa.latestTerm.trim() !== '' &&
    gpa.latestYear != null &&
    Number.isFinite(gpa.latestYear)
      ? `${gpa.latestTerm.trim()} ${gpa.latestYear}`
      : null

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">{t('gpaHeading')}</h2>
      <p className="portal-page-lede">{t('gpaPageLede')}</p>

      {showEmpty ? (
        <section className="portal-card portal-profile-state" aria-live="polite">
          <p className="portal-profile-state__title">{t('signInToViewGrades')}</p>
          <p className="portal-profile-state__detail">{t('signInToViewGradesDetail')}</p>
        </section>
      ) : null}

      {loading && gpa == null && !error ? (
        <section className="portal-card portal-profile-state" aria-busy="true" aria-live="polite">
          <p className="portal-profile-state__title">{t('loadingGrades')}</p>
        </section>
      ) : null}

      {!showEmpty && error ? (
        <section
          className="portal-card portal-profile-state portal-profile-state--error"
          role="alert"
        >
          <p className="portal-profile-state__title">{t('couldNotLoadGrades')}</p>
          <p className="portal-profile-state__detail">{error}</p>
        </section>
      ) : null}

      {!showEmpty && !loading && !error && gpa ? (
        <>
          <div className="portal-grid-4">
            <div className="portal-card">
              <p className="portal-card-label">{t('cumulativeGpa')}</p>
              <p className="portal-card-value">{formatGpa(gpa.cumulativeGpa)}</p>
              <p className="portal-card-note">{t('allTermsGradedOnly')}</p>
            </div>
            <div className="portal-card">
              <p className="portal-card-label">{t('termGpaSample')}</p>
              <p className="portal-card-value">{formatGpa(gpa.latestTermGpa)}</p>
              <p className="portal-card-note">
                {latestTermLabel ?? t('mostRecentTerm')}
              </p>
            </div>
            <div className="portal-card">
              <p className="portal-card-label">{t('completedCreditsLabel')}</p>
              <p className="portal-card-value">{gpa.completedCredits}</p>
              <p className="portal-card-note">{t('completedTowardDegree')}</p>
            </div>
            <div className="portal-card">
              <p className="portal-card-label">{t('attemptedCredits')}</p>
              <p className="portal-card-value">{gpa.attemptedCreditsIncludingInProgress}</p>
              <p className="portal-card-note">{t('includesInProgress')}</p>
            </div>
          </div>

          {gpa.notes.length > 0 ? (
            <p className="portal-inline-note">{gpa.notes.join(' ')}</p>
          ) : (
            <p className="portal-inline-note">{t('gpaCalculationFootnote')}</p>
          )}
        </>
      ) : null}
    </main>
  )
}

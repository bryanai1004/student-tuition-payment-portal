import { useEffect, useState } from 'react'
import { useStudentPortalT } from '@/LanguageContext'
import type { StudentPortalKey } from '@/lib/i18n'
import { useAccount } from '../../context/AccountContext'
import {
  fetchStudentClinicalProgress,
  type StudentClinicalExamHistoryItem,
  type StudentClinicalProgressResponse,
} from '../../lib/api'

function examStatusLabel(
  status: StudentClinicalExamHistoryItem['status'],
  t: (key: StudentPortalKey) => string,
): string {
  switch (status) {
    case 'Not Taken':
      return t('clinicalProgressExamStatusNotTaken')
    case 'Pending Grade':
      return t('clinicalProgressExamStatusPendingGrade')
    case 'Completed':
      return t('clinicalProgressExamStatusCompleted')
    default:
      return status
  }
}

function formatExamTermCell(
  term: string | null,
  year: number | null,
  dash: string,
): string {
  const t = term?.trim() ?? ''
  const hasYear = year != null && Number.isFinite(year)
  if (!t && !hasYear) return dash
  if (t && hasYear) return `${t} ${year}`
  if (t) return t
  return String(year)
}

export function ClinicalProgressPage() {
  const t = useStudentPortalT()
  const { currentStudentId } = useAccount()
  const sid = currentStudentId?.trim() ?? ''

  const [data, setData] = useState<StudentClinicalProgressResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sid) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchStudentClinicalProgress(sid)
        if (!cancelled) setData(res)
      } catch (e) {
        if (!cancelled) {
          setData(null)
          setError(
            e instanceof Error ? e.message : t('clinicalProgressLoadError'),
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sid, t])

  const showEmptyAccount = !sid

  return (
    <main className="portal-page">
      <h2 className="portal-section-heading">{t('clinicalProgressNav')}</h2>

      {showEmptyAccount ? (
        <p className="portal-page-lede" role="status">
          {t('clinicalSignInAddDrop')}
        </p>
      ) : null}

      {error ? (
        <p className="portal-page-lede" role="alert">
          {error}
        </p>
      ) : null}

      {!showEmptyAccount && loading ? (
        <p className="portal-page-lede" aria-live="polite">
          {t('clinicalProgressLoading')}
        </p>
      ) : null}

      {!showEmptyAccount && !loading && data ? (
        <>
          <section className="portal-stack" aria-label={t('clinicalProgressSummaryAria')}>
            <p className="portal-page-lede" style={{ marginBottom: '0.25rem' }}>
              {t('clinicalProgressSummaryCompleted')}{' '}
              <strong>{data.completedCount}</strong>
            </p>
            <p className="portal-page-lede">
              {t('clinicalProgressSummaryHours')}{' '}
              <strong>{data.totalHours}h</strong>
            </p>
          </section>

          <section className="portal-module-panel portal-stack" aria-labelledby="clinical-progress-table">
            <h3 id="clinical-progress-table" className="portal-module-panel-heading">
              {t('clinicalProgressRecordsHeading')}
            </h3>
            <div className="portal-table-wrap portal-table-wrap--clinical-progress">
              <table className="portal-table portal-table--clinical-schedule portal-table--clinical-progress">
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">{t('clinicalProgressColCourse')}</th>
                    <th scope="col">{t('clinicalProgressColTerm')}</th>
                    <th scope="col">{t('clinicalProgressColHours')}</th>
                    <th scope="col">{t('clinicalProgressColGrade')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <span className="portal-inline-note portal-inline-note--flush">
                          {t('clinicalProgressEmpty')}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    data.records.map((row, idx) => (
                      <tr key={`${row.code}-${row.term}-${row.year}-${idx}`}>
                        <td>{row.code}</td>
                        <td>
                          {row.term} {row.year}
                        </td>
                        <td>{row.hours}</td>
                        <td>{row.grade}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className="portal-module-panel portal-stack"
            aria-labelledby="clinical-exam-history-table"
          >
            <h3 id="clinical-exam-history-table" className="portal-module-panel-heading">
              {t('clinicalProgressExamHistoryHeading')}
            </h3>
            <div className="portal-table-wrap portal-table-wrap--clinical-progress">
              <table
                className="portal-table portal-table--clinical-schedule portal-table--clinical-progress"
                aria-label={t('clinicalProgressExamHistoryAria')}
              >
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">{t('clinicalProgressExamColExam')}</th>
                    <th scope="col">{t('clinicalProgressExamColTerm')}</th>
                    <th scope="col">{t('clinicalProgressExamColStatus')}</th>
                    <th scope="col">{t('clinicalProgressExamColGrade')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.exams ?? []).map((row) => {
                    const dash = t('clinicalProgressExamDash')
                    const gradeCell =
                      row.grade != null && row.grade.trim() !== '' ? row.grade.trim() : dash
                    return (
                      <tr key={row.code}>
                        <td>{row.examName}</td>
                        <td>{formatExamTermCell(row.term, row.year, dash)}</td>
                        <td>{examStatusLabel(row.status, t)}</td>
                        <td>{gradeCell}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}

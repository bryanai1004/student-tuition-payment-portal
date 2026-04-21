import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '../../context/AccountContext'
import { postStudentEnroll } from '../../lib/api'
import { useCourseBin } from './CourseBinContext'
import { useRegistrationTermSearchParam } from './registrationTermSearch'

export function CourseBinCheckoutPage() {
  const t = useStudentPortalT()
  const registrationTermId = useRegistrationTermSearchParam()
  const { currentStudentId, isAuthenticated } = useAccount()
  const { items, clearCourseBin } = useCourseBin()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const termMissing =
    registrationTermId == null || registrationTermId.trim() === ''

  const onRegister = useCallback(async () => {
    setError(null)
    setSuccess(null)
    if (termMissing || !currentStudentId) {
      setError(
        termMissing ? t('checkoutErrorSelectTerm') : t('checkoutErrorSignIn'),
      )
      return
    }
    const sections = items
      .map((i) => {
        const schedule_track: 'EN' | 'CN' =
          i.schedule_track === 'CN' ? 'CN' : 'EN'
        return {
          course_code: i.course_code.trim(),
          section_code: i.section.trim(),
          schedule_track,
        }
      })
      .filter(
        (s) =>
          s.course_code !== '' &&
          s.section_code !== '' &&
          s.section_code !== '—',
      )
    if (sections.length === 0) {
      setError(t('checkoutErrorAddSections'))
      return
    }
    setBusy(true)
    try {
      const res = await postStudentEnroll({
        studentId: currentStudentId,
        academic_term_id: registrationTermId.trim(),
        sections,
      })
      clearCourseBin()
      const msg =
        res.insertedCount === 0
          ? t('checkoutSuccessAlreadyEnrolled')
          : t('checkoutSuccessAddedCount').replace('{n}', String(res.insertedCount))
      setSuccess(msg)
      window.setTimeout(() => {
        navigate('/dashboard')
      }, 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('registrationFailedGeneric'))
    } finally {
      setBusy(false)
    }
  }, [
    clearCourseBin,
    currentStudentId,
    items,
    navigate,
    registrationTermId,
    termMissing,
    t,
  ])

  return (
    <main
      className="portal-page"
      data-registration-term={registrationTermId ?? undefined}
    >
      <section className="portal-card portal-stack" aria-labelledby="course-bin-checkout-heading">
        <h2 id="course-bin-checkout-heading" className="portal-section-heading">
          {t('courseBinCheckoutHeading')}
        </h2>
        <p className="portal-page-lede">{t('courseBinCheckoutLede')}</p>

        {termMissing && (
          <p className="portal-text-muted" role="status">
            {t('selectAcademicTermInRegistrationBar')}
          </p>
        )}

        {!isAuthenticated && (
          <p className="portal-text-muted" role="status">
            <Link to="/login">{t('signIn')}</Link> {t('checkoutRegisterAfterSignIn')}
          </p>
        )}

        {error != null && (
          <p
            className="portal-login-error"
            role="alert"
            style={{ margin: '0 0 0.75rem', whiteSpace: 'pre-line' }}
          >
            {error}
          </p>
        )}
        {success != null && (
          <p className="portal-text-muted" role="status" style={{ margin: '0 0 0.75rem' }}>
            {success}
          </p>
        )}

        <p className="portal-text-muted" style={{ marginTop: 0 }}>
          {t('courseBinSectionsCount')} <strong>{items.length}</strong>
        </p>

        <div
          className="portal-course-bin-card-header-actions"
          style={{ marginTop: '0.5rem' }}
        >
          <button
            type="button"
            className="portal-btn portal-btn--primary"
            disabled={
              busy ||
              termMissing ||
              !isAuthenticated ||
              !currentStudentId ||
              items.length === 0
            }
            onClick={() => void onRegister()}
          >
            {busy ? t('registeringEllipsis') : t('registerButton')}
          </button>
          <Link
            to={{
              pathname: '/registration/course-bin',
              search: registrationTermId
                ? `?term=${encodeURIComponent(registrationTermId.trim())}`
                : '',
            }}
            className="portal-btn portal-btn--secondary"
          >
            {t('backToCourseBin')}
          </Link>
        </div>
      </section>
    </main>
  )
}

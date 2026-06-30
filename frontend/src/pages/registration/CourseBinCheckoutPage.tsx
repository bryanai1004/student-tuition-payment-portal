import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'
import { useAccount } from '../../context/AccountContext'
import { PORTAL_STUDENT_ENROLLMENT_CHANGED } from '../../lib/portalStudentEnrollmentEvents'
import { useCourseBin } from './CourseBinContext'
import { registerFromCourseBinItems } from './registerFromCourseBinItems'
import { useRegistrationTermSearchParam } from './registrationTermSearch'

export function CourseBinCheckoutPage() {
  const t = useStudentPortalT()
  const registrationTermId = useRegistrationTermSearchParam()
  const { currentStudentId, isAuthenticated, reload: reloadStudentAccount } =
    useAccount()
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

    setBusy(true)
    try {
      const res = await registerFromCourseBinItems({
        studentId: currentStudentId,
        academicTermId: registrationTermId.trim(),
        items,
        t,
      })
      if (!res.ok) {
        setError(res.message)
        return
      }
      const msg =
        res.insertedCount === 0
          ? t('checkoutSuccessAlreadyEnrolled')
          : t('checkoutSuccessAddedCount').replace('{n}', String(res.insertedCount))
      setSuccess(msg)
      await clearCourseBin()
      reloadStudentAccount()
      window.dispatchEvent(new Event(PORTAL_STUDENT_ENROLLMENT_CHANGED))
      const termSearch =
        registrationTermId != null && registrationTermId.trim() !== ''
          ? `term=${encodeURIComponent(registrationTermId.trim())}`
          : ''
      window.setTimeout(() => {
        navigate(
          {
            pathname: '/registration/offered-timetable',
            search: termSearch,
            hash: 'registration-class-plan',
          },
          { replace: true },
        )
      }, 1200)
    } finally {
      setBusy(false)
    }
  }, [
    currentStudentId,
    items,
    navigate,
    clearCourseBin,
    registrationTermId,
    reloadStudentAccount,
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
              pathname: '/registration/offered-timetable',
              search: registrationTermId
                ? `term=${encodeURIComponent(registrationTermId.trim())}`
                : '',
              hash: 'registration-class-plan',
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

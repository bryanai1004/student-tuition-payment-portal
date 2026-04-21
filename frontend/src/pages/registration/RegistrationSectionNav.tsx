import { NavLink, useLocation, useSearchParams } from 'react-router-dom'
import { useStudentPortalT } from '@/LanguageContext'

function linkClass(isActive: boolean) {
  return ['portal-section-tab', isActive ? 'portal-section-tab--active' : ''].filter(Boolean).join(' ')
}

function buildCourseTabSearch(params: URLSearchParams): string {
  const next = new URLSearchParams()
  const term = params.get('term')
  if (term) next.set('term', term)
  next.set('section', 'course')
  const s = next.toString()
  return s ? `?${s}` : '?section=course'
}

function buildClinicalTabSearch(params: URLSearchParams): string {
  const next = new URLSearchParams()
  const term = params.get('term')
  if (term) next.set('term', term)
  next.set('section', 'clinical')
  const s = next.toString()
  return s ? `?${s}` : '?section=clinical'
}

export function RegistrationSectionNav() {
  const t = useStudentPortalT()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const isClinicalSection = pathname.startsWith('/registration/clinical')
  const courseTo = `/registration/offered-timetable${buildCourseTabSearch(searchParams)}`
  const clinicalTo = `/registration/clinical/schedule${buildClinicalTabSearch(searchParams)}`

  return (
    <nav className="portal-registration-section-nav" aria-label={t('registrationSectionsAria')}>
      <ul className="portal-section-tab-group">
        <li>
          <NavLink to={courseTo} className={() => linkClass(!isClinicalSection)}>
            {t('registrationSectionCourse')}
          </NavLink>
        </li>
        <li>
          <NavLink to={clinicalTo} className={() => linkClass(isClinicalSection)}>
            {t('registrationSectionClinical')}
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}

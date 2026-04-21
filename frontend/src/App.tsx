import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom'
import { LanguageProvider } from '@/LanguageContext'
import { AccountProvider, useAccount } from './context/AccountContext'
import { useAdminAuth } from './context/AdminAuthContext'
import { AdminLayout } from './components/admin/AdminLayout'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage'
import { AdminClinicalPage } from './pages/admin/AdminClinicalPage'
import { AdminClinicalStudentDetailPage } from './pages/admin/AdminClinicalStudentDetailPage'
import { AdminStudentDetailPage } from './pages/admin/AdminStudentDetailPage'
import { AdminStudentCreatePage } from './pages/admin/AdminStudentCreatePage'
import { AdminStudentEditPage } from './pages/admin/AdminStudentEditPage'
import { AdminCoursesPage } from './pages/admin/AdminCoursesPage'
import { AdminCourseSectionsPage } from './pages/admin/AdminCourseSectionsPage'
import { AdminCourseSectionRosterPage } from './pages/admin/AdminCourseSectionRosterPage'
import { AdminSchedulingTimetablePage } from './pages/admin/AdminSchedulingTimetablePage'
import { AdminFinancePage } from './pages/admin/AdminFinancePage'
import { AdminAcademicTermsPage } from './pages/admin/AdminAcademicTermsPage'
import { LoginPage } from './pages/LoginPage'
import { PaymentPlanPage } from './pages/PaymentPlanPage'
import { PortalLayout } from './components/PortalLayout'
import { RegistrationLayout } from './pages/registration/RegistrationLayout'
import { CourseSearchPage } from './pages/registration/CourseSearchPage'
import { MyCourseBinPage } from './pages/registration/MyCourseBinPage'
import { CourseBinCheckoutPage } from './pages/registration/CourseBinCheckoutPage'
import { SchedulePage } from './pages/registration/SchedulePage'
import { OfferedTimetablePage } from './pages/registration/OfferedTimetablePage'
import { AddDropPage } from './pages/registration/AddDropPage'
import { FinancesLayout } from './pages/finances/FinancesLayout'
import { FinancesOverviewPage } from './pages/finances/FinancesOverviewPage'
import { AcademicsLayout } from './pages/academics/AcademicsLayout'
import { AcademicsPortalPage } from './pages/academics/AcademicsPortalPage'
import { GradesPage } from './pages/academics/GradesPage'
import { TranscriptPage } from './pages/academics/TranscriptPage'
import { GpaPage } from './pages/academics/GpaPage'
import { AcademicProgressPage } from './pages/academics/AcademicProgressPage'
import { EnrollmentVerificationPage } from './pages/academics/EnrollmentVerificationPage'
import { ClinicalModuleShell } from './pages/clinical/ClinicalModuleShell'
import { ClinicalHomePage } from './pages/clinical/ClinicalHomePage'
import { ClinicalSchedulePage } from './pages/clinical/ClinicalSchedulePage'
import { ClinicalAddDropPage } from './pages/clinical/ClinicalAddDropPage'
import { ClinicalExamPracticePage } from './pages/clinical/ClinicalExamPracticePage'
import { ClinicalEvaluationPage } from './pages/clinical/ClinicalEvaluationPage'
import { ClinicalRequiredHoursPage } from './pages/clinical/ClinicalRequiredHoursPage'
import { ClinicalOfferedTimetablePage } from './pages/clinical/ClinicalOfferedTimetablePage'
import { ClinicalCompliancePage } from './pages/clinical/ClinicalCompliancePage'
import { DocumentsLayout } from './pages/documents/DocumentsLayout'
import { DocumentsHomePage } from './pages/documents/DocumentsHomePage'
import { ProfilePage } from './pages/ProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import {
  getFirstAccessibleAdminPath,
  hasAdminModuleAccess,
  type AdminModuleKey,
} from './lib/adminAccess'
import './styles/portal.css'

function RequireAuth() {
  const { isAuthenticated } = useAccount()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function RequireAdminAuth() {
  const { isAuthenticated } = useAdminAuth()
  if (process.env.NODE_ENV === 'development') {
    return <Outlet />
  }
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }
  return <Outlet />
}

function RequireAdminModule({ module }: { module: AdminModuleKey }) {
  const { isAuthenticated, role } = useAdminAuth()
  if (process.env.NODE_ENV === 'development' && !isAuthenticated) {
    return <Outlet />
  }
  if (!role) {
    return <Navigate to="/admin/login" replace />
  }
  if (!hasAdminModuleAccess(role, module)) {
    return <Navigate to={getFirstAccessibleAdminPath(role)} replace />
  }
  return <Outlet />
}

function AdminIndexRedirect() {
  const { isAuthenticated, role } = useAdminAuth()
  if (process.env.NODE_ENV === 'development' && !isAuthenticated) {
    return <Navigate to="/admin/students" replace />
  }
  if (!role) {
    return <Navigate to="/admin/login" replace />
  }
  return <Navigate to={getFirstAccessibleAdminPath(role)} replace />
}

function RegistrationIndexRedirect() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  if (params.get('section') === 'clinical') {
    const qs = params.toString()
    return <Navigate to={`clinical/schedule${qs ? `?${qs}` : ''}`} replace />
  }
  return <Navigate to={{ pathname: 'search', search }} replace />
}

function ClinicalStudentLegacyRedirect() {
  const { pathname, search } = useLocation()
  const tail = pathname.replace(/^\/clinical\/?/, '').trim() || 'schedule'
  const next = new URLSearchParams(search)
  next.set('section', 'clinical')
  const qs = next.toString()
  return <Navigate to={`/registration/clinical/${tail}${qs ? `?${qs}` : ''}`} replace />
}

/** Student portal + login only; admin routes stay outside so student account APIs never run on `/admin`. */
function StudentAccountScope() {
  return (
    <AccountProvider>
      <LanguageProvider>
        <Outlet />
      </LanguageProvider>
    </AccountProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route element={<RequireAdminAuth />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminIndexRedirect />} />
          <Route element={<RequireAdminModule module="students" />}>
            <Route path="students/:studentId/edit" element={<AdminStudentEditPage />} />
            <Route path="students/new" element={<AdminStudentCreatePage />} />
            <Route path="students/:studentId" element={<AdminStudentDetailPage />} />
            <Route path="students" element={<AdminStudentsPage />} />
          </Route>
          <Route element={<RequireAdminModule module="clinical" />}>
            <Route
              path="clinical/:studentId"
              element={<AdminClinicalStudentDetailPage />}
            />
            <Route path="clinical" element={<AdminClinicalPage />} />
          </Route>
          <Route element={<RequireAdminModule module="courses" />}>
            <Route path="courses" element={<AdminCoursesPage />} />
          </Route>
          <Route element={<RequireAdminModule module="academic_terms" />}>
            <Route path="academic-terms" element={<AdminAcademicTermsPage />} />
          </Route>
          <Route element={<RequireAdminModule module="course_sections" />}>
            <Route path="course-sections" element={<AdminCourseSectionsPage />} />
            <Route
              path="course-sections/roster"
              element={<AdminCourseSectionRosterPage />}
            />
          </Route>
          <Route element={<RequireAdminModule module="scheduling_timetable" />}>
            <Route
              path="course-sections/timetable"
              element={<AdminSchedulingTimetablePage />}
            />
          </Route>
          <Route element={<RequireAdminModule module="finance" />}>
            <Route path="finance" element={<AdminFinancePage />} />
          </Route>
        </Route>
      </Route>
      <Route element={<StudentAccountScope />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/plan" element={<PaymentPlanPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<PortalLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/registration" element={<RegistrationLayout />}>
              <Route index element={<RegistrationIndexRedirect />} />
              <Route path="search" element={<CourseSearchPage />} />
              <Route path="course-bin" element={<MyCourseBinPage />} />
              <Route path="checkout" element={<CourseBinCheckoutPage />} />
              <Route path="add-drop" element={<AddDropPage />} />
              <Route path="schedule" element={<SchedulePage />} />
              <Route path="offered-timetable" element={<OfferedTimetablePage />} />
              <Route path="clinical" element={<ClinicalModuleShell />}>
                <Route index element={<ClinicalHomePage />} />
                <Route path="schedule" element={<ClinicalSchedulePage />} />
                <Route
                  path="offered-timetable"
                  element={<ClinicalOfferedTimetablePage />}
                />
                <Route path="add-drop" element={<ClinicalAddDropPage />} />
                <Route path="exam-practice" element={<ClinicalExamPracticePage />} />
                <Route path="evaluation" element={<ClinicalEvaluationPage />} />
                <Route path="required-hours" element={<ClinicalRequiredHoursPage />} />
                <Route path="compliance" element={<ClinicalCompliancePage />} />
              </Route>
            </Route>
            <Route path="/finances" element={<FinancesLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<FinancesOverviewPage />} />
              <Route path="payment" element={<Navigate to="/finances/overview" replace />} />
              <Route path="history" element={<Navigate to="/finances/overview" replace />} />
              <Route path="statements" element={<Navigate to="/finances/overview" replace />} />
              <Route path="late-fees" element={<Navigate to="/finances/overview" replace />} />
            </Route>
            <Route path="/academics" element={<AcademicsLayout />}>
              <Route index element={<AcademicsPortalPage />} />
              <Route path="grades" element={<GradesPage />} />
              <Route path="transcript" element={<TranscriptPage />} />
              <Route path="gpa" element={<GpaPage />} />
              <Route path="progress" element={<AcademicProgressPage />} />
              <Route path="enrollment-verification" element={<EnrollmentVerificationPage />} />
            </Route>
            <Route path="/clinical/*" element={<ClinicalStudentLegacyRedirect />} />
            <Route path="/documents" element={<DocumentsLayout />}>
              <Route index element={<DocumentsHomePage />} />
              <Route path="policies" element={<Navigate to="/documents" replace />} />
              <Route path="forms" element={<Navigate to="/documents" replace />} />
              <Route path="handbook" element={<Navigate to="/documents" replace />} />
              <Route path="uploads" element={<Navigate to="/documents" replace />} />
            </Route>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/my-account" element={<ProfilePage />} />
          </Route>
        </Route>
        <Route path="/overview" element={<Navigate to="/finances/overview" replace />} />
        <Route path="/payment" element={<Navigate to="/finances/overview" replace />} />
        <Route path="/activity" element={<Navigate to="/finances/overview" replace />} />
        <Route path="/statements" element={<Navigate to="/finances/overview" replace />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  )
}

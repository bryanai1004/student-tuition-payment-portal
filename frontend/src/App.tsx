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
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ForgotStudentIdPage } from './pages/ForgotStudentIdPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { PaymentPlanPage } from './pages/PaymentPlanPage'
import { PortalLayout } from './components/PortalLayout'
import { RegistrationLayout } from './pages/registration/RegistrationLayout'
import { CourseBinCheckoutPage } from './pages/registration/CourseBinCheckoutPage'
import { OfferedTimetablePage } from './pages/registration/OfferedTimetablePage'
import { CourseSearchPage } from './pages/registration/CourseSearchPage'
import { FinancesLayout } from './pages/finances/FinancesLayout'
import { FinancesOverviewPage } from './pages/finances/FinancesOverviewPage'
import { FinancesPaymentPage } from './pages/finances/FinancesPaymentPage'
import { FinancesStoreCheckoutPage } from './pages/finances/FinancesStoreCheckoutPage'
import { FinancesStorePage } from './pages/finances/FinancesStorePage'
import { FinancesClinicFeePaymentPage } from './pages/finances/FinancesClinicFeePaymentPage'
import { AcademicsLayout } from './pages/academics/AcademicsLayout'
import { AcademicsPortalPage } from './pages/academics/AcademicsPortalPage'
import { GradesPage } from './pages/academics/GradesPage'
import { TranscriptPage } from './pages/academics/TranscriptPage'
import { GpaPage } from './pages/academics/GpaPage'
import { AcademicProgressPage } from './pages/academics/AcademicProgressPage'
import { EnrollmentVerificationPage } from './pages/academics/EnrollmentVerificationPage'
import { ClinicalModuleShell } from './pages/clinical/ClinicalModuleShell'
import { ClinicalSchedulePage } from './pages/clinical/ClinicalSchedulePage'
import { ClinicalAddDropPage } from './pages/clinical/ClinicalAddDropPage'
import { ClinicalProgressPage } from './pages/clinical/ClinicalProgressPage'
import { ClinicalExamRegistrationPage } from './pages/clinical/ClinicalExamRegistrationPage'
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
  const { isAuthenticated, isHydrated } = useAdminAuth()
  if (!isHydrated) {
    return null
  }
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }
  return <Outlet />
}

function RequireAdminModule({ module }: { module: AdminModuleKey }) {
  const { isHydrated, role } = useAdminAuth()
  if (!isHydrated) {
    return null
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
  const { isHydrated, role } = useAdminAuth()
  if (!isHydrated) {
    return null
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
  return <Navigate to={{ pathname: 'offered-timetable', search }} replace />
}

/** Legacy `/registration/course-bin` and `/registration/add-drop` → Plan & schedule. */
function RegistrationCourseBinLegacyRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '../offered-timetable', search }} replace />
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
        <Route path="/login/forgot-student-id" element={<ForgotStudentIdPage />} />
        <Route path="/login/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/plan" element={<PaymentPlanPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<PortalLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/registration" element={<RegistrationLayout />}>
              <Route index element={<RegistrationIndexRedirect />} />
              <Route path="search" element={<Navigate to="../course-search" replace />} />
              <Route path="course-search" element={<CourseSearchPage />} />
              <Route path="course-bin" element={<RegistrationCourseBinLegacyRedirect />} />
              <Route path="checkout" element={<CourseBinCheckoutPage />} />
              <Route path="add-drop" element={<RegistrationCourseBinLegacyRedirect />} />
              <Route path="schedule" element={<Navigate to="/dashboard" replace />} />
              <Route path="offered-timetable" element={<OfferedTimetablePage />} />
              <Route path="clinical" element={<ClinicalModuleShell />}>
                <Route index element={<Navigate to="schedule" replace />} />
                <Route path="schedule" element={<ClinicalSchedulePage />} />
                <Route path="my-schedule" element={<ClinicalAddDropPage />} />
                <Route path="progress" element={<ClinicalProgressPage />} />
                <Route path="exam-registration" element={<ClinicalExamRegistrationPage />} />
                <Route path="offered-timetable" element={<Navigate to="../schedule" replace />} />
                <Route path="add-drop" element={<Navigate to="../my-schedule" replace />} />
                <Route path="exam-practice" element={<Navigate to="../schedule" replace />} />
                <Route path="evaluation" element={<Navigate to="../schedule" replace />} />
                <Route path="required-hours" element={<Navigate to="../schedule" replace />} />
                <Route path="compliance" element={<Navigate to="../schedule" replace />} />
              </Route>
            </Route>
            <Route path="/finances" element={<FinancesLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<FinancesOverviewPage />} />
              <Route path="store" element={<FinancesStorePage />} />
              <Route path="store/checkout" element={<FinancesStoreCheckoutPage />} />
              <Route path="payment" element={<FinancesPaymentPage />} />
              <Route path="payment/tuition" element={<FinancesPaymentPage />} />
              <Route path="payment/clinic-fee" element={<FinancesClinicFeePaymentPage />} />
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

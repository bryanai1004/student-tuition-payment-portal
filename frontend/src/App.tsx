import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAccount } from './context/AccountContext'
import { LoginPage } from './pages/LoginPage'
import { PaymentPlanPage } from './pages/PaymentPlanPage'
import { PortalLayout } from './components/PortalLayout'
import { RegistrationLayout } from './pages/registration/RegistrationLayout'
import { CourseSearchPage } from './pages/registration/CourseSearchPage'
import { MyCourseBinPage } from './pages/registration/MyCourseBinPage'
import { CourseBinCheckoutPage } from './pages/registration/CourseBinCheckoutPage'
import { SchedulePage } from './pages/registration/SchedulePage'
import { FinancesLayout } from './pages/finances/FinancesLayout'
import { FinancesOverviewPage } from './pages/finances/FinancesOverviewPage'
import { AcademicsLayout } from './pages/academics/AcademicsLayout'
import { AcademicsPortalPage } from './pages/academics/AcademicsPortalPage'
import { GradesPage } from './pages/academics/GradesPage'
import { TranscriptPage } from './pages/academics/TranscriptPage'
import { GpaPage } from './pages/academics/GpaPage'
import { AcademicProgressPage } from './pages/academics/AcademicProgressPage'
import { EnrollmentVerificationPage } from './pages/academics/EnrollmentVerificationPage'
import { ClinicalLayout } from './pages/clinical/ClinicalLayout'
import { ClinicalHomePage } from './pages/clinical/ClinicalHomePage'
import { ClinicalSchedulePage } from './pages/clinical/ClinicalSchedulePage'
import { ClinicalAddDropPage } from './pages/clinical/ClinicalAddDropPage'
import { ClinicalExamPracticePage } from './pages/clinical/ClinicalExamPracticePage'
import { ClinicalEvaluationPage } from './pages/clinical/ClinicalEvaluationPage'
import { ClinicalRequiredHoursPage } from './pages/clinical/ClinicalRequiredHoursPage'
import { ClinicalCompliancePage } from './pages/clinical/ClinicalCompliancePage'
import { DocumentsLayout } from './pages/documents/DocumentsLayout'
import { DocumentsHomePage } from './pages/documents/DocumentsHomePage'
import { DocumentsPoliciesPage } from './pages/documents/DocumentsPoliciesPage'
import { DocumentsFormsPage } from './pages/documents/DocumentsFormsPage'
import { DocumentsHandbookPage } from './pages/documents/DocumentsHandbookPage'
import { DocumentsUploadsPage } from './pages/documents/DocumentsUploadsPage'
import { ProfilePage } from './pages/ProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import './styles/portal.css'

function RequireAuth() {
  const { isAuthenticated } = useAccount()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<PortalLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/registration" element={<RegistrationLayout />}>
            <Route index element={<Navigate to="search" replace />} />
            <Route path="search" element={<CourseSearchPage />} />
            <Route path="course-bin" element={<MyCourseBinPage />} />
            <Route path="checkout" element={<CourseBinCheckoutPage />} />
            <Route path="schedule" element={<SchedulePage />} />
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
          <Route path="/clinical" element={<ClinicalLayout />}>
            <Route index element={<ClinicalHomePage />} />
            <Route path="schedule" element={<ClinicalSchedulePage />} />
            <Route path="add-drop" element={<ClinicalAddDropPage />} />
            <Route path="exam-practice" element={<ClinicalExamPracticePage />} />
            <Route path="evaluation" element={<ClinicalEvaluationPage />} />
            <Route path="required-hours" element={<ClinicalRequiredHoursPage />} />
            <Route path="compliance" element={<ClinicalCompliancePage />} />
          </Route>
          <Route path="/documents" element={<DocumentsLayout />}>
            <Route index element={<DocumentsHomePage />} />
            <Route path="policies" element={<DocumentsPoliciesPage />} />
            <Route path="forms" element={<DocumentsFormsPage />} />
            <Route path="handbook" element={<DocumentsHandbookPage />} />
            <Route path="uploads" element={<DocumentsUploadsPage />} />
          </Route>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="/overview" element={<Navigate to="/finances/overview" replace />} />
      <Route path="/payment" element={<Navigate to="/finances/overview" replace />} />
      <Route path="/activity" element={<Navigate to="/finances/overview" replace />} />
      <Route path="/statements" element={<Navigate to="/finances/overview" replace />} />
      <Route path="/plan" element={<PaymentPlanPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

import { Router } from "express";
import {
  getAdminStudentAcademicRecords,
  getAdminStudent,
  getAdminStudentRegistrationTerms,
  getAdminStudentPhotoUrlHandler,
  getAdminStudents,
  getNextAdminStudentId,
  postExportAdminStudentsCsv,
  postAdminStudentPhoto,
  postAdminStudent,
  postAdminStudentLoa,
  postDeleteSelectedAdminStudents,
  putAdminStudent,
  uploadAdminStudentPhotoMiddleware,
} from "../controllers/adminStudentController.js";
import {
  deleteAdminCourseSection,
  getAdminCourseSectionCourseMeta,
  getAdminCourseSectionEnrollments,
  getAdminCourseSectionRosterHandler,
  getAdminExportFeedbackCsv,
  getAdminCourseSections,
  getAdminExportRegisteredStudentsCsv,
  patchAdminCourseSection,
  postAdminCourseSection,
} from "../controllers/adminCourseSectionController.js";
import { deleteAdminPortalEnrollmentHandler } from "../controllers/adminEnrollmentController.js";
import { setStudentGrade } from "../controllers/adminMarksController.js";
import {
  deleteAdminFinanceChargeByIdHandler,
  deleteAdminFinancePaymentByIdHandler,
  getAdminFinanceLedgerHandler,
  getAdminFinanceQuartersHandler,
  getAdminFinanceStudents,
  getFinanceQuarterSettings,
  getGlobalFinanceQuarters,
  getLateFeeReconciliationPreview,
  postAdminFinanceChargeHandler,
  postAdminFinancePaymentHandler,
  postReconcileLateFees,
  postRunLateFeeCheck,
  putAdminFinanceChargeByIdHandler,
  putAdminFinancePaymentByIdHandler,
  putFinanceQuarterSettings,
} from "../controllers/adminFinanceController.js";
import {
  getAdminCourseCategories,
  patchAdminCatalogCourse,
} from "../controllers/adminCatalogCourseController.js";
import { getAdminCoursesOpenForRegistration } from "../controllers/adminOpenRegistrationCoursesController.js";
import {
  deleteCourseBinItemHandler,
  getCourseBin,
  postCourseBin,
} from "../controllers/courseBinController.js";
import { getCourseSections, getCourses } from "../controllers/courseController.js";
import { getHealth, getHealthDb } from "../controllers/healthController.js";
import {
  getAccountingLedger,
  getAccountingQuarters,
} from "../controllers/studentLedgerController.js";
import {
  getAuthorizeClinicFeeSummaryHandler,
  getAuthorizeCurrentTermSummaryHandler,
  getAuthorizeTuitionSummaryHandler,
  postAuthorizeNetClinicFeeChargeHandler,
  postAuthorizeNetChargeHandler,
  postAuthorizeNetTuitionChargeHandler,
} from "../controllers/studentAuthorizePaymentController.js";
import { getStudentAcademics } from "../controllers/studentAcademicsController.js";
import { getStudentProgramProgress } from "../controllers/studentProgramProgressController.js";
import {
  getAdminStudentCourseFeedback,
  getStudentCourseFeedback,
  postStudentCourseFeedback,
} from "../controllers/studentCourseFeedbackController.js";
import { getStudentTranscriptPreview } from "../controllers/studentTranscriptController.js";
import {
  getDemoAccount,
  getDemoActivity,
  getStudentAccount,
  getStudentActivity,
  getStudentProfile,
  putStudentProfile,
} from "../controllers/studentAccountController.js";
import {
  getStudentMyPhotoUrlHandler,
  postStudentMyPhotoHandler,
  uploadStudentMyPhotoMiddleware,
} from "../controllers/studentPhotoController.js";
import { postStudentLogin } from "../controllers/studentAuthController.js";
import {
  getAdminAuthMe,
  postAdminAuthLogin,
  postAdminAuthLogout,
} from "../controllers/adminAuthController.js";
import {
  getStudentEnrolledSections,
  postStudentEnroll,
  postStudentWithdraw,
} from "../controllers/studentEnrollmentController.js";
import {
  getAdminStudentClinicalProgressHandler,
  getStudentClinicalProgressHandler,
} from "../controllers/studentClinicalProgressController.js";
import {
  deleteAdminAcademicTerm,
  getAcademicTerms,
  getAcademicTermsCurrent,
  getAcademicTermsCurrentPosted,
  getAcademicTermsRecent,
  patchAdminAcademicTerm,
  postAdminAcademicTerm,
  postAdminAcademicTermPost,
} from "../controllers/academicTermController.js";
import { postAiAsk } from "../controllers/aiAskController.js";
import {
  getAdminClinicalRequestsHandler,
  getStudentClinicalRequestsHandler,
  postApproveClinicalRequestHandler,
  postRejectClinicalRequestHandler,
  postStudentClinicalRequestHandler,
} from "../controllers/clinicalRequestController.js";
import {
  postAdminClinicalSlotAddStudentHandler,
  deleteAdminClinicalSlotEnrollmentHandler,
  deleteStudentClinicalEnrollmentHandler,
  getAdminClinicalSlotRosterHandler,
  getStudentClinicalEnrollmentsHandler,
  getStudentOpenClinicalEnrollmentSlotsHandler,
  postAdminClinicalSlotStudentHandler,
  postAdminClinicalSlotEnrollmentGradeHandler,
  postAdminClinicalPaymentHoldCleanupHandler,
  postStudentClinicalEnrollmentHandler,
} from "../controllers/clinicalEnrollmentController.js";
import {
  deleteAdminClinicalSlotHandler,
  getAdminClinicalSlotsHandler,
  patchAdminClinicalSlotHandler,
  postAdminClinicalSlotHandler,
} from "../controllers/adminClinicalSlotController.js";
import { getAdminInstructorsHandler } from "../controllers/adminInstructorController.js";
import {
  getAdminClinicalTimetableHandler,
  getClinicalOfferedTimetableHandler,
  getStudentClinicalScheduleHandler,
  postAdminClinicalAssignHandler,
} from "../controllers/clinicalScheduleController.js";
import {
  getAdminClinicalExamRequestsHandler,
  getStudentClinicalExamRequestsHandler,
  postAdminClinicalExamRequestAssignHandler,
  postStudentClinicalExamRequestHandler,
} from "../controllers/clinicalExamRequestController.js";
import {
  getAdminStudentDocumentRequirementsHandler,
  getStudentDocumentRequirementsHandler,
  postAdminStudentDocumentRequirementResetHandler,
  postAdminStudentDocumentRequirementsResetAllHandler,
  postStudentAgreementSubmitHandler,
  postStudentQuizSubmitHandler,
} from "../controllers/studentDocumentsController.js";

export const apiRouter = Router();

apiRouter.get("/health", getHealth);
apiRouter.get("/health/db", getHealthDb);

apiRouter.post("/auth/login", postStudentLogin);
apiRouter.post("/payments/authorize/charge", postAuthorizeNetChargeHandler);
apiRouter.post("/payments/authorize/tuition-charge", postAuthorizeNetTuitionChargeHandler);
apiRouter.post(
  "/payments/authorize/clinic-fee-charge",
  postAuthorizeNetClinicFeeChargeHandler,
);
apiRouter.get(
  "/payments/authorize/current-term-summary",
  getAuthorizeCurrentTermSummaryHandler,
);
apiRouter.get("/payments/authorize/tuition-summary", getAuthorizeTuitionSummaryHandler);
apiRouter.get(
  "/payments/authorize/clinic-fee-summary",
  getAuthorizeClinicFeeSummaryHandler,
);

apiRouter.post("/student/enroll", postStudentEnroll);
apiRouter.post("/student/withdraw", postStudentWithdraw);
apiRouter.get("/student/enrolled-sections", getStudentEnrolledSections);
apiRouter.get("/student/clinical-progress", getStudentClinicalProgressHandler);
apiRouter.post("/student/clinical/exam-request", postStudentClinicalExamRequestHandler);
apiRouter.get("/student/clinical/exam-requests", getStudentClinicalExamRequestsHandler);
apiRouter.put("/student/profile", putStudentProfile);
apiRouter.get("/student/me/photo-url", getStudentMyPhotoUrlHandler);
apiRouter.post(
  "/student/me/photo",
  uploadStudentMyPhotoMiddleware,
  postStudentMyPhotoHandler,
);

apiRouter.post("/ai/ask", postAiAsk);

apiRouter.get("/courses", getCourses);
apiRouter.get("/courses/:code/sections", getCourseSections);

apiRouter.get("/academic-terms/recent", getAcademicTermsRecent);
apiRouter.get("/academic-terms/current", getAcademicTermsCurrent);
apiRouter.get("/academic-terms/current-posted", getAcademicTermsCurrentPosted);
apiRouter.get("/academic-terms", getAcademicTerms);

/** Clinical slots for read-only offered timetable (legacy `clinic_timetable` + enrollment counts). */
apiRouter.get("/clinical/offered-timetable", getClinicalOfferedTimetableHandler);

/** Course bin (per student); requires `student_course_bin` table when used. */
apiRouter.get("/course-bin/:studentId", getCourseBin);
apiRouter.post("/course-bin/:studentId", postCourseBin);
apiRouter.delete(
  "/course-bin/:studentId/:itemId",
  deleteCourseBinItemHandler,
);

/** Admin section CRUD. Auth routes stay mounted; global admin auth middleware temporarily disabled. */
const adminRouter = Router();
adminRouter.post("/auth/login", postAdminAuthLogin);
adminRouter.post("/auth/logout", postAdminAuthLogout);
adminRouter.get("/auth/me", getAdminAuthMe);
// TODO: re-enable backend admin auth after cookie verification is fixed.
// adminRouter.use(requireAdminAuth);
adminRouter.get("/students", getAdminStudents);
adminRouter.get("/students/next-id", getNextAdminStudentId);
adminRouter.post("/students", postAdminStudent);
adminRouter.post("/students/delete-selected", postDeleteSelectedAdminStudents);
adminRouter.post("/students/export.csv", postExportAdminStudentsCsv);
adminRouter.post("/students/:studentId/loa", postAdminStudentLoa);
adminRouter.post(
  "/students/:studentId/photo",
  uploadAdminStudentPhotoMiddleware,
  postAdminStudentPhoto,
);
adminRouter.get("/students/:studentId/photo-url", getAdminStudentPhotoUrlHandler);
adminRouter.get(
  "/students/:studentId/registration-terms",
  getAdminStudentRegistrationTerms,
);
adminRouter.get(
  "/students/:studentId/academic-records",
  getAdminStudentAcademicRecords,
);
adminRouter.get(
  "/students/:studentId/clinical-progress",
  getAdminStudentClinicalProgressHandler,
);
adminRouter.get("/students/:studentId", getAdminStudent);
adminRouter.put("/students/:studentId", putAdminStudent);
adminRouter.get(
  "/students/:studentId/course-feedback",
  getAdminStudentCourseFeedback,
);
adminRouter.get(
  "/courses/open-for-registration",
  getAdminCoursesOpenForRegistration,
);
adminRouter.get("/course-categories", getAdminCourseCategories);
adminRouter.patch(
  "/catalog/courses/:sequenceNumber",
  patchAdminCatalogCourse,
);
adminRouter.get(
  "/course-sections/enrollments",
  getAdminCourseSectionEnrollments,
);
adminRouter.get(
  "/sections/:sectionId/roster",
  getAdminCourseSectionRosterHandler,
);
adminRouter.get(
  "/course-sections/course-meta",
  getAdminCourseSectionCourseMeta,
);
adminRouter.get(
  "/course-sections/:id/export-registered-students.csv",
  getAdminExportRegisteredStudentsCsv,
);
adminRouter.get(
  "/course-sections/:id/export-feedback.csv",
  getAdminExportFeedbackCsv,
);
adminRouter.get("/course-sections", getAdminCourseSections);
adminRouter.post("/course-sections", postAdminCourseSection);
adminRouter.patch("/course-sections/:id", patchAdminCourseSection);
adminRouter.delete("/course-sections/:id", deleteAdminCourseSection);
adminRouter.delete("/enrollments", deleteAdminPortalEnrollmentHandler);
adminRouter.post("/marks/set-grade", setStudentGrade);
adminRouter.get("/finance/quarters", getGlobalFinanceQuarters);
adminRouter.get("/finance/quarter-settings", getFinanceQuarterSettings);
adminRouter.get(
  "/finance/late-fee-reconciliation-preview",
  getLateFeeReconciliationPreview,
);
adminRouter.put("/finance/quarter-settings", putFinanceQuarterSettings);
adminRouter.post("/finance/reconcile-late-fees", postReconcileLateFees);
adminRouter.post("/finance/run-late-fee", postRunLateFeeCheck);
adminRouter.get("/finance/students", getAdminFinanceStudents);
adminRouter.post("/finance/charge", postAdminFinanceChargeHandler);
adminRouter.post("/finance/payment", postAdminFinancePaymentHandler);
adminRouter.put("/finance/charge/:id", putAdminFinanceChargeByIdHandler);
adminRouter.delete("/finance/charge/:id", deleteAdminFinanceChargeByIdHandler);
adminRouter.put("/finance/payment/:id", putAdminFinancePaymentByIdHandler);
adminRouter.delete(
  "/finance/payment/:id",
  deleteAdminFinancePaymentByIdHandler,
);
adminRouter.get("/finance/:studentId/quarters", getAdminFinanceQuartersHandler);
adminRouter.get("/finance/:studentId/ledger", getAdminFinanceLedgerHandler);
adminRouter.post("/academic-terms", postAdminAcademicTerm);
adminRouter.post("/academic-terms/:id/post", postAdminAcademicTermPost);
adminRouter.patch("/academic-terms/:id", patchAdminAcademicTerm);
adminRouter.delete("/academic-terms/:id", deleteAdminAcademicTerm);
adminRouter.get("/clinical/timetable", getAdminClinicalTimetableHandler);
adminRouter.get(
  "/clinical/slots/:timetableId/roster",
  getAdminClinicalSlotRosterHandler,
);
adminRouter.delete(
  "/clinical/slots/:timetableId/enrollments/:enrollmentId",
  deleteAdminClinicalSlotEnrollmentHandler,
);
adminRouter.post(
  "/clinical/slots/:timetableId/students",
  postAdminClinicalSlotStudentHandler,
);
adminRouter.post(
  "/clinical/slots/:timetableId/add-student",
  postAdminClinicalSlotAddStudentHandler,
);
adminRouter.post(
  "/clinical/slots/:timetableId/enrollments/:enrollmentId/grade",
  postAdminClinicalSlotEnrollmentGradeHandler,
);
adminRouter.post(
  "/clinical/run-payment-hold-cleanup",
  postAdminClinicalPaymentHoldCleanupHandler,
);
adminRouter.get("/clinical/slots", getAdminClinicalSlotsHandler);
adminRouter.get("/instructors", getAdminInstructorsHandler);
adminRouter.post("/clinical/slots", postAdminClinicalSlotHandler);
adminRouter.patch("/clinical/slots/:id", patchAdminClinicalSlotHandler);
adminRouter.delete("/clinical/slots/:id", deleteAdminClinicalSlotHandler);
adminRouter.post("/clinical/assign", postAdminClinicalAssignHandler);
adminRouter.get("/clinical/requests", getAdminClinicalRequestsHandler);
adminRouter.post(
  "/clinical/requests/:id/approve",
  postApproveClinicalRequestHandler,
);
adminRouter.post(
  "/clinical/requests/:id/reject",
  postRejectClinicalRequestHandler,
);
adminRouter.get("/clinical/exam-requests", getAdminClinicalExamRequestsHandler);
adminRouter.post(
  "/clinical/exam-requests/:id/assign",
  postAdminClinicalExamRequestAssignHandler,
);
adminRouter.get(
  "/students/:studentId/documents",
  getAdminStudentDocumentRequirementsHandler,
);
adminRouter.post(
  "/students/:studentId/documents/reset-all",
  postAdminStudentDocumentRequirementsResetAllHandler,
);
adminRouter.post(
  "/students/:studentId/documents/:requirementType/reset",
  postAdminStudentDocumentRequirementResetHandler,
);
apiRouter.use("/admin", adminRouter);

apiRouter.get(
  "/students/:studentId/documents",
  getStudentDocumentRequirementsHandler,
);
apiRouter.post(
  "/students/:studentId/documents/agreement/submit",
  postStudentAgreementSubmitHandler,
);
apiRouter.post(
  "/students/:studentId/documents/quizzes/:quizId/submit",
  postStudentQuizSubmitHandler,
);
apiRouter.get("/students/:studentId/profile", getStudentProfile);
apiRouter.get("/students/:studentId/academics", getStudentAcademics);
apiRouter.get("/students/:studentId/program-progress", getStudentProgramProgress);
apiRouter.get(
  "/students/:studentId/course-feedback",
  getStudentCourseFeedback,
);
apiRouter.post(
  "/students/:studentId/course-feedback",
  postStudentCourseFeedback,
);
apiRouter.get(
  "/students/:studentId/transcript-preview",
  getStudentTranscriptPreview,
);
apiRouter.get("/students/:studentId/account", getStudentAccount);
apiRouter.get(
  "/students/:studentId/clinical-schedule",
  getStudentClinicalScheduleHandler,
);
apiRouter.get(
  "/students/:studentId/clinical-enrollments/open",
  getStudentOpenClinicalEnrollmentSlotsHandler,
);
apiRouter.get(
  "/students/:studentId/clinical-enrollments",
  getStudentClinicalEnrollmentsHandler,
);
apiRouter.post(
  "/students/:studentId/clinical-enrollments",
  postStudentClinicalEnrollmentHandler,
);
apiRouter.delete(
  "/students/:studentId/clinical-enrollments/:enrollmentId",
  deleteStudentClinicalEnrollmentHandler,
);
apiRouter.post(
  "/students/:studentId/clinical-requests",
  postStudentClinicalRequestHandler,
);
apiRouter.get(
  "/students/:studentId/clinical-requests",
  getStudentClinicalRequestsHandler,
);
apiRouter.get("/students/:studentId/activity", getStudentActivity);
apiRouter.get(
  "/students/:studentId/accounting/quarters",
  getAccountingQuarters,
);
apiRouter.get("/students/:studentId/accounting/ledger", getAccountingLedger);

apiRouter.get("/demo/account", getDemoAccount);
apiRouter.get("/demo/activity", getDemoActivity);

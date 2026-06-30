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
  getAdminFinanceQuarterSummaryHandler,
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
  deleteCourseBinForTermHandler,
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
import {
  deleteStoreCartLineHandler,
  getStoreCartHandler,
  getStoreCatalogHandler,
  postStoreCartCommitHandler,
  postStoreCheckoutHandler,
  putStoreCartLineHandler,
} from "../controllers/studentStoreController.js";
import { getStudentAcademics } from "../controllers/studentAcademicsController.js";
import { getStudentGpa } from "../controllers/studentGpaController.js";
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
import {
  getStudentLoginEmailHandler,
  postStudentLoginEmailSendCodeHandler,
  postStudentLoginEmailVerifyHandler,
} from "../controllers/studentLoginEmailController.js";
import { postStudentLogin } from "../controllers/studentAuthController.js";
import {
  getAdminAuthMe,
  postAdminAuthLogin,
  postAdminAuthLogout,
} from "../controllers/adminAuthController.js";
import { requireAdminAuth } from "../middleware/requireAdminAuth.js";
import {
  requireStudentAuth,
  requireStudentAuthMatchBody,
  requireStudentAuthMatchParam,
  requireStudentAuthMatchQuery,
} from "../middleware/requireStudentAuth.js";
import {
  getAdminEmailProfiles,
  postAdminBulkEmail,
} from "../controllers/adminBulkEmailController.js";
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

const studentPaymentsRouter = Router();
studentPaymentsRouter.use(requireStudentAuth);
studentPaymentsRouter.post("/authorize/charge", postAuthorizeNetChargeHandler);
studentPaymentsRouter.post(
  "/authorize/tuition-charge",
  postAuthorizeNetTuitionChargeHandler,
);
studentPaymentsRouter.post(
  "/authorize/clinic-fee-charge",
  postAuthorizeNetClinicFeeChargeHandler,
);
studentPaymentsRouter.get(
  "/authorize/current-term-summary",
  getAuthorizeCurrentTermSummaryHandler,
);
studentPaymentsRouter.get(
  "/authorize/tuition-summary",
  getAuthorizeTuitionSummaryHandler,
);
studentPaymentsRouter.get(
  "/authorize/clinic-fee-summary",
  getAuthorizeClinicFeeSummaryHandler,
);
apiRouter.use("/payments", studentPaymentsRouter);

apiRouter.get("/store/catalog", getStoreCatalogHandler);

const studentStoreRouter = Router();
studentStoreRouter.use(requireStudentAuth);
studentStoreRouter.get("/cart", getStoreCartHandler);
studentStoreRouter.put("/cart/lines", putStoreCartLineHandler);
studentStoreRouter.post("/cart/commit-to-ledger", postStoreCartCommitHandler);
studentStoreRouter.delete("/cart/lines", deleteStoreCartLineHandler);
studentStoreRouter.post("/checkout", postStoreCheckoutHandler);
apiRouter.use("/store", studentStoreRouter);

const studentPortalRouter = Router();
studentPortalRouter.use(requireStudentAuth);
studentPortalRouter.post(
  "/enroll",
  requireStudentAuthMatchBody("studentId"),
  postStudentEnroll,
);
studentPortalRouter.post(
  "/withdraw",
  requireStudentAuthMatchBody("studentId"),
  postStudentWithdraw,
);
studentPortalRouter.get(
  "/enrolled-sections",
  requireStudentAuthMatchQuery("studentId"),
  getStudentEnrolledSections,
);
studentPortalRouter.get(
  "/clinical-progress",
  requireStudentAuthMatchQuery("studentId"),
  getStudentClinicalProgressHandler,
);
studentPortalRouter.post(
  "/clinical/exam-request",
  requireStudentAuthMatchQuery("studentId"),
  postStudentClinicalExamRequestHandler,
);
studentPortalRouter.get(
  "/clinical/exam-requests",
  requireStudentAuthMatchQuery("studentId"),
  getStudentClinicalExamRequestsHandler,
);
studentPortalRouter.put("/profile", putStudentProfile);
studentPortalRouter.get("/login-email", getStudentLoginEmailHandler);
studentPortalRouter.post("/login-email/send-code", postStudentLoginEmailSendCodeHandler);
studentPortalRouter.post("/login-email/verify", postStudentLoginEmailVerifyHandler);
studentPortalRouter.get("/me/photo-url", getStudentMyPhotoUrlHandler);
studentPortalRouter.post(
  "/me/photo",
  uploadStudentMyPhotoMiddleware,
  postStudentMyPhotoHandler,
);
apiRouter.use("/student", studentPortalRouter);

apiRouter.post("/ai/ask", requireStudentAuth, postAiAsk);

apiRouter.get("/courses", getCourses);
apiRouter.get("/courses/:code/sections", getCourseSections);

apiRouter.get("/academic-terms/recent", getAcademicTermsRecent);
apiRouter.get("/academic-terms/current", getAcademicTermsCurrent);
apiRouter.get("/academic-terms/current-posted", getAcademicTermsCurrentPosted);
apiRouter.get("/academic-terms", getAcademicTerms);

/** Clinical slots for read-only offered timetable (legacy `clinic_timetable` + enrollment counts). */
apiRouter.get("/clinical/offered-timetable", getClinicalOfferedTimetableHandler);

/** Course bin (per student + academic term); persisted in `student_course_bin`. */
const courseBinRouter = Router({ mergeParams: true });
courseBinRouter.use(requireStudentAuth, requireStudentAuthMatchParam("studentId"));
courseBinRouter.get("/", getCourseBin);
courseBinRouter.post("/", postCourseBin);
courseBinRouter.delete("/", deleteCourseBinForTermHandler);
courseBinRouter.delete("/:itemId", deleteCourseBinItemHandler);
apiRouter.use("/course-bin/:studentId", courseBinRouter);

/** Admin section CRUD. Login/logout/me are public; all other routes require admin auth. */
const adminRouter = Router();
adminRouter.post("/auth/login", postAdminAuthLogin);
adminRouter.post("/auth/logout", postAdminAuthLogout);
adminRouter.get("/auth/me", getAdminAuthMe);
adminRouter.use(requireAdminAuth);
adminRouter.get("/students", getAdminStudents);
adminRouter.get("/students/next-id", getNextAdminStudentId);
adminRouter.post("/students", postAdminStudent);
adminRouter.post("/students/delete-selected", postDeleteSelectedAdminStudents);
adminRouter.post("/students/export.csv", postExportAdminStudentsCsv);
adminRouter.get("/email/profiles", getAdminEmailProfiles);
adminRouter.post("/email/bulk", postAdminBulkEmail);
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
adminRouter.get("/finance/quarter-summary", getAdminFinanceQuarterSummaryHandler);
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

const studentResourceRouter = Router({ mergeParams: true });
studentResourceRouter.use(requireStudentAuth, requireStudentAuthMatchParam("studentId"));
studentResourceRouter.get("/documents", getStudentDocumentRequirementsHandler);
studentResourceRouter.post(
  "/documents/agreement/submit",
  postStudentAgreementSubmitHandler,
);
studentResourceRouter.post(
  "/documents/quizzes/:quizId/submit",
  postStudentQuizSubmitHandler,
);
studentResourceRouter.get("/profile", getStudentProfile);
studentResourceRouter.get("/academics", getStudentAcademics);
studentResourceRouter.get("/gpa", getStudentGpa);
studentResourceRouter.get("/program-progress", getStudentProgramProgress);
studentResourceRouter.get("/course-feedback", getStudentCourseFeedback);
studentResourceRouter.post("/course-feedback", postStudentCourseFeedback);
studentResourceRouter.get("/transcript-preview", getStudentTranscriptPreview);
studentResourceRouter.get("/account", getStudentAccount);
studentResourceRouter.get("/clinical-schedule", getStudentClinicalScheduleHandler);
studentResourceRouter.get(
  "/clinical-enrollments/open",
  getStudentOpenClinicalEnrollmentSlotsHandler,
);
studentResourceRouter.get(
  "/clinical-enrollments",
  getStudentClinicalEnrollmentsHandler,
);
studentResourceRouter.post(
  "/clinical-enrollments",
  postStudentClinicalEnrollmentHandler,
);
studentResourceRouter.delete(
  "/clinical-enrollments/:enrollmentId",
  deleteStudentClinicalEnrollmentHandler,
);
studentResourceRouter.post("/clinical-requests", postStudentClinicalRequestHandler);
studentResourceRouter.get("/clinical-requests", getStudentClinicalRequestsHandler);
studentResourceRouter.get("/activity", getStudentActivity);
studentResourceRouter.get("/accounting/quarters", getAccountingQuarters);
studentResourceRouter.get("/accounting/ledger", getAccountingLedger);
apiRouter.use("/students/:studentId", studentResourceRouter);

apiRouter.get("/demo/account", getDemoAccount);
apiRouter.get("/demo/activity", getDemoActivity);

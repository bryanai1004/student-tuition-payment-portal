import { Router } from "express";
import {
  getAdminStudent,
  getAdminStudents,
  getNextAdminStudentId,
  postAdminStudent,
  postDeleteSelectedAdminStudents,
  putAdminStudent,
} from "../controllers/adminStudentController.js";
import {
  deleteAdminCourseSection,
  getAdminCourseSectionEnrollments,
  getAdminCourseSections,
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
  postAdminFinanceChargeHandler,
  postAdminFinancePaymentHandler,
  postRunLateFeeCheck,
  putAdminFinanceChargeByIdHandler,
  putAdminFinancePaymentByIdHandler,
  putFinanceQuarterSettings,
} from "../controllers/adminFinanceController.js";
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
import { getStudentAcademics } from "../controllers/studentAcademicsController.js";
import {
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
} from "../controllers/studentAccountController.js";
import { postStudentLogin } from "../controllers/studentAuthController.js";
import {
  getStudentEnrolledSections,
  postStudentEnroll,
  postStudentWithdraw,
} from "../controllers/studentEnrollmentController.js";
import {
  getAcademicTerms,
  getAcademicTermsCurrent,
  getAcademicTermsRecent,
  patchAdminAcademicTerm,
  postAdminAcademicTerm,
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
  deleteStudentClinicalEnrollmentHandler,
  getStudentClinicalEnrollmentsHandler,
  getStudentOpenClinicalEnrollmentSlotsHandler,
  postStudentClinicalEnrollmentHandler,
} from "../controllers/clinicalEnrollmentController.js";
import {
  deleteAdminClinicalSlotHandler,
  getAdminClinicalSlotsHandler,
  patchAdminClinicalSlotHandler,
  postAdminClinicalSlotHandler,
} from "../controllers/adminClinicalSlotController.js";
import {
  getAdminClinicalTimetableHandler,
  getStudentClinicalScheduleHandler,
  postAdminClinicalAssignHandler,
} from "../controllers/clinicalScheduleController.js";
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

apiRouter.post("/student/enroll", postStudentEnroll);
apiRouter.post("/student/withdraw", postStudentWithdraw);
apiRouter.get("/student/enrolled-sections", getStudentEnrolledSections);

apiRouter.post("/ai/ask", postAiAsk);

apiRouter.get("/courses", getCourses);
apiRouter.get("/courses/:code/sections", getCourseSections);

apiRouter.get("/academic-terms/recent", getAcademicTermsRecent);
apiRouter.get("/academic-terms/current", getAcademicTermsCurrent);
apiRouter.get("/academic-terms", getAcademicTerms);

/** Course bin (per student); requires `student_course_bin` table when used. */
apiRouter.get("/course-bin/:studentId", getCourseBin);
apiRouter.post("/course-bin/:studentId", postCourseBin);
apiRouter.delete(
  "/course-bin/:studentId/:itemId",
  deleteCourseBinItemHandler,
);

/** Admin section CRUD: protect with auth / role checks before exposing publicly. */
const adminRouter = Router();
adminRouter.get("/students", getAdminStudents);
adminRouter.get("/students/next-id", getNextAdminStudentId);
adminRouter.post("/students", postAdminStudent);
adminRouter.post("/students/delete-selected", postDeleteSelectedAdminStudents);
adminRouter.get("/students/:studentId", getAdminStudent);
adminRouter.put("/students/:studentId", putAdminStudent);
adminRouter.get(
  "/courses/open-for-registration",
  getAdminCoursesOpenForRegistration,
);
adminRouter.get(
  "/course-sections/enrollments",
  getAdminCourseSectionEnrollments,
);
adminRouter.get("/course-sections", getAdminCourseSections);
adminRouter.post("/course-sections", postAdminCourseSection);
adminRouter.patch("/course-sections/:id", patchAdminCourseSection);
adminRouter.delete("/course-sections/:id", deleteAdminCourseSection);
adminRouter.delete("/enrollments", deleteAdminPortalEnrollmentHandler);
adminRouter.post("/marks/set-grade", setStudentGrade);
adminRouter.get("/finance/quarters", getGlobalFinanceQuarters);
adminRouter.get("/finance/quarter-settings", getFinanceQuarterSettings);
adminRouter.put("/finance/quarter-settings", putFinanceQuarterSettings);
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
adminRouter.patch("/academic-terms/:id", patchAdminAcademicTerm);
adminRouter.get("/clinical/timetable", getAdminClinicalTimetableHandler);
adminRouter.get("/clinical/slots", getAdminClinicalSlotsHandler);
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

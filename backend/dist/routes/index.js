import { Router } from "express";
import { deleteAdminCourseSection, patchAdminCourseSection, postAdminCourseSection, } from "../controllers/adminCourseSectionController.js";
import { deleteCourseBinItemHandler, getCourseBin, postCourseBin, } from "../controllers/courseBinController.js";
import { getCourseSections, getCourses } from "../controllers/courseController.js";
import { getHealth, getHealthDb } from "../controllers/healthController.js";
import { getAccountingLedger, getAccountingQuarters, } from "../controllers/studentLedgerController.js";
import { getDemoAccount, getDemoActivity, getStudentAccount, getStudentActivity, getStudentProfile, } from "../controllers/studentAccountController.js";
import { postStudentLogin } from "../controllers/studentAuthController.js";
export const apiRouter = Router();
apiRouter.get("/health", getHealth);
apiRouter.get("/health/db", getHealthDb);
apiRouter.post("/auth/login", postStudentLogin);
apiRouter.get("/courses", getCourses);
apiRouter.get("/courses/:code/sections", getCourseSections);
/** Course bin (per student); requires `student_course_bin` table when used. */
apiRouter.get("/course-bin/:studentId", getCourseBin);
apiRouter.post("/course-bin/:studentId", postCourseBin);
apiRouter.delete("/course-bin/:studentId/:itemId", deleteCourseBinItemHandler);
/** Admin section CRUD: protect with auth / role checks before exposing publicly. */
const adminRouter = Router();
adminRouter.post("/course-sections", postAdminCourseSection);
adminRouter.patch("/course-sections/:id", patchAdminCourseSection);
adminRouter.delete("/course-sections/:id", deleteAdminCourseSection);
apiRouter.use("/admin", adminRouter);
apiRouter.get("/students/:studentId/profile", getStudentProfile);
apiRouter.get("/students/:studentId/account", getStudentAccount);
apiRouter.get("/students/:studentId/activity", getStudentActivity);
apiRouter.get("/students/:studentId/accounting/quarters", getAccountingQuarters);
apiRouter.get("/students/:studentId/accounting/ledger", getAccountingLedger);
apiRouter.get("/demo/account", getDemoAccount);
apiRouter.get("/demo/activity", getDemoActivity);
//# sourceMappingURL=index.js.map
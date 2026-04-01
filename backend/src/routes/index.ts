import { Router } from "express";
import {
  deleteAdminCourseSection,
  patchAdminCourseSection,
  postAdminCourseSection,
} from "../controllers/adminCourseSectionController.js";
import {
  deleteCourseBinItemHandler,
  getCourseBin,
  postCourseBin,
} from "../controllers/courseBinController.js";
import { getCourseSections, getCourses } from "../controllers/courseController.js";
import { getHealth, getHealthDb } from "../controllers/healthController.js";
import {
  getDemoAccount,
  getDemoActivity,
  getStudentAccount,
  getStudentActivity,
} from "../controllers/studentAccountController.js";

export const apiRouter = Router();

apiRouter.get("/health", getHealth);
apiRouter.get("/health/db", getHealthDb);

apiRouter.get("/courses", getCourses);
apiRouter.get("/courses/:code/sections", getCourseSections);

/** Course bin (per student); requires `student_course_bin` table when used. */
apiRouter.get("/course-bin/:studentId", getCourseBin);
apiRouter.post("/course-bin/:studentId", postCourseBin);
apiRouter.delete(
  "/course-bin/:studentId/:itemId",
  deleteCourseBinItemHandler,
);

/** Admin section CRUD: protect with auth / role checks before exposing publicly. */
const adminRouter = Router();
adminRouter.post("/course-sections", postAdminCourseSection);
adminRouter.patch("/course-sections/:id", patchAdminCourseSection);
adminRouter.delete("/course-sections/:id", deleteAdminCourseSection);
apiRouter.use("/admin", adminRouter);

apiRouter.get("/students/:studentId/account", getStudentAccount);
apiRouter.get("/students/:studentId/activity", getStudentActivity);

apiRouter.get("/demo/account", getDemoAccount);
apiRouter.get("/demo/activity", getDemoActivity);

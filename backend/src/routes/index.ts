import { Router } from "express";
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

apiRouter.get("/students/:studentId/account", getStudentAccount);
apiRouter.get("/students/:studentId/activity", getStudentActivity);

apiRouter.get("/demo/account", getDemoAccount);
apiRouter.get("/demo/activity", getDemoActivity);

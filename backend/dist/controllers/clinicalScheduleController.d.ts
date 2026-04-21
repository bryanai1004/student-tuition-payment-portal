import type { Request, Response } from "express";
/**
 * GET /api/students/:studentId/clinical-schedule
 */
export declare function getStudentClinicalScheduleHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/clinical/timetable
 * Query: optional `term`, `year` (filters legacy `clinic_timetable` rows).
 */
export declare function getAdminClinicalTimetableHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/clinical/offered-timetable
 * Read-only `clinic_timetable` rows + enrolled counts (student portal + admins).
 */
export declare function getClinicalOfferedTimetableHandler(req: Request, res: Response): Promise<void>;
/**
 * POST /api/admin/clinical/assign
 * Preferred body: { studentId, timetableId }
 * Legacy body: { studentId, courseCode, sessionDate, sessionName?, site?, faculty? }
 */
export declare function postAdminClinicalAssignHandler(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=clinicalScheduleController.d.ts.map
import type { Request, Response } from "express";
/**
 * GET /api/student/clinical-progress?studentId=
 *
 * Clinical hours and completed-clinical detail rows from legacy `clinic` (non-empty grade).
 * Fixed five-row exam history from legacy `marks` (CL% codes), matching the transcript source.
 */
export declare function getStudentClinicalProgressHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/students/:studentId/clinical-progress
 *
 * Admin read-only clinical progress for one student.
 * Reuses the exact same clinic/marks pipeline as the student endpoint.
 */
export declare function getAdminStudentClinicalProgressHandler(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=studentClinicalProgressController.d.ts.map
import type { Request, Response } from "express";
/**
 * POST /api/admin/marks/set-grade
 * Body: { studentId, courseCode, term, grade } — `term` is academic_terms.id; `grade2` is derived server-side.
 * Writes legacy `marks` only (never portal_enrollments).
 */
export declare function setStudentGrade(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=adminMarksController.d.ts.map
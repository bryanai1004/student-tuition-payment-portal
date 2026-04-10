import type { Request, Response } from "express";
export declare function postStudentEnroll(req: Request, res: Response): Promise<void>;
/**
 * GET /api/student/enrolled-sections?studentId=&academic_term_id=
 * Section rows for the student's active portal enrollments in that term (one row per enrollment; section-keyed when available).
 */
export declare function getStudentEnrolledSections(req: Request, res: Response): Promise<void>;
/**
 * POST /api/student/withdraw
 * Body: { studentId, academic_term_id, course_section_id } — `course_sections.id` for the row to withdraw.
 */
export declare function postStudentWithdraw(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=studentEnrollmentController.d.ts.map
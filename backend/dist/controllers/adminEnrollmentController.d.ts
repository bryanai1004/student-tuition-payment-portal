import type { Request, Response } from "express";
/**
 * DELETE /api/admin/enrollments — soft-withdraw one portal enrollment (prefer `course_section_id`).
 * Body: { studentId, academic_term_id, course_section_id } or legacy { studentId, academic_term_id, course_code } for rows with NULL `course_section_id`.
 */
export declare function deleteAdminPortalEnrollmentHandler(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=adminEnrollmentController.d.ts.map
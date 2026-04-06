import type { Request, Response } from "express";
/**
 * DELETE /api/admin/enrollments — remove one course-level `portal_enrollments` row (admin reject).
 * Body: { studentId, academic_term_id, course_code }
 */
export declare function deleteAdminPortalEnrollmentHandler(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=adminEnrollmentController.d.ts.map
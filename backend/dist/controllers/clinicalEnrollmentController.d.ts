import type { Request, Response } from "express";
/**
 * GET /api/admin/clinical/slots/:timetableId/roster
 */
export declare function getAdminClinicalSlotRosterHandler(req: Request, res: Response): Promise<void>;
/**
 * DELETE /api/admin/clinical/slots/:timetableId/enrollments/:enrollmentId?studentId=
 */
export declare function deleteAdminClinicalSlotEnrollmentHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/students/:studentId/clinical-enrollments/open
 */
export declare function getStudentOpenClinicalEnrollmentSlotsHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/students/:studentId/clinical-enrollments
 */
export declare function getStudentClinicalEnrollmentsHandler(req: Request, res: Response): Promise<void>;
/**
 * POST /api/students/:studentId/clinical-enrollments
 * Body: { timetableId: number }
 */
export declare function postStudentClinicalEnrollmentHandler(req: Request, res: Response): Promise<void>;
/**
 * DELETE /api/students/:studentId/clinical-enrollments/:enrollmentId
 */
export declare function deleteStudentClinicalEnrollmentHandler(req: Request, res: Response): Promise<void>;
/**
 * POST /api/admin/clinical/run-payment-hold-cleanup
 * Marks paid clinical booking holds and auto-drops overdue unpaid bookings (idempotent).
 */
export declare function postAdminClinicalPaymentHoldCleanupHandler(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=clinicalEnrollmentController.d.ts.map
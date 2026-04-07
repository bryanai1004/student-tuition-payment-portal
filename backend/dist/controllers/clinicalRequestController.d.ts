import type { Request, Response } from "express";
/**
 * POST /api/students/:studentId/clinical-requests
 * Body: { timetableId }
 */
export declare function postStudentClinicalRequestHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/students/:studentId/clinical-requests
 */
export declare function getStudentClinicalRequestsHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/clinical/requests
 */
export declare function getAdminClinicalRequestsHandler(_req: Request, res: Response): Promise<void>;
/**
 * POST /api/admin/clinical/requests/:id/approve
 */
export declare function postApproveClinicalRequestHandler(req: Request, res: Response): Promise<void>;
/**
 * POST /api/admin/clinical/requests/:id/reject
 */
export declare function postRejectClinicalRequestHandler(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=clinicalRequestController.d.ts.map
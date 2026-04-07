import type { Request, Response } from "express";
/**
 * GET /api/admin/finance/students?term=&year=
 */
export declare function getAdminFinanceStudents(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/finance/quarters
 */
export declare function getGlobalFinanceQuarters(_req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/finance/quarter-settings?term=&year=
 */
export declare function getFinanceQuarterSettings(req: Request, res: Response): Promise<void>;
/**
 * PUT /api/admin/finance/quarter-settings
 */
export declare function putFinanceQuarterSettings(req: Request, res: Response): Promise<void>;
/**
 * POST /api/admin/finance/run-late-fee
 */
export declare function postRunLateFeeCheck(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/finance/:studentId/quarters
 */
export declare function getAdminFinanceQuartersHandler(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/finance/:studentId/ledger?term=&year=
 */
export declare function getAdminFinanceLedgerHandler(req: Request, res: Response): Promise<void>;
/**
 * POST /api/admin/finance/charge
 */
export declare function postAdminFinanceChargeHandler(req: Request, res: Response): Promise<void>;
/**
 * POST /api/admin/finance/payment
 */
export declare function postAdminFinancePaymentHandler(req: Request, res: Response): Promise<void>;
/**
 * PUT /api/admin/finance/charge/:id
 * Query: studentId, term, year (ledger context)
 */
export declare function putAdminFinanceChargeByIdHandler(req: Request, res: Response): Promise<void>;
/**
 * DELETE /api/admin/finance/charge/:id
 */
export declare function deleteAdminFinanceChargeByIdHandler(req: Request, res: Response): Promise<void>;
/**
 * PUT /api/admin/finance/payment/:id
 */
export declare function putAdminFinancePaymentByIdHandler(req: Request, res: Response): Promise<void>;
/**
 * DELETE /api/admin/finance/payment/:id
 */
export declare function deleteAdminFinancePaymentByIdHandler(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=adminFinanceController.d.ts.map
import type { Request, Response } from "express";
/**
 * GET /api/admin/finance/students
 */
export declare function getAdminFinanceStudents(_req: Request, res: Response): Promise<void>;
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
//# sourceMappingURL=adminFinanceController.d.ts.map
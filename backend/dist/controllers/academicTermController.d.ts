import type { Request, Response } from "express";
export declare function getAcademicTerms(_req: Request, res: Response): Promise<void>;
export declare function getAcademicTermsRecent(req: Request, res: Response): Promise<void>;
export declare function getAcademicTermsCurrent(_req: Request, res: Response): Promise<void>;
/** GET /api/academic-terms/current-posted — manually posted dashboard term, or `null`. */
export declare function getAcademicTermsCurrentPosted(_req: Request, res: Response): Promise<void>;
export declare function postAdminAcademicTerm(req: Request, res: Response): Promise<void>;
export declare function postAdminAcademicTermPost(req: Request, res: Response): Promise<void>;
export declare function patchAdminAcademicTerm(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=academicTermController.d.ts.map
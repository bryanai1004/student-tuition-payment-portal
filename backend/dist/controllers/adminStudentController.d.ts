import type { NextFunction, Request, Response } from "express";
export declare function getAdminStudents(req: Request, res: Response): Promise<void>;
export declare function postExportAdminStudentsCsv(req: Request, res: Response): Promise<void>;
export declare function uploadAdminStudentPhotoMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function getAdminStudent(req: Request, res: Response): Promise<void>;
export declare function getAdminStudentPhotoUrlHandler(req: Request, res: Response): Promise<void>;
export declare function postAdminStudentPhoto(req: Request, res: Response): Promise<void>;
export declare function getNextAdminStudentId(req: Request, res: Response): Promise<void>;
export declare function postAdminStudent(req: Request, res: Response): Promise<void>;
export declare function postAdminStudentLoa(req: Request, res: Response): Promise<void>;
export declare function postDeleteSelectedAdminStudents(req: Request, res: Response): Promise<void>;
export declare function putAdminStudent(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=adminStudentController.d.ts.map
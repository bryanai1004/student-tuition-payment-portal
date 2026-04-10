import type { Request, Response } from "express";
/**
 * GET /api/admin/course-sections/course-meta?course_code=
 * Chinese-first title from `courses` + optional single-confidence instructor hint from timetables/marks.
 */
export declare function getAdminCourseSectionCourseMeta(req: Request, res: Response): Promise<void>;
export declare function getAdminCourseSections(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/course-sections/enrollments?academic_term_id=&course_code=
 * Portal enrollment roster for admin (all statuses; grade W when withdrawn), same source as student Academics.
 */
export declare function getAdminCourseSectionEnrollments(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/course-sections/:id/export-registered-students.csv
 * UTF-8 CSV with BOM for Excel; roster is course+term+year (see adminExportRegisteredStudentsCsvService).
 */
export declare function getAdminExportRegisteredStudentsCsv(req: Request, res: Response): Promise<void>;
export declare function postAdminCourseSection(req: Request, res: Response): Promise<void>;
export declare function patchAdminCourseSection(req: Request, res: Response): Promise<void>;
export declare function deleteAdminCourseSection(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=adminCourseSectionController.d.ts.map
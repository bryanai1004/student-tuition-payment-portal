import type { Request, Response } from "express";
/**
 * GET /api/admin/course-sections/course-meta?course_code=
 * Chinese-first title from `courses` + optional instructor hint from timetables/marks (stable pick when multiple).
 */
export declare function getAdminCourseSectionCourseMeta(req: Request, res: Response): Promise<void>;
export declare function getAdminCourseSections(req: Request, res: Response): Promise<void>;
/**
 * GET /api/admin/course-sections/enrollments?academic_term_id=&course_code=&section_id=
 * Optional `section_id` (`course_sections.id`) limits the roster to that section (+ legacy course-level rows on the canonical MIN(section id) for that course when applicable).
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
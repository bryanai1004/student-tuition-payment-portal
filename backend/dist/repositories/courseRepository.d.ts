/** API output keys (fixed contract). */
export declare const COURSE_LIST_KEYS: readonly ["code", "eng_name", "chi_name", "units", "prerequisite", "concurrent", "category", "is_daim", "clinic1Required", "clinic2Required"];
export type CourseListKey = (typeof COURSE_LIST_KEYS)[number];
export type CourseListItem = Record<CourseListKey, string | number | boolean | null>;
/**
 * Lists rows from `school.courses` (current DB from env). Column names are
 * resolved against INFORMATION_SCHEMA so minor naming differences are handled.
 */
export declare function listCoursesFromMysql(): Promise<CourseListItem[]>;
//# sourceMappingURL=courseRepository.d.ts.map
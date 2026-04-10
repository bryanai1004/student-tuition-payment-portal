export type CourseCatalogNamesRow = {
    chi_name: string;
    eng_name: string;
};
/**
 * Legacy `courses` row for the given code (TRIM match). Empty strings treated as absent for titles.
 */
export declare function selectCourseNamesByCode(courseCode: string): Promise<CourseCatalogNamesRow | null>;
/**
 * Distinct non-empty TRIM(instructor_id) across legacy timetable tables for TRIM(course) = code.
 */
export declare function selectDistinctTimetableInstructorIdsForCourse(courseCode: string): Promise<string[]>;
export declare function selectInstructorDisplayNameByInstructorId(instructorId: string): Promise<string | null>;
/**
 * Distinct trimmed legacy marks instructor strings for the course code (non-empty only).
 */
export declare function selectDistinctMarksInstructorsForCourse(courseCode: string): Promise<string[]>;
//# sourceMappingURL=adminCourseMetaRepository.d.ts.map
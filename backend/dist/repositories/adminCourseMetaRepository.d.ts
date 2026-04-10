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
export type TimetableInstructorPairRow = {
    instructor_id: string;
    instructor: string;
};
/**
 * Distinct (instructor_id, instructor) pairs from legacy timetable tables for the course.
 * Includes rows with empty instructor_id when `instructor` text is present (e.g. daim_timetable).
 */
export declare function selectDistinctTimetableInstructorPairsForCourse(courseCode: string): Promise<TimetableInstructorPairRow[]>;
export type InstructorNamesRow = {
    name_chi: string;
    name_eng: string;
};
/** Bilingual names for timetable `instructor_id` → `instructors` (first row by sequence). */
export declare function selectInstructorNamesByInstructorId(instructorId: string): Promise<InstructorNamesRow | null>;
/**
 * First bilingual row per TRIM(instructor_id) for batch timetable resolution.
 */
export declare function selectInstructorNamesMapForInstructorIds(instructorIds: string[]): Promise<Map<string, InstructorNamesRow>>;
export declare function selectInstructorDisplayNameByInstructorId(instructorId: string): Promise<string | null>;
/**
 * Distinct trimmed legacy marks instructor strings for the course code (non-empty only).
 */
export declare function selectDistinctMarksInstructorsForCourse(courseCode: string): Promise<string[]>;
//# sourceMappingURL=adminCourseMetaRepository.d.ts.map
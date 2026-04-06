/** API shape for one `course_sections` row (stable for future admin CRUD). */
export type CourseSectionDetail = {
    id: number;
    course_code: string;
    term: string;
    year: number;
    section_code: string;
    weekday: string;
    start_time: string | null;
    end_time: string | null;
    delivery_mode: string | null;
    room: string | null;
    instructor: string | null;
    notes: string | null;
};
export type CourseSectionCreateInput = {
    course_code: string;
    term: string;
    year: number;
    section_code: string;
    weekday: string;
    start_time?: string | null;
    end_time?: string | null;
    delivery_mode?: string | null;
    room?: string | null;
    instructor?: string | null;
    notes?: string | null;
};
export type CourseSectionUpdateInput = Partial<CourseSectionCreateInput>;
export declare function getCourseSectionById(id: number): Promise<CourseSectionDetail | null>;
export type CourseSectionTermFilter = {
    term: string;
    year: number;
};
/**
 * Sections for a catalog course, from `course_sections` keyed by `course_code`.
 * When `termFilter` is set, restricts rows to that legacy `term` + `year` (matches `academic_terms.term_name` / `year`).
 */
export declare function listCourseSectionsByCourseCode(courseCode: string, termFilter?: CourseSectionTermFilter): Promise<CourseSectionDetail[]>;
/** All sections offered in a legacy term + year (for admin timetable). */
export declare function listCourseSectionsByTermYear(term: string, year: number): Promise<CourseSectionDetail[]>;
export declare function createCourseSection(input: CourseSectionCreateInput): Promise<CourseSectionDetail>;
/**
 * Applies a partial update. Returns `null` if the row does not exist.
 * Callers should reject empty patches before calling.
 */
export declare function updateCourseSection(id: number, patch: CourseSectionUpdateInput): Promise<CourseSectionDetail | null>;
export declare function deleteCourseSectionById(id: number): Promise<boolean>;
//# sourceMappingURL=courseSectionRepository.d.ts.map
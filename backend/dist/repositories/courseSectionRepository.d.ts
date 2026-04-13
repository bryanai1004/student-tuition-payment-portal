import type { RowDataPacket } from "mysql2";
/** API shape for one `course_sections` row (stable for future admin CRUD). */
export type CourseSectionDetail = {
    id: number;
    course_code: string;
    prerequisite_course_id: string | null;
    term: string;
    year: number;
    section_code: string;
    /** Offered timetable group: English (EN) vs Chinese (CN). Not student track. */
    schedule_track: "EN" | "CN";
    weekday: string;
    start_time: string | null;
    end_time: string | null;
    delivery_mode: string | null;
    room: string | null;
    instructor: string | null;
    notes: string | null;
    /** Set when `portal_courses.title` is selected (e.g. student enrolled-sections). Otherwise null. */
    course_title: string | null;
    /** Distinct students enrolled in this course (same term/year) via `portal_enrollments`. */
    enrolled_count: number;
    /** Catalog units from `courses.units` (joined by `course_code`); null when no catalog row. */
    units: number | null;
    /** Present when at least one enrollment exists for the course in this term/year. */
    enrolled_students?: Array<{
        student_external_id: string;
        full_name: string | null;
    }>;
};
/** Shared by section rows and course-level open-registration rollups. */
export declare function parseEnrolledStudentsJson(raw: unknown): CourseSectionDetail["enrolled_students"];
export declare function mapCourseSectionRow(row: RowDataPacket): CourseSectionDetail;
export type CourseSectionCreateInput = {
    course_code: string;
    prerequisite_course_id?: string | null;
    term: string;
    year: number;
    section_code: string;
    /** Defaults to EN when omitted (insert uses DB default / repository fallback). */
    schedule_track?: "EN" | "CN";
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
/**
 * Sections for a term/year with `portal_enrollments` rollups **per section row** (exact `course_section_id`,
 * plus legacy course-level rows attributed to the canonical `MIN(course_sections.id)` for that course).
 */
export declare function listCourseSectionsWithEnrollmentAggregates(term: string, year: number, options?: {
    courseCode?: string | null;
}): Promise<CourseSectionDetail[]>;
/** Course-level section counts for one legacy term + year (admin open-registration rollup). */
export type CourseSectionCountByCourse = {
    course_code: string;
    section_count: number;
};
export type CoursePrerequisiteCandidateByCourse = {
    course_code: string;
    prerequisite_course_id: string | null;
    prerequisite_course_code: string | null;
    prerequisite_course_title: string | null;
};
/** Course-level `portal_enrollments` counts (distinct students; multiple section rows per student still count once per course). */
export type PortalEnrollmentRollupByCourse = {
    course_code: string;
    enrolled_count: number;
    enrolled_students?: CourseSectionDetail["enrolled_students"];
};
export declare function listPortalEnrollmentRollupsByCourseForTermYear(term: string, year: number): Promise<PortalEnrollmentRollupByCourse[]>;
export declare function countCourseSectionsByCourseForTermYear(term: string, year: number): Promise<CourseSectionCountByCourse[]>;
/**
 * Candidate prerequisite rows for each offered course in a term/year.
 *
 * Returns one row per section so the service layer can deterministically pick a
 * course-level prerequisite and optionally warn when sections disagree.
 */
export declare function listCoursePrerequisiteCandidatesByCourseForTermYear(term: string, year: number): Promise<CoursePrerequisiteCandidateByCourse[]>;
export declare function createCourseSection(input: CourseSectionCreateInput): Promise<CourseSectionDetail>;
/**
 * Applies a partial update. Returns `null` if the row does not exist.
 * Callers should reject empty patches before calling.
 */
export declare function updateCourseSection(id: number, patch: CourseSectionUpdateInput): Promise<CourseSectionDetail | null>;
export declare function deleteCourseSectionById(id: number): Promise<boolean>;
//# sourceMappingURL=courseSectionRepository.d.ts.map
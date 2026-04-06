import { type CourseSectionDetail } from "./courseSectionRepository.js";
export type EnrollSectionInput = {
    course_code: string;
    section_code: string;
};
/**
 * Validates each section against `course_sections` and `portal_courses`, then inserts
 * `portal_enrollments` rows. Skips duplicates (same student + course_id + term + year).
 */
export declare function enrollStudentInSections(studentExternalId: string, term: string, year: number, sections: EnrollSectionInput[]): Promise<{
    ok: true;
    insertedCount: number;
} | {
    ok: false;
    error: string;
}>;
/**
 * One `course_sections` row per enrolled course (same term/year), chosen deterministically when
 * multiple sections exist for a course (lowest `id`). Timetable display for course-only portal enrollments.
 */
export declare function listStudentEnrolledSectionRows(studentExternalId: string, term: string, year: number): Promise<CourseSectionDetail[]>;
//# sourceMappingURL=studentEnrollmentRepository.d.ts.map
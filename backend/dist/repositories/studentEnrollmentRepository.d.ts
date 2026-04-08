import { type CourseSectionDetail } from "./courseSectionRepository.js";
export type EnrollSectionInput = {
    course_code: string;
    section_code: string;
    /** Disambiguates duplicate section_code across EN vs CN offered timetables. */
    schedule_track?: "EN" | "CN";
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
export type PortalEnrollmentAcademicStatus = "active" | "withdrawn" | "completed" | "dropped" | "unknown";
export type PortalEnrollmentAcademicRow = {
    course_code: string;
    course_title_raw: string;
    term: string;
    year: number;
    units: number | null;
    weekday: string | null;
    start_time: unknown;
    end_time: unknown;
    instructor: string | null;
    status: PortalEnrollmentAcademicStatus;
    withdrawn_at: string | null;
};
/**
 * Latest portal enrollment term/year for a student (same ordering as legacy registration “latest”).
 */
export declare function findLatestPortalEnrollmentTermYear(studentExternalId: string): Promise<{
    term: string;
    year: number;
} | null>;
/**
 * All `portal_enrollments` for a student with catalog title/units and one deterministic section row
 * per course+term+year (lowest `course_sections.id`) for schedule display.
 */
export declare function listPortalEnrollmentRowsForStudentAcademics(studentExternalId: string): Promise<PortalEnrollmentAcademicRow[]>;
/**
 * Removes one course-level portal enrollment (any section). Only `portal_enrollments` is affected.
 */
export declare function deletePortalEnrollmentByStudentCourseTermYear(studentExternalId: string, courseCode: string, term: string, year: number): Promise<number>;
export declare function getPortalStudentDisplayName(studentExternalId: string): Promise<string | null>;
//# sourceMappingURL=studentEnrollmentRepository.d.ts.map
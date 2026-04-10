import { type CourseSectionDetail } from "./courseSectionRepository.js";
export type EnrollSectionInput = {
    course_code: string;
    section_code: string;
    /** Disambiguates duplicate section_code across EN vs CN offered timetables. */
    schedule_track?: "EN" | "CN";
};
/**
 * Validates each section against `course_sections` and `portal_courses`, then inserts or reactivates
 * `portal_enrollments` rows. Duplicate / idempotency: same student + `course_section_id` + term + year
 * (active rows skipped; withdrawn rows reactivated). Legacy course-only rows are not used for new writes.
 */
export declare function enrollStudentInSections(studentExternalId: string, term: string, year: number, sections: EnrollSectionInput[]): Promise<{
    ok: true;
    insertedCount: number;
} | {
    ok: false;
    error: string;
}>;
export type StudentEnrolledSectionsQueryMeta = {
    activePortalEnrollmentCount: number;
    matchedSectionCount: number;
};
export type StudentEnrolledSectionsQueryResult = {
    sections: CourseSectionDetail[];
    meta: StudentEnrolledSectionsQueryMeta;
};
/**
 * Scheduled section rows for a student's **active** `portal_enrollments` in one calendar term/year.
 *
 * When `portal_enrollments.course_section_id` is set, the timetable row is that exact section.
 * Legacy rows with `course_section_id` NULL still resolve via `portal_courses.course_code` and a single
 * deterministic `course_sections` pick (`MIN(id)`) per enrollment row.
 */
export declare function listStudentEnrolledSectionsForTerm(studentExternalId: string, term: string, year: number): Promise<StudentEnrolledSectionsQueryResult>;
/** @deprecated Prefer {@link listStudentEnrolledSectionsForTerm} for schedule metadata. */
export declare function listStudentEnrolledSectionRows(studentExternalId: string, term: string, year: number): Promise<CourseSectionDetail[]>;
export type PortalEnrollmentAcademicStatus = "active" | "withdrawn" | "completed" | "dropped" | "unknown";
/** Admin section roster: same `portal_enrollments` + joins as student Academics, all statuses. */
export type AdminSectionEnrollmentRepositoryRow = {
    studentId: string;
    name: string | null;
    status: PortalEnrollmentAcademicStatus;
    grade: string | null;
    withdrawn_at: string | null;
};
export declare function listAdminEnrollmentRowsForSection(courseCode: string, term: string, year: number, options?: {
    courseSectionId?: number | null;
}): Promise<AdminSectionEnrollmentRepositoryRow[]>;
export type PortalEnrollmentAcademicRow = {
    /** Stable row id for ordering when the same course appears in multiple sections. */
    portal_enrollment_id: number;
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
    section_code: string | null;
    schedule_track: string | null;
};
/**
 * Latest portal enrollment term/year for a student (same ordering as legacy registration “latest”).
 */
export declare function findLatestPortalEnrollmentTermYear(studentExternalId: string): Promise<{
    term: string;
    year: number;
} | null>;
/**
 * All `portal_enrollments` for a student with catalog title/units and timetable fields from
 * `course_sections`: exact `course_section_id` when present, else legacy `MIN(id)` pick per row.
 */
export declare function listPortalEnrollmentRowsForStudentAcademics(studentExternalId: string): Promise<PortalEnrollmentAcademicRow[]>;
/**
 * Soft-withdraws the enrollment row for one `course_sections.id` (and matching calendar term/year).
 * Only `portal_enrollments` is updated.
 */
export declare function softWithdrawPortalEnrollmentByCourseSection(studentExternalId: string, term: string, year: number, courseSectionId: number): Promise<number>;
/**
 * Legacy: soft-withdraws a **course-level** portal row (`course_section_id` IS NULL) only.
 * Does not affect section-keyed enrollments for the same course code.
 */
export declare function deletePortalEnrollmentByStudentCourseTermYear(studentExternalId: string, courseCode: string, term: string, year: number): Promise<number>;
export declare function getPortalStudentDisplayName(studentExternalId: string): Promise<string | null>;
//# sourceMappingURL=studentEnrollmentRepository.d.ts.map
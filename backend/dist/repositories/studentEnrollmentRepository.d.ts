import { type CourseSectionDetail } from "./courseSectionRepository.js";
export type EnrollSectionInput = {
    course_code: string;
    section_code: string;
    /** Disambiguates duplicate section_code across EN vs CN offered timetables. */
    schedule_track?: "EN" | "CN";
};
export type ResolvedEnrollmentSection = {
    course_section_id: number;
    course_code: string;
    section_code: string;
    schedule_track: "EN" | "CN";
    prerequisite_course_id: string | null;
    prerequisite_course_code: string | null;
    prerequisite_course_title: string | null;
};
export type StudentHistoricalCourseReference = {
    course_id: string | null;
    course_code: string | null;
    source: "marks" | "portal";
};
export declare function resolveRequestedEnrollmentSectionsForTerm(term: string, year: number, sections: EnrollSectionInput[]): Promise<{
    ok: true;
    sections: ResolvedEnrollmentSection[];
} | {
    ok: false;
    error: string;
}>;
export declare function listStudentHistoricalCourseReferences(studentExternalId: string): Promise<StudentHistoricalCourseReference[]>;
/**
 * Validates each section against `course_sections` and `portal_courses`, then inserts or reactivates
 * `portal_enrollments` rows. Duplicate / idempotency: same student + `course_section_id` + term + year
 * (active rows skipped; withdrawn rows reactivated). Legacy course-only rows are not used for new writes.
 */
export declare function enrollStudentInSections(studentExternalId: string, term: string, year: number, sections: EnrollSectionInput[], options?: {
    resolvedSections?: ResolvedEnrollmentSection[];
}): Promise<{
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
export type PortalEnrollmentSectionRosterRepositoryRow = {
    studentId: string;
    studentName: string | null;
    enrollmentStatus: string | null;
    term: string | null;
    year: number | null;
    courseCode: string | null;
    sectionCode: string | null;
    program: string | null;
    email: string | null;
};
/**
 * Current section roster sourced from `portal_enrollments` keyed by `course_section_id`.
 * Includes all current statuses exactly as stored on `portal_enrollments.status`.
 */
export declare function listPortalEnrollmentRosterBySectionId(sectionId: number): Promise<PortalEnrollmentSectionRosterRepositoryRow[]>;
export declare function listAdminEnrollmentRowsForSection(courseCode: string, term: string, year: number, options?: {
    courseSectionId?: number | null;
}): Promise<AdminSectionEnrollmentRepositoryRow[]>;
export type PortalEnrollmentAcademicRow = {
    /** Stable row id for ordering when the same course appears in multiple sections. */
    portal_enrollment_id: number;
    registration_id: number;
    course_section_id: number | null;
    course_code: string;
    course_title_raw: string;
    display_course_title: string;
    term: string;
    year: number;
    academic_term_id: string | null;
    withdraw_deadline: string | null;
    units: number | null;
    weekday: string | null;
    start_time: unknown;
    end_time: unknown;
    instructor: string | null;
    status: PortalEnrollmentAcademicStatus;
    withdrawn_at: string | null;
    section_code: string | null;
    schedule_track: string | null;
    can_withdraw: boolean;
};
export type AdminStudentRegistrationTermRow = {
    term: string;
    year: number;
};
export type AdminStudentRegistrationHistoryRow = {
    courseCode: string;
    courseTitle: string | null;
    section: string | null;
    units: number | null;
    status: string | null;
    term: string;
    year: number;
};
/** Distinct portal enrollment term/year options for one student; newest first. */
export declare function listPortalEnrollmentTermsForStudent(studentExternalId: string): Promise<AdminStudentRegistrationTermRow[]>;
/** One row per portal enrollment course for one student + term/year. */
export declare function listPortalEnrollmentHistoryForStudentTerm(studentExternalId: string, term: string, year: number): Promise<AdminStudentRegistrationHistoryRow[]>;
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
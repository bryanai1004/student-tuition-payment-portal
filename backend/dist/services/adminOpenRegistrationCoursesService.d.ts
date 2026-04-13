export type AdminOpenRegistrationCourseRow = {
    courseCode: string;
    courseTitle: string;
    credits: number;
    category: string;
    termId: string;
    termLabel: string;
    openSections: number;
    /** Distinct students in `portal_enrollments` for this course + term (course-level, not per section). */
    enrolledCount: number;
    enrolledStudents?: Array<{
        student_external_id: string;
        full_name: string | null;
    }>;
    prerequisiteCourseId: string | null;
    prerequisiteCourseCode: string | null;
    prerequisiteCourseTitle: string | null;
    registrationStatus: "Open" | "Closed";
};
/**
 * Admin rollup: courses that have at least one section scheduled in the given academic term.
 *
 * Assumption: `course_sections` has no per-section “open for registration” flag. Each row
 * represents a scheduled offering; we count those rows per course. Whether registration is
 * active for the term is taken from `academic_terms.status === 'registration_open'`
 * (mirrors student “current registration term” behavior).
 */
export declare function listAdminOpenRegistrationCourses(academicTermId: string): Promise<AdminOpenRegistrationCourseRow[] | null>;
//# sourceMappingURL=adminOpenRegistrationCoursesService.d.ts.map
export declare function removeAdminPortalEnrollment(params: {
    studentId: string;
    academic_term_id: string;
    /** Preferred: withdraw this `course_sections.id` row only. */
    course_section_id?: number | null;
    /** Legacy fallback when `course_section_id` is omitted: course-level row (`course_section_id` IS NULL). */
    course_code?: string;
}): Promise<{
    ok: true;
    removedCount: number;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=adminEnrollmentService.d.ts.map
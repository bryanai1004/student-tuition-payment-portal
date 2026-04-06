export declare function removeAdminPortalEnrollment(params: {
    studentId: string;
    academic_term_id: string;
    course_code: string;
}): Promise<{
    ok: true;
    removedCount: number;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=adminEnrollmentService.d.ts.map
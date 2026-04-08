export type SetAdminMarkGradeInput = {
    studentId: string;
    courseCode: string;
    /** Portal `academic_terms.id` (UUID). */
    academicTermId: string;
    grade: string;
};
export type SetAdminMarkGradeResult = {
    ok: true;
} | {
    ok: false;
    error: string;
    status: number;
};
export declare function setAdminStudentMarkGrade(input: SetAdminMarkGradeInput): Promise<SetAdminMarkGradeResult>;
//# sourceMappingURL=adminMarksService.d.ts.map
import { type EnrollSectionInput } from "../repositories/studentEnrollmentRepository.js";
export type { EnrollSectionInput };
export declare function enrollStudentForAcademicTerm(studentId: string, academicTermId: string, sections: EnrollSectionInput[]): Promise<{
    ok: true;
    insertedCount: number;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=studentEnrollmentService.d.ts.map
import { type CourseSectionCreateInput, type CourseSectionDetail, type CourseSectionTermFilter, type CourseSectionUpdateInput } from "../repositories/courseSectionRepository.js";
export type { CourseSectionCreateInput, CourseSectionDetail, CourseSectionTermFilter, CourseSectionUpdateInput, };
/** Thrown when `academic_term_id` does not match a row in `academic_terms`. */
export declare class InvalidAcademicTermError extends Error {
    readonly name = "InvalidAcademicTermError";
    constructor();
}
export declare function getSectionsForCourseCode(courseCode: string, termFilter?: CourseSectionTermFilter): Promise<CourseSectionDetail[]>;
/**
 * Sections for one catalog course in one academic term (resolves `academic_terms.id` → legacy `term` + `year`).
 * Returns `null` when the term id is unknown.
 */
export declare function listCourseSectionsByAcademicTermId(academicTermId: string, courseCode: string): Promise<CourseSectionDetail[] | null>;
/** Every section in the term (all courses). Returns `null` if term id is unknown. */
export declare function listAllCourseSectionsByAcademicTermId(academicTermId: string): Promise<CourseSectionDetail[] | null>;
export type CourseSectionCreateWithTermIdInput = Omit<CourseSectionCreateInput, "term" | "year">;
export declare function createCourseSectionWithAcademicTermId(academicTermId: string, input: CourseSectionCreateWithTermIdInput): Promise<CourseSectionDetail>;
/**
 * Applies field updates and always sets `term` / `year` from `academic_term_id`.
 * `fieldPatch` must not include `term` or `year` from the client.
 */
export declare function updateCourseSectionWithAcademicTermId(id: number, academicTermId: string, fieldPatch: CourseSectionUpdateInput): Promise<CourseSectionDetail | null>;
export declare function createCourseSection(input: CourseSectionCreateInput): Promise<CourseSectionDetail>;
export declare function updateCourseSection(id: number, patch: CourseSectionUpdateInput): Promise<CourseSectionDetail | null>;
export declare function deleteCourseSection(id: number): Promise<boolean>;
//# sourceMappingURL=courseSectionService.d.ts.map
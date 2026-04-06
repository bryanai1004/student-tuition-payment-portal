import { type CourseSectionCreateInput, type CourseSectionDetail, type CourseSectionTermFilter, type CourseSectionUpdateInput } from "../repositories/courseSectionRepository.js";
export type { CourseSectionCreateInput, CourseSectionDetail, CourseSectionTermFilter, CourseSectionUpdateInput, };
export declare function getSectionsForCourseCode(courseCode: string, termFilter?: CourseSectionTermFilter): Promise<CourseSectionDetail[]>;
export declare function createCourseSection(input: CourseSectionCreateInput): Promise<CourseSectionDetail>;
export declare function updateCourseSection(id: number, patch: CourseSectionUpdateInput): Promise<CourseSectionDetail | null>;
export declare function deleteCourseSection(id: number): Promise<boolean>;
//# sourceMappingURL=courseSectionService.d.ts.map
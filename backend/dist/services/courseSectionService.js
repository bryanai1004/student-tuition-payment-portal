import { createCourseSection as insertCourseSection, deleteCourseSectionById, listCourseSectionsByCourseCode, updateCourseSection as patchCourseSection, } from "../repositories/courseSectionRepository.js";
export async function getSectionsForCourseCode(courseCode) {
    return listCourseSectionsByCourseCode(courseCode);
}
export async function createCourseSection(input) {
    return insertCourseSection(input);
}
export async function updateCourseSection(id, patch) {
    return patchCourseSection(id, patch);
}
export async function deleteCourseSection(id) {
    return deleteCourseSectionById(id);
}
//# sourceMappingURL=courseSectionService.js.map
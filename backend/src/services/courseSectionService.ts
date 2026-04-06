import {
  createCourseSection as insertCourseSection,
  deleteCourseSectionById,
  listCourseSectionsByCourseCode,
  updateCourseSection as patchCourseSection,
  type CourseSectionCreateInput,
  type CourseSectionDetail,
  type CourseSectionTermFilter,
  type CourseSectionUpdateInput,
} from "../repositories/courseSectionRepository.js";

export type {
  CourseSectionCreateInput,
  CourseSectionDetail,
  CourseSectionTermFilter,
  CourseSectionUpdateInput,
};

export async function getSectionsForCourseCode(
  courseCode: string,
  termFilter?: CourseSectionTermFilter,
): Promise<CourseSectionDetail[]> {
  return listCourseSectionsByCourseCode(courseCode, termFilter);
}

export async function createCourseSection(
  input: CourseSectionCreateInput,
): Promise<CourseSectionDetail> {
  return insertCourseSection(input);
}

export async function updateCourseSection(
  id: number,
  patch: CourseSectionUpdateInput,
): Promise<CourseSectionDetail | null> {
  return patchCourseSection(id, patch);
}

export async function deleteCourseSection(id: number): Promise<boolean> {
  return deleteCourseSectionById(id);
}

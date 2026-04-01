import {
  listCourseSectionsByCourseCode,
  type CourseSectionDetail,
} from "../repositories/courseSectionRepository.js";

export type { CourseSectionDetail };

export async function getSectionsForCourseCode(
  courseCode: string,
): Promise<CourseSectionDetail[]> {
  return listCourseSectionsByCourseCode(courseCode);
}

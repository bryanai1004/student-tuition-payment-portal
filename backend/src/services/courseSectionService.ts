import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import {
  createCourseSection as insertCourseSection,
  deleteCourseSectionById,
  listCourseSectionsByCourseCode,
  listCourseSectionsWithEnrollmentAggregates,
  updateCourseSection as patchCourseSection,
  type CourseSectionCreateInput,
  type CourseSectionDetail,
  type CourseSectionTermFilter,
  type CourseSectionUpdateInput,
} from "../repositories/courseSectionRepository.js";
import { listPortalEnrollmentRosterBySectionId } from "../repositories/studentEnrollmentRepository.js";

export type {
  CourseSectionCreateInput,
  CourseSectionDetail,
  CourseSectionTermFilter,
  CourseSectionUpdateInput,
};

/** Thrown when `academic_term_id` does not match a row in `academic_terms`. */
export class InvalidAcademicTermError extends Error {
  override readonly name = "InvalidAcademicTermError";

  constructor() {
    super("INVALID_ACADEMIC_TERM_ID");
  }
}

export async function getSectionsForCourseCode(
  courseCode: string,
  termFilter?: CourseSectionTermFilter,
): Promise<CourseSectionDetail[]> {
  return listCourseSectionsByCourseCode(courseCode, termFilter);
}

/**
 * Sections for one catalog course in one academic term (resolves `academic_terms.id` → legacy `term` + `year`).
 * Returns `null` when the term id is unknown.
 */
export async function listCourseSectionsByAcademicTermId(
  academicTermId: string,
  courseCode: string,
): Promise<CourseSectionDetail[] | null> {
  const row = await getAcademicTermById(academicTermId.trim());
  if (!row) return null;
  return listCourseSectionsWithEnrollmentAggregates(row.term_name, row.year, {
    courseCode: courseCode.trim(),
  });
}

/** Every section in the term (all courses). Returns `null` if term id is unknown. */
export async function listAllCourseSectionsByAcademicTermId(
  academicTermId: string,
): Promise<CourseSectionDetail[] | null> {
  const row = await getAcademicTermById(academicTermId.trim());
  if (!row) return null;
  return listCourseSectionsWithEnrollmentAggregates(row.term_name, row.year);
}

export type CourseSectionCreateWithTermIdInput = Omit<
  CourseSectionCreateInput,
  "term" | "year"
>;

export type SectionRosterItem = {
  studentId: string;
  studentName: string;
  enrollmentStatus: string | null;
  courseCode: string | null;
  sectionCode: string | null;
  term: string | null;
  year: number | null;
  program: string | null;
  email: string | null;
};

export async function createCourseSectionWithAcademicTermId(
  academicTermId: string,
  input: CourseSectionCreateWithTermIdInput,
): Promise<CourseSectionDetail> {
  const row = await getAcademicTermById(academicTermId.trim());
  if (!row) throw new InvalidAcademicTermError();
  return insertCourseSection({
    ...input,
    term: row.term_name,
    year: row.year,
  });
}

/**
 * Applies field updates and always sets `term` / `year` from `academic_term_id`.
 * `fieldPatch` must not include `term` or `year` from the client.
 */
export async function updateCourseSectionWithAcademicTermId(
  id: number,
  academicTermId: string,
  fieldPatch: CourseSectionUpdateInput,
): Promise<CourseSectionDetail | null> {
  const row = await getAcademicTermById(academicTermId.trim());
  if (!row) throw new InvalidAcademicTermError();
  const patch: CourseSectionUpdateInput = {
    ...fieldPatch,
    term: row.term_name,
    year: row.year,
  };
  return patchCourseSection(id, patch);
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

export async function getSectionRoster(
  sectionId: number,
): Promise<SectionRosterItem[]> {
  const normalizedSectionId = Math.trunc(Number(sectionId));
  if (!Number.isFinite(normalizedSectionId) || normalizedSectionId <= 0) {
    throw new Error("INVALID_SECTION_ID");
  }

  const rows = await listPortalEnrollmentRosterBySectionId(normalizedSectionId);
  return rows.map((row) => ({
    studentId: row.studentId,
    studentName: row.studentName ?? row.studentId,
    enrollmentStatus: row.enrollmentStatus,
    courseCode: row.courseCode,
    sectionCode: row.sectionCode,
    term: row.term,
    year: row.year,
    program: row.program,
    email: row.email,
  }));
}

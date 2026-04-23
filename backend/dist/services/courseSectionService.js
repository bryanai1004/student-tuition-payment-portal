import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { createCourseSection as insertCourseSection, deleteCourseSectionById, listCourseSectionsByCourseCode, listCourseSectionsWithEnrollmentAggregates, updateCourseSection as patchCourseSection, } from "../repositories/courseSectionRepository.js";
import { listPortalEnrollmentRosterBySectionId } from "../repositories/studentEnrollmentRepository.js";
/** Thrown when `academic_term_id` does not match a row in `academic_terms`. */
export class InvalidAcademicTermError extends Error {
    name = "InvalidAcademicTermError";
    constructor() {
        super("INVALID_ACADEMIC_TERM_ID");
    }
}
export async function getSectionsForCourseCode(courseCode, termFilter) {
    return listCourseSectionsByCourseCode(courseCode, termFilter);
}
/**
 * Sections for one catalog course in one academic term (resolves `academic_terms.id` → legacy `term` + `year`).
 * Returns `null` when the term id is unknown.
 */
export async function listCourseSectionsByAcademicTermId(academicTermId, courseCode) {
    const row = await getAcademicTermById(academicTermId.trim());
    if (!row)
        return null;
    return listCourseSectionsWithEnrollmentAggregates(row.term_name, row.year, {
        courseCode: courseCode.trim(),
    });
}
/** Every section in the term (all courses). Returns `null` if term id is unknown. */
export async function listAllCourseSectionsByAcademicTermId(academicTermId) {
    const row = await getAcademicTermById(academicTermId.trim());
    if (!row)
        return null;
    return listCourseSectionsWithEnrollmentAggregates(row.term_name, row.year);
}
export async function createCourseSectionWithAcademicTermId(academicTermId, input) {
    const row = await getAcademicTermById(academicTermId.trim());
    if (!row)
        throw new InvalidAcademicTermError();
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
export async function updateCourseSectionWithAcademicTermId(id, academicTermId, fieldPatch) {
    const row = await getAcademicTermById(academicTermId.trim());
    if (!row)
        throw new InvalidAcademicTermError();
    const patch = {
        ...fieldPatch,
        term: row.term_name,
        year: row.year,
    };
    return patchCourseSection(id, patch);
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
export async function getSectionRoster(sectionId) {
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
//# sourceMappingURL=courseSectionService.js.map
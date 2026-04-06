import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import { enrollStudentInSections, } from "../repositories/studentEnrollmentRepository.js";
import { InvalidAcademicTermError } from "./courseSectionService.js";
export async function enrollStudentForAcademicTerm(studentId, academicTermId, sections) {
    const row = await getAcademicTermById(academicTermId.trim());
    if (!row)
        throw new InvalidAcademicTermError();
    return enrollStudentInSections(studentId, row.term_name, row.year, sections);
}
//# sourceMappingURL=studentEnrollmentService.js.map
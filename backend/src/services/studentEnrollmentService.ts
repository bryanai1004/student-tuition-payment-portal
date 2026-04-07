import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import {
  enrollStudentInSections,
  type EnrollSectionInput,
} from "../repositories/studentEnrollmentRepository.js";
import { InvalidAcademicTermError } from "./courseSectionService.js";

export type { EnrollSectionInput };

/**
 * Registers sections under the academic term’s `term_name` and `year`. Those values are the same
 * quarter key used by `portal_enrollments` and by finance (`getAccountingQuartersPayload` /
 * `getAccountingLedgerPayload` portal fallback), so a completed registration appears on the ledger
 * for that term without hardcoded quarter data.
 */
export async function enrollStudentForAcademicTerm(
  studentId: string,
  academicTermId: string,
  sections: EnrollSectionInput[],
): Promise<
  { ok: true; insertedCount: number } | { ok: false; error: string }
> {
  const row = await getAcademicTermById(academicTermId.trim());
  if (!row) throw new InvalidAcademicTermError();
  return enrollStudentInSections(studentId, row.term_name, row.year, sections);
}

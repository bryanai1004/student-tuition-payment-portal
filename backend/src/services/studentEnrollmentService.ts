/**
 * Registration domain (writes): portal enrollment into `portal_enrollments` + `course_sections`.
 * NOT `marks` (academic attempts), NOT transcript, NOT degree audit — those are read/computed elsewhere.
 */

import { getAcademicTermById } from "../repositories/academicTermRepository.js";
import {
  enrollStudentInSections,
  type EnrollSectionInput,
} from "../repositories/studentEnrollmentRepository.js";
import { InvalidAcademicTermError } from "./courseSectionService.js";
import { getStudentQuarterBalance } from "./studentLedgerService.js";

export type { EnrollSectionInput };

/** Thrown when academic term policy blocks registration (maps to HTTP 400 with this message). */
export class RegistrationLockedOverdueBalanceError extends Error {
  constructor() {
    super(
      "Registration is locked because the payment due date for this term has passed and the account still has an outstanding balance.",
    );
    this.name = "RegistrationLockedOverdueBalanceError";
  }
}

function utcTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

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

  if (row.lock_registration_if_overdue === true) {
    const due = row.payment_due_date?.trim() ?? "";
    if (due.length >= 10) {
      const dueDay = due.slice(0, 10);
      const today = utcTodayIsoDate();
      if (today > dueDay) {
        const balance = await getStudentQuarterBalance(
          studentId.trim(),
          row.term_name,
          row.year,
        );
        if (balance > 0) {
          throw new RegistrationLockedOverdueBalanceError();
        }
      }
    }
  }

  return enrollStudentInSections(studentId, row.term_name, row.year, sections);
}

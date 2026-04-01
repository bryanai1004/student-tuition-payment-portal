import type { LegacyAccountSnapshot } from "../repositories/studentLegacyAccountRepository.js";
import type { StudentAccountPayload } from "../types/studentAccount.js";

/**
 * Step 3A: minimal honest payload from legacy `students` + `registration` only.
 * No portal billing reconstruction; empty arrays / nulls where data is not sourced yet.
 */
export function assembleLegacyMinimalStudentAccountPayload(
  snap: LegacyAccountSnapshot,
): StudentAccountPayload {
  const ob = Math.round(snap.totalFees * 100) / 100;
  return {
    program: null,
    term: snap.term,
    year: snap.year,
    studentId: snap.studentId,
    student: {
      name: snap.displayName,
      studentId: snap.studentId,
      term: snap.term,
      year: snap.year,
    },
    preference: null,
    lineItems: [],
    summary: {
      tuitionTotal: 0,
      clinicalTotal: 0,
      feesTotal: 0,
      otherTotal: 0,
      totalCharges: ob,
      payments: 0,
      outstandingBalance: ob,
    },
    scheduleRows: [],
    payments: [],
    installmentSchedule: [],
    installmentPolicy: [],
    billingStatus: null,
    termChargeEffectiveDate: null,
  };
}

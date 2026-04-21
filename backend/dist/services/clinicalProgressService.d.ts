/**
 * ClinicalProgress = clinic ladder + completed hours vs `requirements.clinic_hours`.
 * Not an academic course attempt (marks/clinic grade rows); not transcript UI rows; do not merge into didactic unit totals.
 */
import type { Pool } from "mysql2/promise";
import type { ClinicalProgress } from "../domain/studentDomainModels.js";
/**
 * Maps {@link ClinicalProgress}.level (CL111→1, CL211→2, CL311→3; 0 = no ladder row yet)
 * to `clinic_timetable` capacity bucket keys used for booking (`100` / `200` / `300`).
 */
export type ClinicalBookingLevelKey = "100" | "200" | "300";
export declare function clinicalProgressToBookingLevelKey(cp: ClinicalProgress): ClinicalBookingLevelKey;
/**
 * Two queries total: clinic rows for all ids, then required hours per student.
 * Same rules as {@link buildClinicalProgress}; map keys are trimmed student ids.
 */
export declare function batchBuildClinicalProgressForStudentIds(pool: Pool, studentIds: string[]): Promise<Map<string, ClinicalProgress>>;
/**
 * Legacy clinical progress from `clinic`, `students`, and `requirements` (real students only).
 */
export declare function buildClinicalProgress(pool: Pool, studentId: string): Promise<ClinicalProgress>;
//# sourceMappingURL=clinicalProgressService.d.ts.map
/**
 * **Clinical progress** domain: legacy `clinic` rows + `requirements.clinic_hours`. Independent of academic attempts
 * and transcript display rows — do not derive this from `marks` or merge clinic transcript lines into academic units.
 */
import type { Pool } from "mysql2/promise";
import type { ClinicalProgressDomain } from "../domain/studentDomainModels.js";
/**
 * Two queries total: clinic rows for all ids, then required hours per student.
 * Same rules as {@link buildClinicalProgress}; map keys are trimmed student ids.
 */
export declare function batchBuildClinicalProgressForStudentIds(pool: Pool, studentIds: string[]): Promise<Map<string, ClinicalProgressDomain>>;
/**
 * Legacy clinical progress from `clinic`, `students`, and `requirements` (real students only).
 */
export declare function buildClinicalProgress(pool: Pool, studentId: string): Promise<ClinicalProgressDomain>;
//# sourceMappingURL=clinicalProgressService.d.ts.map
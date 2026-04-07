import type { Pool } from "mysql2/promise";
import type { ClinicalProgress } from "../types/studentAccount.js";
/**
 * Legacy clinical progress from `clinic`, `students`, and `requirements` (real students only).
 */
export declare function buildClinicalProgress(pool: Pool, studentId: string): Promise<ClinicalProgress>;
//# sourceMappingURL=clinicalProgressService.d.ts.map
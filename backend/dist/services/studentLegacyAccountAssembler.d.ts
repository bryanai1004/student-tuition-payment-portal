import type { MarksRow } from "../repositories/studentAcademicsRepository.js";
import type { LegacyAccountingRow, LegacyAccountSnapshot } from "../repositories/studentLegacyAccountRepository.js";
import type { CourseTranscriptLookupEntry } from "../repositories/studentTranscriptRepository.js";
import type { AccountScheduleTermOption, ClinicalProgress, StudentAccountPayload } from "../types/studentAccount.js";
/** Legacy `accounting.date` is stored as YYYYMMDD (int). Emit ISO date for API / frontend. */
export declare function legacyAccountingDateToIso(dateRaw: number): string;
/**
 * Real-student payload: legacy `students` + `registration` + `accounting` (Step 3B).
 * Category splits are minimal; `lineItems` and portal-only fields stay empty until later steps.
 */
export type AssembleLegacyStudentAccountOptions = {
    /** True active enrollment term (latest open registration on marks); drives `currentTerm` on the payload. */
    portalActiveTerm: {
        term: string;
        year: number;
    } | null;
    availableScheduleTerms: AccountScheduleTermOption[];
    clinicalProgress: ClinicalProgress;
};
export declare function assembleLegacyStudentAccountPayload(snap: LegacyAccountSnapshot, accountingRows: LegacyAccountingRow[], 
/** All `marks` rows for the student (newest term first), same source as `/academics`. */
allMarksRows: MarksRow[], courseLookup: Map<string, CourseTranscriptLookupEntry>, options: AssembleLegacyStudentAccountOptions): StudentAccountPayload;
//# sourceMappingURL=studentLegacyAccountAssembler.d.ts.map
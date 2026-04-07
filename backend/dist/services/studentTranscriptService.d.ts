/**
 * Transcript preview: merges **marks** + **clinic** into display-sorted `TranscriptRecord` rows (`StudentTranscriptRow`).
 * This is a **presentation** read model only — not registration, not degree audit, and not the place to compute
 * earned units or graduation status (`computeDegreeAudit` owns audit math; clinic hours stay in `clinicalProgressService`).
 */
import type { StudentTranscriptPreviewResponse } from "../types/studentTranscript.js";
export declare function getStudentTranscriptPreviewPayload(studentId: string): Promise<StudentTranscriptPreviewResponse>;
//# sourceMappingURL=studentTranscriptService.d.ts.map
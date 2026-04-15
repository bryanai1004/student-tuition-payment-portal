import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import type { StudentProfilePayload } from "../types/studentProfile.js";
type GraduationEvaluationRecord = {
    profile: StudentProfilePayload | null;
    courseRecords: StudentAcademicCourseRecord[];
};
export type GraduationEvaluationResult = {
    eligible: boolean;
    program: string | null;
    track: string | null;
    ruleSetId: string;
    ruleSetSource: string;
    earnedCredits: number;
    totalCredits: number;
    transcriptCredits: number;
    transferCredits: number;
    requiredCredits: number;
    missingCredits: number;
    completedRequiredCourses: string[];
    missingCourses: string[];
    cumulativeGpa: number | null;
    requiredGpa: number | null;
    missingGpa: number | null;
    withdrawalCount: number;
    maximumWithdrawals: number | null;
    notes: string[];
};
export declare function evaluateGraduation(studentRecord: GraduationEvaluationRecord): GraduationEvaluationResult;
export declare function evaluateStudentGraduation(studentId: string): Promise<GraduationEvaluationResult>;
export declare function formatGraduationEvaluationFacts(evaluation: GraduationEvaluationResult): string;
export {};
//# sourceMappingURL=graduationEvaluationService.d.ts.map
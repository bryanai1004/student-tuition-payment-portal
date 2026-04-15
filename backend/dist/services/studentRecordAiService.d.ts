import { type RagAnswerResult } from "./ragService.js";
import type { StudentAcademicCourseRecord } from "../types/studentAcademics.js";
import type { StudentTranscriptRow } from "../types/studentTranscript.js";
type TermYear = {
    term: string;
    year: number;
};
type AcademicHistoryCoverage = "full" | "partial";
type HistoricalAcademicRecordTerm = {
    term: string;
    year: number;
    label: string;
    courses: StudentTranscriptRow[];
};
type HistoricalAcademicRecordSummary = {
    coverage: AcademicHistoryCoverage;
    coverageNote: string;
    knownTerms: TermYear[];
    academicTerms: TermYear[];
    registrationTerms: TermYear[];
    registrationOnlyTerms: TermYear[];
    terms: HistoricalAcademicRecordTerm[];
};
export type StudentRecordAnswerResult = {
    result: RagAnswerResult;
    usedHelpers: string[];
};
export type StudentRecordFactsResult = {
    contextText: string;
    usedHelpers: string[];
};
export declare function getHistoricalAcademicRecord(studentId: string): Promise<HistoricalAcademicRecordSummary>;
export declare function getCoursesByYear(studentId: string, year: number): Promise<StudentTranscriptRow[]>;
export declare function getCoursesByTerm(studentId: string, term: string, year: number): Promise<StudentTranscriptRow[]>;
export declare function getCurrentTermCourses(studentId: string): Promise<{
    courseCode: string;
    courseTitle: string;
    term: string;
    year: number;
    credits: number | null;
    sectionCode: string | null;
}[]>;
export declare function getCurrentTermCourseCount(studentId: string): Promise<number>;
export declare function getRegisteredTerms(studentId: string): Promise<TermYear[]>;
export declare function getRegisteredTermCount(studentId: string): Promise<number>;
export declare function hasRegistrationInYear(studentId: string, year: number): Promise<boolean>;
export declare function getCurrentTermCredits(studentId: string): Promise<number | null>;
export declare function hasCompletedCourse(studentId: string, courseCode: string): Promise<boolean>;
export declare function getWithdrawalHistory(studentId: string): Promise<StudentAcademicCourseRecord[]>;
export declare function answerDeterministicStudentRecordQuestion(studentId: string, question: string): Promise<StudentRecordAnswerResult | null>;
export declare function buildStudentRecordFactsForQuestion(studentId: string, question: string): Promise<StudentRecordFactsResult | null>;
export {};
//# sourceMappingURL=studentRecordAiService.d.ts.map
export type StudentAiIntent = "student_record" | "policy" | "mixed" | "school_fact" | "local_search" | "general";
export type StudentRecordQuestionKind = "current_term_courses" | "current_term_course_count" | "current_term_credits" | "registered_term_count" | "registration_in_year" | "historical_term_lookup" | "all_courses_history" | "withdrawal_history" | "took_course" | "completed_course" | "completed_credits_total";
export type StudentRecordQuestionMatch = {
    kind: "current_term_courses";
} | {
    kind: "current_term_course_count";
} | {
    kind: "current_term_credits";
} | {
    kind: "registered_term_count";
} | {
    kind: "registration_in_year";
    year: number;
} | {
    kind: "historical_term_lookup";
    year: number;
    term: string | null;
} | {
    kind: "all_courses_history";
} | {
    kind: "withdrawal_history";
} | {
    kind: "took_course";
    courseCode: string;
} | {
    kind: "completed_course";
    courseCode: string;
} | {
    kind: "completed_credits_total";
};
export declare function extractCourseCode(question: string): string | null;
export declare function extractHistoricalLookupTerm(question: string): string | null;
export declare function detectStudentRecordQuestion(question: string): StudentRecordQuestionMatch | null;
export declare function detectGraduationEligibilityQuestion(question: string): boolean;
export declare function detectGraduationRequirementCreditsQuestion(question: string): boolean;
export declare function classifyStudentAiIntent(question: string): StudentAiIntent;
//# sourceMappingURL=studentAiQuestionRouter.d.ts.map
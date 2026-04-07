import { type CourseFeedbackDbRow } from "../repositories/studentCourseFeedbackRepository.js";
/** Map key aligned with `enrichEnrollmentWithFeedback` in studentAcademicsService. */
export declare function courseFeedbackLookupKey(courseCode: string, term: string, year: number): string;
export declare function feedbackSubmittedAtMapFromDbRows(rows: CourseFeedbackDbRow[]): Map<string, string>;
/** For merging into GET /academics `enrollmentHistory` (combined registration + attempts; skips DB for demo / empty id). */
export declare function getFeedbackSubmittedAtMapForStudent(studentId: string): Promise<Map<string, string>>;
export type CourseFeedbackApiItem = {
    id: number;
    courseCode: string;
    term: string;
    year: number;
    rating: number;
    workloadRating: number;
    difficultyRating: number;
    comments: string | null;
    submittedAt: string;
};
export declare function getCourseFeedbackForStudentApi(studentId: string): Promise<{
    studentId: string;
    items: CourseFeedbackApiItem[];
}>;
export type SubmitCourseFeedbackBody = {
    courseCode: string;
    term: string;
    year: number;
    rating: number;
    workloadRating: number;
    difficultyRating: number;
    comments: string | null;
};
export declare function parseSubmitCourseFeedbackBody(body: unknown): SubmitCourseFeedbackBody | null;
export type SubmitCourseFeedbackResult = {
    ok: true;
    id: number;
} | {
    ok: false;
    status: 400 | 403 | 404 | 409;
    message: string;
};
export declare function submitCourseFeedback(studentId: string, body: SubmitCourseFeedbackBody): Promise<SubmitCourseFeedbackResult>;
//# sourceMappingURL=studentCourseFeedbackService.d.ts.map
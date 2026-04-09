import type { Pool } from "mysql2/promise";
export type CourseFeedbackDbRow = {
    id: number;
    student_id: string;
    course_code: string;
    term: string;
    year: number;
    q1_rating: number;
    q2_rating: number;
    q3_rating: number;
    q4_rating: number;
    q5_rating: number;
    overall_rating: number;
    comment: string | null;
    submitted_at: Date;
};
/** Minimal row for academics “feedback submitted” map. */
export type CourseFeedbackSubmittedKeyRow = Pick<CourseFeedbackDbRow, "course_code" | "term" | "year" | "submitted_at">;
export type CreateCourseFeedbackInput = {
    studentExternalId: string;
    courseCode: string;
    term: string;
    year: number;
    q1Rating: number;
    q2Rating: number;
    q3Rating: number;
    q4Rating: number;
    q5Rating: number;
    overallRating: number;
    comment: string | null;
};
export declare function createCourseFeedback(pool: Pool, input: CreateCourseFeedbackInput): Promise<number>;
export declare function findCourseFeedbackByStudentCourseTerm(pool: Pool, args: {
    studentExternalId: string;
    courseCode: string;
    term: string;
    year: number;
}): Promise<CourseFeedbackDbRow | null>;
/** For merging feedback flags into GET /academics. */
export declare function listCourseFeedbackSubmittedKeysForStudent(pool: Pool, studentExternalId: string): Promise<CourseFeedbackSubmittedKeyRow[]>;
/** One row per student for a course / calendar term / year (matches UNIQUE uniq_feedback). */
export type CourseFeedbackExportSlice = {
    student_id: string;
    q1_rating: number | null;
    q2_rating: number | null;
    q3_rating: number | null;
    q4_rating: number | null;
    q5_rating: number | null;
    overall_rating: number | null;
    comment: string | null;
};
/** Integer 1–5 only; anything else becomes null (empty CSV cell). */
export declare function parseStoredFeedbackRating1to5(raw: unknown): number | null;
/**
 * Batch-load `course_feedback` for many students in one course + term + year.
 * Map key: trimmed `student_id` (legacy login id, same as `portal_enrollments.student_external_id`).
 */
export declare function mapCourseFeedbackByStudentForCourseTermYear(pool: Pool, args: {
    courseCode: string;
    term: string;
    year: number;
    studentIds: string[];
}): Promise<Map<string, CourseFeedbackExportSlice>>;
//# sourceMappingURL=courseFeedbackRepository.d.ts.map
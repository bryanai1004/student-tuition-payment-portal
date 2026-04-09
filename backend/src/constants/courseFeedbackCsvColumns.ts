/**
 * Human-readable CSV headers for `course_feedback.q1_rating` … `q5_rating`.
 *
 * These correspond in order to `COURSE_FEEDBACK_QUESTIONS` in
 * `frontend/src/components/academics/CourseFeedbackModal.tsx`. If either list
 * changes, update the other so exports stay aligned with the live form.
 */
export const COURSE_FEEDBACK_CSV_QUESTION_RATING_HEADERS = [
  "Course Content & Organization Rating",
  "Instructor Explanation Rating",
  "Course Pace Rating",
  "Assignments & Activities Rating",
  "Recommend Course Rating",
] as const;

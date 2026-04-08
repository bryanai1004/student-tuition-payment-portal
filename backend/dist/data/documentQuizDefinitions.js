/**
 * Grading source of truth for portal document training quizzes.
 * Question ids and correct answer strings must match `frontend/src/data/documentQuizzes.ts`
 * (exact option text as stored when the student selects an answer).
 */
/**
 * Correct answers follow standard FERPA / Title IX / Clery–style training interpretations.
 * If product copy changes on the frontend, update the matching strings here.
 */
export const DOCUMENT_QUIZ_DEFINITIONS = {
    ferpa: {
        id: "ferpa",
        totalQuestions: 5,
        correctAnswers: {
            "ferpa-q1": "Student Education Records",
            "ferpa-q2": "Juvenile Correctional Facilities",
            "ferpa-q3": "Printing off and losing copies may result in accidental release of information to the wrong people, therefore creating a privacy problem for the teacher and student.",
            "ferpa-q4": "Student address and phone number",
            "ferpa-q5": "18",
        },
    },
    titleix: {
        id: "titleix",
        totalQuestions: 5,
        correctAnswers: {
            "titleix-q1": "All of the above are true",
            "titleix-q2": "She should encourage her to tell the co-worker what she finds offensive and get help from the Title IX coordinator if necessary.",
            "titleix-q3": "Stalking is only okay if it is acceptable in your culture",
            "titleix-q4": "A stranger smiling and making eye contact with you in the hall.",
            "titleix-q5": "False",
        },
    },
    campus: {
        id: "campus",
        totalQuestions: 5,
        correctAnswers: {
            "campus-q1": "True",
            "campus-q2": "True",
            "campus-q3": "True",
            "campus-q4": "All of the above is correct",
            "campus-q5": "The entry into a structure where the intent cannot be determined",
        },
    },
};
export function getDocumentQuizDefinition(id) {
    return DOCUMENT_QUIZ_DEFINITIONS[id];
}
//# sourceMappingURL=documentQuizDefinitions.js.map
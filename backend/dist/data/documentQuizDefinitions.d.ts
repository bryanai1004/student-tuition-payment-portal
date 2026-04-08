/**
 * Grading source of truth for portal document training quizzes.
 * Question ids and correct answer strings must match `frontend/src/data/documentQuizzes.ts`
 * (exact option text as stored when the student selects an answer).
 */
import type { DocumentQuizRequirementType } from "../types/studentDocuments.js";
export type DocumentQuizDefinition = {
    id: DocumentQuizRequirementType;
    totalQuestions: number;
    /** questionId -> correct answer (exact option label from the quiz UI) */
    correctAnswers: Record<string, string>;
};
/**
 * Correct answers follow standard FERPA / Title IX / Clery–style training interpretations.
 * If product copy changes on the frontend, update the matching strings here.
 */
export declare const DOCUMENT_QUIZ_DEFINITIONS: Record<DocumentQuizRequirementType, DocumentQuizDefinition>;
export declare function getDocumentQuizDefinition(id: DocumentQuizRequirementType): DocumentQuizDefinition;
//# sourceMappingURL=documentQuizDefinitions.d.ts.map
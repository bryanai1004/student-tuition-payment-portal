export type DocumentRequirementType = "ferpa" | "titleix" | "campus" | "copyright_release_agreement";
export type DocumentRequirementStatus = "assigned" | "completed";
export declare const DOCUMENT_REQUIREMENT_TYPES: readonly DocumentRequirementType[];
export declare function isDocumentRequirementType(value: string): value is DocumentRequirementType;
/** Quiz-backed document requirements (not the copyright agreement). */
export type DocumentQuizRequirementType = Extract<DocumentRequirementType, "ferpa" | "titleix" | "campus">;
export declare const DOCUMENT_QUIZ_REQUIREMENT_TYPES: readonly DocumentQuizRequirementType[];
export declare function isDocumentQuizRequirementType(value: string): value is DocumentQuizRequirementType;
export type StudentDocumentRequirement = {
    id: number;
    studentExternalId: string;
    academicTermId: string;
    requirementType: DocumentRequirementType;
    status: DocumentRequirementStatus;
    scoreCorrect: number | null;
    totalQuestions: number | null;
    isPassed: boolean;
    assignedAt: string;
    submittedAt: string | null;
    lastReassignedAt: string | null;
    assignedBy: string | null;
    reassignedBy: string | null;
    createdAt: string;
    updatedAt: string;
};
export type StudentDocumentRequirementAttempt = {
    id: number;
    studentExternalId: string;
    academicTermId: string;
    requirementType: DocumentRequirementType;
    attemptNo: number;
    submittedAnswersJson: unknown | null;
    scoreCorrect: number | null;
    totalQuestions: number | null;
    isPassed: boolean;
    submittedAt: string;
};
/** Insert/update current-state row (service layer supplies full merged values as needed). */
export type UpsertDocumentRequirementInput = {
    studentExternalId: string;
    academicTermId: string;
    requirementType: DocumentRequirementType;
    status: DocumentRequirementStatus;
    scoreCorrect: number | null;
    totalQuestions: number | null;
    isPassed: boolean;
    submittedAt: string | null;
    assignedBy: string | null;
    lastReassignedAt: string | null;
    reassignedBy: string | null;
};
export type CreateDocumentRequirementAttemptInput = {
    studentExternalId: string;
    academicTermId: string;
    requirementType: DocumentRequirementType;
    attemptNo: number;
    submittedAnswersJson: unknown | null;
    scoreCorrect: number | null;
    totalQuestions: number | null;
    isPassed: boolean;
};
//# sourceMappingURL=studentDocuments.d.ts.map
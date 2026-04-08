import { type DocumentQuizRequirementType, type DocumentRequirementStatus, type DocumentRequirementType } from "../types/studentDocuments.js";
export declare class StudentDocumentsValidationError extends Error {
    readonly name = "StudentDocumentsValidationError";
    constructor(message: string);
}
export declare class StudentDocumentsNotFoundError extends Error {
    readonly name = "StudentDocumentsNotFoundError";
    constructor(message: string);
}
export type DocumentRequirementListItem = {
    requirementType: DocumentRequirementType;
    status: DocumentRequirementStatus;
    isPassed: boolean;
    scoreCorrect: number | null;
    totalQuestions: number | null;
    submittedAt: string | null;
    lastReassignedAt: string | null;
};
export type DocumentRequirementsListPayload = {
    studentId: string;
    academicTermId: string;
    requirements: DocumentRequirementListItem[];
};
export type AgreementSubmitPayload = {
    requirementType: "copyright_release_agreement";
    status: "completed";
    submittedAt: string;
};
export type QuizSubmitPayload = {
    requirementType: DocumentQuizRequirementType;
    scoreCorrect: number;
    totalQuestions: number;
    isPassed: boolean;
    status: DocumentRequirementStatus;
    submittedAt: string | null;
};
export type RequirementResetPayload = {
    ok: true;
    requirementType: DocumentRequirementType;
    status: "assigned";
};
export type RequirementsResetAllPayload = {
    ok: true;
};
export declare function listStudentDocumentRequirementsForTerm(studentExternalId: string, academicTermId: string): Promise<DocumentRequirementsListPayload>;
export declare function getAdminStudentDocumentRequirements(studentExternalId: string, academicTermId: string): Promise<DocumentRequirementsListPayload>;
export declare function submitStudentAgreement(studentExternalId: string, academicTermId: string): Promise<AgreementSubmitPayload>;
export declare function submitStudentQuizAttempt(studentExternalId: string, academicTermId: string, quizId: string, answers: Record<string, string>): Promise<QuizSubmitPayload>;
export declare function resetAdminStudentDocumentRequirement(studentExternalId: string, academicTermId: string, requirementType: DocumentRequirementType, reassignedBy: string | null): Promise<RequirementResetPayload>;
export declare function resetAdminStudentDocumentRequirementsForTerm(studentExternalId: string, academicTermId: string, reassignedBy: string | null): Promise<RequirementsResetAllPayload>;
//# sourceMappingURL=studentDocumentsService.d.ts.map
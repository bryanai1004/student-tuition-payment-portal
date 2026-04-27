import { type StudentAiIntent } from "./studentAiQuestionRouter.js";
import { type IdentityContext } from "./conversationFactsService.js";
export type RetrievedChunk = {
    id: string;
    source: string;
    chunkIndex: number;
    content: string;
    score: number;
    program?: "DAHM" | "MAHM" | null;
    sectionTitle?: string;
    subsectionTitle?: string;
    pageStart?: number;
    pageEnd?: number;
};
export type RagAnswerResult = {
    question: string;
    answer: string;
    sources: RetrievedChunk[];
};
export type ChatHistoryItem = {
    role: "user" | "assistant";
    content: string;
};
type ConversationDomain = "academic" | "general";
export type ShortMemoryPlan = {
    history: ChatHistoryItem[] | undefined;
    isFollowUp: boolean;
    isTopicSwitch: boolean;
    previousDomain: ConversationDomain | null;
    effectiveIntent: StudentAiIntent;
};
export type GroundedAmuPipeline = "policy" | "mixed";
export type AnswerAmuQuestionOptions = {
    studentContext?: string | null;
    pipeline?: GroundedAmuPipeline;
    catalogEvidence?: RetrievedChunk[];
    weakRetrieval?: boolean;
    identityContext?: IdentityContext | null;
};
export type UnifiedEvidenceInput = {
    question: string;
    studentEvidence?: string | null;
    catalogEvidence?: RetrievedChunk[];
    courseEvidence?: string | null;
    identityContext?: IdentityContext | null;
    history?: unknown;
};
export type AnswerGeneralQuestionOptions = {
    identityContext?: IdentityContext | null;
};
export type AnswerGraduationQuestionOptions = {
    graduationEvaluation: string;
    identityContext?: IdentityContext | null;
};
export declare class RagQuestionValidationError extends Error {
    constructor(message: string);
}
export declare function plainTextFormatter(text: string): string;
/**
 * Normalize optional client-supplied history: drop invalid entries, trim, cap length and count.
 */
export declare function sanitizeChatHistory(raw: unknown): ChatHistoryItem[] | undefined;
export declare function planShortConversationMemory(question: string, rawHistory: unknown, initialIntent: StudentAiIntent): ShortMemoryPlan;
export declare function answerSchoolFactQuestion(question: string): Promise<RagAnswerResult>;
export declare function answerLocalSearchQuestion(question: string): Promise<RagAnswerResult>;
export declare function answerGeneralQuestion(question: string, rawHistory?: unknown, options?: AnswerGeneralQuestionOptions): Promise<RagAnswerResult>;
export declare function answerStudentRecordQuestionFromFacts(question: string, studentFacts: string, identityContext?: IdentityContext | null): Promise<RagAnswerResult>;
export declare function answerEvidenceDrivenQuestion(input: UnifiedEvidenceInput): Promise<RagAnswerResult>;
export declare function retrieveCatalogEvidenceForQuestion(question: string, rawHistory?: unknown): Promise<{
    chunks: RetrievedChunk[];
    weakRetrieval: boolean;
}>;
export declare function answerGraduationQuestion(question: string, rawHistory?: unknown, options?: AnswerGraduationQuestionOptions): Promise<RagAnswerResult>;
/**
 * Grounded AMU answer path for policy-only and mixed student+policy questions.
 * @param rawHistory - Optional recent turns; sanitized (capped, invalid entries dropped).
 */
export declare function answerAmuQuestion(question: string, rawHistory?: unknown, options?: AnswerAmuQuestionOptions): Promise<RagAnswerResult>;
export {};
//# sourceMappingURL=ragService.d.ts.map
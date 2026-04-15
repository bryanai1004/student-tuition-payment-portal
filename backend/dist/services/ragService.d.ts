export type RetrievedChunk = {
    id: string;
    source: string;
    chunkIndex: number;
    content: string;
    score: number;
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
export type AnswerAmuQuestionOptions = {
    studentContext?: string | null;
};
export declare class RagQuestionValidationError extends Error {
    constructor(message: string);
}
/**
 * Normalize optional client-supplied history: drop invalid entries, trim, cap length and count.
 */
export declare function sanitizeChatHistory(raw: unknown): ChatHistoryItem[] | undefined;
/**
 * End-to-end AMU catalog RAG: intent routing, optional retrieval, grounded chat completion.
 * @param rawHistory - Optional recent turns; sanitized (capped, invalid entries dropped).
 */
export declare function answerAmuQuestion(question: string, rawHistory?: unknown, options?: AnswerAmuQuestionOptions): Promise<RagAnswerResult>;
//# sourceMappingURL=ragService.d.ts.map
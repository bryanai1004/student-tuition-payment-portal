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
export declare class RagQuestionValidationError extends Error {
    constructor(message: string);
}
/**
 * End-to-end AMU catalog RAG: embed question, retrieve top chunks, grounded chat completion.
 */
export declare function answerAmuQuestion(question: string): Promise<RagAnswerResult>;
//# sourceMappingURL=ragService.d.ts.map
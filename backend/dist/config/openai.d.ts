/**
 * Source-of-truth model for text generation calls.
 */
export declare function getOpenAiModel(): string;
/**
 * Embedding model defaults to OPENAI_MODEL, with an explicit embedding fallback.
 */
export declare function getOpenAiEmbeddingModel(): string;
export declare function logOpenAiModelConfiguration(): void;
export declare function verifyOpenAiResponsesApi(): Promise<void>;
//# sourceMappingURL=openai.d.ts.map
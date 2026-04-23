import OpenAI from "openai";
export declare const client: OpenAI;
export declare const CHAT_MODEL: string;
export declare const EMBEDDING_MODEL: string;
/** Ensures chat completions / responses never use an embedding-series model id. */
export declare function assertChatModelForCompletions(model: string): void;
/** Ensures embedding API calls never use the chat model id. */
export declare function assertEmbeddingModelForVectors(model: string): void;
export declare function logOpenAiModelConfiguration(): void;
/**
 * Embeddings only — always uses {@link EMBEDDING_MODEL}; callers must not pass a model id.
 */
export declare function createOpenAiEmbeddingVectors(inputs: string[]): Promise<number[][]>;
export declare function verifyOpenAiResponsesApi(): Promise<void>;
//# sourceMappingURL=openai.d.ts.map
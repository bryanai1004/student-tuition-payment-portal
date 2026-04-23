import type { KnowledgeChunkRow } from "./ragKnowledge.js";
export type CatalogProgram = "DAHM" | "MAHM";
export type CatalogRetrievalDebug = {
    originalUserQuery: string;
    normalizedRetrievalQuery: string;
    embeddingQueryVariants: string[];
    programHint: CatalogProgram | null;
    topChunks: Array<{
        id: string;
        source: string;
        program?: CatalogProgram | null;
        sectionTitle?: string;
        subsectionTitle?: string;
        pageStart?: number;
        pageEnd?: number;
        score: number;
    }>;
    maxScore: number;
};
declare const WEAK_RETRIEVAL_MAX_SCORE = 0.22;
/** Light normalization for logging and a stable retrieval variant. */
export declare function normalizeCatalogQueryText(raw: string): string;
/**
 * Append bilingual keyword bridges so embeddings align across English/Chinese phrasing.
 */
export declare function expandCatalogQueryForEmbedding(question: string, rewritten?: string | null): string;
export declare function detectCatalogProgramHint(text: string): CatalogProgram | null;
export declare function rankCatalogChunksByEmbeddingMaxWithHint(chunks: KnowledgeChunkRow[], queryEmbeddings: number[][], programHint: CatalogProgram | null, cosineSimilarity: (a: number[], b: number[]) => number): Array<{
    chunk: KnowledgeChunkRow;
    score: number;
}>;
export declare function buildRetrievalQueryVariants(args: {
    originalQuestion: string;
    rewrittenRetrievalQuery: string;
}): {
    variants: string[];
    expansion: string;
    normalizedRewrite: string;
};
export declare function selectCatalogChunksForContext(ranked: Array<{
    chunk: KnowledgeChunkRow;
    score: number;
}>, options?: {
    maxChunks?: number;
    relativeFloor?: number;
}): {
    selected: Array<{
        chunk: KnowledgeChunkRow;
        score: number;
    }>;
    maxScore: number;
};
export declare function isWeakCatalogRetrieval(maxScore: number): boolean;
export { WEAK_RETRIEVAL_MAX_SCORE };
//# sourceMappingURL=catalogRetrieval.d.ts.map
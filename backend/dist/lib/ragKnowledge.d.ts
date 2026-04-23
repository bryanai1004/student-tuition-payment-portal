export type CatalogProgram = "DAHM" | "MAHM";
export type KnowledgeChunkRow = {
    id: string;
    source: string;
    chunkIndex: number;
    /** Text shown to the LLM as catalog evidence */
    content: string;
    embedding: number[];
    program?: CatalogProgram | null;
    sectionTitle?: string;
    subsectionTitle?: string;
    pageStart?: number;
    pageEnd?: number;
};
export type KnowledgeIndexFileV2 = {
    schemaVersion: 2;
    embeddingModel: string;
    generatedAt: string;
    chunks: KnowledgeChunkRow[];
};
export declare function knowledgeChunksFilePath(): string;
export declare function cosineSimilarity(a: number[], b: number[]): number;
export declare function loadKnowledgeChunks(): Promise<KnowledgeChunkRow[]>;
//# sourceMappingURL=ragKnowledge.d.ts.map
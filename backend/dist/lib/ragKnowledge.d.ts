export type KnowledgeChunkRow = {
    id: string;
    source: string;
    chunkIndex: number;
    content: string;
    embedding: number[];
};
export declare function knowledgeChunksFilePath(): string;
export declare function cosineSimilarity(a: number[], b: number[]): number;
export declare function loadKnowledgeChunks(): Promise<KnowledgeChunkRow[]>;
//# sourceMappingURL=ragKnowledge.d.ts.map
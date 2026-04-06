import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function knowledgeChunksFilePath() {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(dir, "../../knowledge/build/knowledge_chunks.json");
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
    }
    let dot = 0;
    let normASq = 0;
    let normBSq = 0;
    for (let i = 0; i < a.length; i++) {
        const ai = a[i];
        const bi = b[i];
        dot += ai * bi;
        normASq += ai * ai;
        normBSq += bi * bi;
    }
    const denom = Math.sqrt(normASq) * Math.sqrt(normBSq);
    if (denom === 0)
        return 0;
    return dot / denom;
}
function isNumberArray(x) {
    return (Array.isArray(x) &&
        x.length > 0 &&
        x.every((v) => typeof v === "number" && Number.isFinite(v)));
}
function parseChunkRow(row, index) {
    if (row === null || typeof row !== "object") {
        throw new Error(`knowledge_chunks.json: invalid chunk at index ${index}`);
    }
    const o = row;
    const id = o.id;
    const source = o.source;
    const chunkIndex = o.chunkIndex;
    const content = o.content;
    const embedding = o.embedding;
    if (typeof id !== "string" || id.length === 0) {
        throw new Error(`knowledge_chunks.json: chunk ${index} missing valid string id`);
    }
    if (typeof source !== "string" || source.length === 0) {
        throw new Error(`knowledge_chunks.json: chunk ${index} missing valid string source`);
    }
    if (typeof chunkIndex !== "number" || !Number.isInteger(chunkIndex)) {
        throw new Error(`knowledge_chunks.json: chunk ${index} missing integer chunkIndex`);
    }
    if (typeof content !== "string") {
        throw new Error(`knowledge_chunks.json: chunk ${index} missing string content`);
    }
    if (!isNumberArray(embedding)) {
        throw new Error(`knowledge_chunks.json: chunk ${index} missing numeric embedding vector`);
    }
    return { id, source, chunkIndex, content, embedding };
}
export async function loadKnowledgeChunks() {
    const filePath = knowledgeChunksFilePath();
    let raw;
    try {
        raw = await fs.readFile(filePath, "utf-8");
    }
    catch (e) {
        const err = e;
        if (err.code === "ENOENT") {
            throw new Error(`Knowledge base file not found at ${filePath}. Build the knowledge base first.`);
        }
        throw e;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error("knowledge_chunks.json is not valid JSON");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("knowledge_chunks.json is empty or not a non-empty array");
    }
    return parsed.map((row, i) => parseChunkRow(row, i));
}
//# sourceMappingURL=ragKnowledge.js.map
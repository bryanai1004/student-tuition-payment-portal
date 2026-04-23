import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export function knowledgeChunksFilePath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "../../knowledge/build/knowledge_chunks.json");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: ${a.length} vs ${b.length}. Rebuild the knowledge base so embeddings match ${a.length === 0 || b.length === 0 ? "the" : "the current"} embedding model.`,
    );
  }
  let dot = 0;
  let normASq = 0;
  let normBSq = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normASq += ai * ai;
    normBSq += bi * bi;
  }
  const denom = Math.sqrt(normASq) * Math.sqrt(normBSq);
  if (denom === 0) return 0;
  return dot / denom;
}

function isNumberArray(x: unknown): x is number[] {
  return (
    Array.isArray(x) &&
    x.length > 0 &&
    x.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function parseChunkRow(row: unknown, index: number): KnowledgeChunkRow {
  if (row === null || typeof row !== "object") {
    throw new Error(`knowledge_chunks.json: invalid chunk at index ${index}`);
  }
  const o = row as Record<string, unknown>;
  const id = o.id;
  const source = o.source;
  const chunkIndex = o.chunkIndex;
  const content = o.content;
  const embedding = o.embedding;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(
      `knowledge_chunks.json: chunk ${index} missing valid string id`,
    );
  }
  if (typeof source !== "string" || source.length === 0) {
    throw new Error(
      `knowledge_chunks.json: chunk ${index} missing valid string source`,
    );
  }
  if (typeof chunkIndex !== "number" || !Number.isInteger(chunkIndex)) {
    throw new Error(
      `knowledge_chunks.json: chunk ${index} missing integer chunkIndex`,
    );
  }
  if (typeof content !== "string") {
    throw new Error(
      `knowledge_chunks.json: chunk ${index} missing string content`,
    );
  }
  if (!isNumberArray(embedding)) {
    throw new Error(
      `knowledge_chunks.json: chunk ${index} missing numeric embedding vector`,
    );
  }

  const programRaw = o.program;
  let program: CatalogProgram | null | undefined;
  if (programRaw === null || programRaw === undefined) {
    program = undefined;
  } else if (programRaw === "DAHM" || programRaw === "MAHM") {
    program = programRaw;
  } else {
    program = undefined;
  }

  const sectionTitle =
    typeof o.sectionTitle === "string" ? o.sectionTitle : undefined;
  const subsectionTitle =
    typeof o.subsectionTitle === "string" ? o.subsectionTitle : undefined;
  const pageStart =
    typeof o.pageStart === "number" && Number.isFinite(o.pageStart)
      ? o.pageStart
      : undefined;
  const pageEnd =
    typeof o.pageEnd === "number" && Number.isFinite(o.pageEnd)
      ? o.pageEnd
      : undefined;

  return {
    id,
    source,
    chunkIndex,
    content,
    embedding,
    ...(program !== undefined ? { program } : {}),
    ...(sectionTitle !== undefined ? { sectionTitle } : {}),
    ...(subsectionTitle !== undefined ? { subsectionTitle } : {}),
    ...(pageStart !== undefined ? { pageStart } : {}),
    ...(pageEnd !== undefined ? { pageEnd } : {}),
  };
}

function isKnowledgeIndexV2(x: unknown): x is KnowledgeIndexFileV2 {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    o.schemaVersion === 2 &&
    Array.isArray(o.chunks) &&
    typeof o.embeddingModel === "string"
  );
}

export async function loadKnowledgeChunks(): Promise<KnowledgeChunkRow[]> {
  const filePath = knowledgeChunksFilePath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error(
        `Knowledge base file not found at ${filePath}. Build the knowledge base first.`,
      );
    }
    throw e;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("knowledge_chunks.json is not valid JSON");
  }

  let rows: unknown[];
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (isKnowledgeIndexV2(parsed)) {
    rows = parsed.chunks;
    console.log("[knowledge] loaded index file", {
      schemaVersion: 2,
      embeddingModel: parsed.embeddingModel,
      chunkCount: parsed.chunks.length,
    });
  } else {
    throw new Error(
      "knowledge_chunks.json must be a chunk array or an object with schemaVersion 2 and chunks[]",
    );
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("knowledge_chunks.json is empty or not a non-empty array");
  }

  const chunks = rows.map((row, i) => parseChunkRow(row, i));
  const dim = chunks[0]?.embedding.length;
  for (let i = 1; i < chunks.length; i++) {
    if (chunks[i]!.embedding.length !== dim) {
      throw new Error(
        `knowledge_chunks.json: inconsistent embedding dimensions at chunk ${i}`,
      );
    }
  }
  return chunks;
}

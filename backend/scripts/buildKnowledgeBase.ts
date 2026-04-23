import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  createOpenAiEmbeddingVectors,
  EMBEDDING_MODEL,
} from "../src/config/openai.js";
import type { KnowledgeChunkRow } from "../src/lib/ragKnowledge.js";
import { draftChunksFromPdf } from "./lib/catalogPdfIngest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const KNOWLEDGE_DIR = path.join(BACKEND_ROOT, "knowledge");
const OUTPUT_PATH = path.join(KNOWLEDGE_DIR, "build", "knowledge_chunks.json");

const EMBED_BATCH_SIZE = 64;

dotenv.config({ path: path.join(BACKEND_ROOT, ".env") });

type KnowledgeIndexFileV2 = {
  schemaVersion: 2;
  embeddingModel: string;
  generatedAt: string;
  chunks: KnowledgeChunkRow[];
};

function makeChunkId(
  sourceRelative: string,
  pageStart: number,
  chunkIndex: number,
): string {
  const base = sourceRelative.replace(/\.pdf$/i, "");
  const slug = base
    .normalize("NFKD")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "doc"}-p${pageStart}-c${chunkIndex}`;
}

async function findPdfFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "build") continue;
      out.push(...(await findPdfFiles(full)));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".pdf")) {
      out.push(full);
    }
  }
  return out.sort();
}

async function embedBatches(embedTexts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < embedTexts.length; i += EMBED_BATCH_SIZE) {
    const batch = embedTexts.slice(i, i + EMBED_BATCH_SIZE);
    const part = await createOpenAiEmbeddingVectors(batch);
    vectors.push(...part);
  }
  return vectors;
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in backend/.env");
  process.exit(1);
}

const pdfPaths = await findPdfFiles(KNOWLEDGE_DIR);
if (pdfPaths.length === 0) {
  console.error(`No PDF files found under ${KNOWLEDGE_DIR}`);
  process.exit(1);
}

type PendingChunk = {
  id: string;
  source: string;
  chunkIndex: number;
  content: string;
  program?: KnowledgeChunkRow["program"];
  sectionTitle?: string;
  subsectionTitle?: string;
  pageStart: number;
  pageEnd: number;
  embedText: string;
};

const pending: PendingChunk[] = [];

for (const abs of pdfPaths) {
  const source = path.relative(KNOWLEDGE_DIR, abs);
  console.log(`Ingesting: ${source}`);
  const drafts = await draftChunksFromPdf({
    absolutePath: abs,
    sourceRelative: source,
  });
  if (drafts.length === 0) {
    console.warn(`Warning: no chunks produced for ${source}`);
    continue;
  }
  for (const d of drafts) {
    pending.push({
      id: makeChunkId(source, d.pageStart, pending.length),
      source: d.sourceRelative,
      chunkIndex: d.chunkIndex,
      content: d.content,
      program: d.program ?? undefined,
      sectionTitle: d.sectionTitle || undefined,
      subsectionTitle: d.subsectionTitle || undefined,
      pageStart: d.pageStart,
      pageEnd: d.pageEnd,
      embedText: d.embedText,
    });
  }
}

if (pending.length === 0) {
  console.error("No chunks produced (check PDFs).");
  process.exit(1);
}

console.log(
  `Embedding ${pending.length} chunks with ${EMBEDDING_MODEL} (batched)...`,
);
const vectors = await embedBatches(pending.map((p) => p.embedText));

const chunks: KnowledgeChunkRow[] = pending.map((p, i) => ({
  id: p.id,
  source: p.source,
  chunkIndex: i,
  content: p.content,
  embedding: vectors[i]!,
  ...(p.program ? { program: p.program } : {}),
  ...(p.sectionTitle ? { sectionTitle: p.sectionTitle } : {}),
  ...(p.subsectionTitle ? { subsectionTitle: p.subsectionTitle } : {}),
  pageStart: p.pageStart,
  pageEnd: p.pageEnd,
}));

const payload: KnowledgeIndexFileV2 = {
  schemaVersion: 2,
  embeddingModel: EMBEDDING_MODEL,
  generatedAt: new Date().toISOString(),
  chunks,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
console.log(`Wrote ${chunks.length} chunks to ${OUTPUT_PATH}`);

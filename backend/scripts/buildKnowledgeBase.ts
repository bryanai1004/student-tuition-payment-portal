import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PDFParse } from 'pdf-parse';
import { client, EMBEDDING_MODEL } from '../src/config/openai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_DIR = path.join(BACKEND_ROOT, 'knowledge');
const OUTPUT_PATH = path.join(KNOWLEDGE_DIR, 'build', 'knowledge_chunks.json');

const CHUNK_SIZE = 1200;
const OVERLAP = 200;
const MIN_CHUNK_CHARS = 100;
const EMBED_BATCH_SIZE = 64;

type KnowledgeChunk = {
  id: string;
  source: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
};

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text: string): string[] {
  const stride = CHUNK_SIZE - OVERLAP;
  if (stride <= 0) {
    throw new Error('CHUNK_SIZE must be greater than OVERLAP');
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length >= MIN_CHUNK_CHARS) {
      chunks.push(slice);
    }
    if (end >= text.length) break;
    start += stride;
  }
  return chunks;
}

function makeChunkId(sourceRelative: string, chunkIndex: number): string {
  const base = sourceRelative.replace(/\.pdf$/i, '');
  const slug = base
    .normalize('NFKD')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'doc'}-${chunkIndex}`;
}

async function findPdfFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'build') continue;
      out.push(...(await findPdfFiles(full)));
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) {
      out.push(full);
    }
  }
  return out.sort();
}

async function extractPdfText(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text ?? '';
  } finally {
    await parser.destroy();
  }
}

async function embedBatches(contents: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < contents.length; i += EMBED_BATCH_SIZE) {
    const batch = contents.slice(i, i + EMBED_BATCH_SIZE);
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const row of sorted) {
      if (!row.embedding) {
        throw new Error('Missing embedding in OpenAI response');
      }
      embeddings.push(row.embedding);
    }
  }
  return embeddings;
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in backend/.env');
  process.exit(1);
}

const pdfPaths = await findPdfFiles(KNOWLEDGE_DIR);
if (pdfPaths.length === 0) {
  console.error(`No PDF files found under ${KNOWLEDGE_DIR}`);
  process.exit(1);
}

type Pending = { source: string; chunkIndex: number; content: string };
const pending: Pending[] = [];

for (const abs of pdfPaths) {
  const source = path.relative(KNOWLEDGE_DIR, abs);
  console.log(`Extracting: ${source}`);
  const raw = await extractPdfText(abs);
  const cleaned = normalizeWhitespace(raw);
  if (!cleaned) {
    console.warn(`Warning: no text extracted from ${source}`);
    continue;
  }
  const parts = chunkText(cleaned);
  parts.forEach((content, chunkIndex) => {
    pending.push({ source, chunkIndex, content });
  });
}

if (pending.length === 0) {
  console.error('No chunks produced (check PDFs and MIN_CHUNK_CHARS).');
  process.exit(1);
}

console.log(`Embedding ${pending.length} chunks (${EMBEDDING_MODEL})...`);
const vectors = await embedBatches(pending.map((p) => p.content));

const knowledgeChunks: KnowledgeChunk[] = pending.map((p, i) => ({
  id: makeChunkId(p.source, p.chunkIndex),
  source: p.source,
  chunkIndex: p.chunkIndex,
  content: p.content,
  embedding: vectors[i]!,
}));

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(knowledgeChunks, null, 2), 'utf8');
console.log(`Wrote ${knowledgeChunks.length} chunks to ${OUTPUT_PATH}`);

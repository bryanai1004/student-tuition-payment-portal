import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

type KnowledgeChunk = {
  id: string;
  source: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
};

const TOP_K = 5;

const TEST_QUESTION = 'What is the tuition refund policy?';

const SYSTEM_PROMPT = `You are an assistant for Alhambra Medical University (AMU).
Answer ONLY using the provided retrieved catalog content.
Do NOT use outside knowledge.
If the answer is not clearly supported by the provided content, say exactly:
"I could not find a clear answer in the AMU catalog excerpts provided."
When possible, mention which catalog/source the answer came from (using the source labels shown in the excerpts).`;

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
});

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: ${a.length} vs ${b.length}`,
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

function buildContextBlock(
  items: { chunk: KnowledgeChunk; score: number }[],
): string {
  return items
    .map(({ chunk }) => {
      return `[Source: ${chunk.source} | Chunk: ${chunk.chunkIndex}]\n${chunk.content}`;
    })
    .join('\n\n');
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env');
    process.exit(1);
  }

  const chunksPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'knowledge',
    'build',
    'knowledge_chunks.json',
  );

  const raw = await fs.readFile(chunksPath, 'utf-8');
  const chunks = JSON.parse(raw) as KnowledgeChunk[];

  if (!Array.isArray(chunks) || chunks.length === 0) {
    console.error('knowledge_chunks.json is empty or invalid');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const embedRes = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: TEST_QUESTION,
  });
  const questionEmbedding = embedRes.data[0]?.embedding;
  if (!questionEmbedding) {
    console.error('No embedding in OpenAI response');
    process.exit(1);
  }

  const scored = chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(questionEmbedding, chunk.embedding),
  }));

  scored.sort((x, y) => y.score - x.score);
  const top = scored.slice(0, TOP_K);

  const contextBlock = buildContextBlock(top);

  const userMessage = `Use ONLY the following AMU catalog excerpts to answer the question.

${contextBlock}

Question:
${TEST_QUESTION}`;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.2,
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() ?? '(no response)';

  console.log('Question:');
  console.log(TEST_QUESTION);
  console.log('');
  console.log('Retrieved Chunks:');
  top.forEach((item, i) => {
    const { chunk, score } = item;
    console.log(
      `${i + 1}. ${chunk.source} | chunk ${chunk.chunkIndex} | score ${score.toFixed(2)}`,
    );
  });
  console.log('');
  console.log('Answer:');
  console.log(answer);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

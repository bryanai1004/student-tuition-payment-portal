import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import {
  CHAT_MODEL,
  assertChatModelForCompletions,
  client,
  createOpenAiEmbeddingVectors,
} from "../src/config/openai.js";
import {
  buildRetrievalQueryVariants,
  detectCatalogProgramHint,
  rankCatalogChunksByEmbeddingMaxWithHint,
  selectCatalogChunksForContext,
} from "../src/lib/catalogRetrieval.js";
import {
  cosineSimilarity,
  loadKnowledgeChunks,
  type KnowledgeChunkRow,
} from "../src/lib/ragKnowledge.js";

const TEST_QUESTION = "What is the tuition refund policy?";

const SYSTEM_PROMPT = `You are an assistant for Alhambra Medical University (AMU).
Answer ONLY using the provided retrieved catalog content.
Do NOT use outside knowledge.
If the answer is not clearly supported by the provided content, say plainly that the retrieved catalog excerpts do not spell out that rule.
When possible, cite the catalog naturally (for example "Based on the MAHM 2025–26 catalog...").`;

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"),
});

function buildContextBlock(
  items: { chunk: KnowledgeChunkRow; score: number }[],
): string {
  return items
    .map(({ chunk, score }) => {
      const meta = [
        chunk.program && `Program: ${chunk.program}`,
        chunk.sectionTitle && `Section: ${chunk.sectionTitle}`,
        `Source: ${chunk.source}`,
        `score ${score.toFixed(3)}`,
      ]
        .filter(Boolean)
        .join(" | ");
      return `[${meta}]\n${chunk.content}`;
    })
    .join("\n\n");
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY in .env");
    process.exit(1);
  }

  const chunks = await loadKnowledgeChunks();

  const { variants } = buildRetrievalQueryVariants({
    originalQuestion: TEST_QUESTION,
    rewrittenRetrievalQuery: TEST_QUESTION,
  });

  const queryEmbeddings = await createOpenAiEmbeddingVectors(variants);
  const programHint = detectCatalogProgramHint(TEST_QUESTION);
  const ranked = rankCatalogChunksByEmbeddingMaxWithHint(
    chunks,
    queryEmbeddings,
    programHint,
    cosineSimilarity,
  );
  const { selected: top } = selectCatalogChunksForContext(ranked);

  const contextBlock = buildContextBlock(top);

  const userMessage = `Use ONLY the following AMU catalog excerpts to answer the question.

${contextBlock}

Question:
${TEST_QUESTION}`;

  assertChatModelForCompletions(CHAT_MODEL);
  const completion = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.2,
  });

  const answer =
    completion.choices[0]?.message?.content?.trim() ?? "(no response)";

  console.log("Question:");
  console.log(TEST_QUESTION);
  console.log("");
  console.log("Retrieved Chunks:");
  top.forEach((item, i) => {
    const { chunk, score } = item;
    console.log(
      `${i + 1}. ${chunk.source} | ${chunk.program ?? "?"} | chunk ${chunk.chunkIndex} | score ${score.toFixed(3)}`,
    );
  });
  console.log("");
  console.log("Answer:");
  console.log(answer);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

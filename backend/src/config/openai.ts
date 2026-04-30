import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

/** Returns a shared client; throws if OPENAI_API_KEY is unset (call only when OpenAI is required). */
export function requireOpenAiClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set; this operation requires OpenAI.",
    );
  }
  cachedClient ??= new OpenAI({ apiKey: key });
  return cachedClient;
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";

function assertDisjointModels(): void {
  if (CHAT_MODEL === EMBEDDING_MODEL) {
    throw new Error(
      "OPENAI_MODEL and OPENAI_EMBEDDING_MODEL must differ; both cannot use the same model id.",
    );
  }
}

/** Ensures chat completions / responses never use an embedding-series model id. */
export function assertChatModelForCompletions(model: string): void {
  if (model !== CHAT_MODEL) {
    throw new Error(
      `Chat completion requested with unexpected model "${model}" (expected ${CHAT_MODEL}).`,
    );
  }
  const m = model.toLowerCase();
  if (m.includes("embedding")) {
    throw new Error("Refusing to run chat completion with an embedding model.");
  }
}

/** Ensures embedding API calls never use the chat model id. */
export function assertEmbeddingModelForVectors(model: string): void {
  if (model !== EMBEDDING_MODEL) {
    throw new Error(
      `Embedding requested with unexpected model "${model}" (expected ${EMBEDDING_MODEL}).`,
    );
  }
  if (!model.toLowerCase().includes("embedding")) {
    throw new Error(
      `Refusing to run embeddings API with non-embedding model "${model}".`,
    );
  }
}

assertDisjointModels();

if (CHAT_MODEL.toLowerCase().includes("embedding")) {
  throw new Error("Chat model misconfigured");
}

if (!EMBEDDING_MODEL.toLowerCase().includes("embedding")) {
  throw new Error("Embedding model misconfigured");
}

if (isOpenAiConfigured()) {
  console.log("[OPENAI CONFIG] (startup)");
  console.log("active chat model:", CHAT_MODEL);
  console.log("active embedding model:", EMBEDDING_MODEL);
} else {
  console.log(
    "[OPENAI CONFIG] OPENAI_API_KEY not set — student AI / RAG routes need a key; API otherwise runs.",
  );
}

export function logOpenAiModelConfiguration(): void {
  if (!isOpenAiConfigured()) {
    console.log(
      "[OPENAI CONFIG] disabled (no OPENAI_API_KEY); chat/embeddings unavailable.",
    );
    return;
  }
  console.log("[OPENAI CONFIG]");
  console.log("active chat model:", CHAT_MODEL);
  console.log("active embedding model:", EMBEDDING_MODEL);
}

/**
 * Embeddings only — always uses {@link EMBEDDING_MODEL}; callers must not pass a model id.
 */
export async function createOpenAiEmbeddingVectors(
  inputs: string[],
): Promise<number[][]> {
  assertEmbeddingModelForVectors(EMBEDDING_MODEL);
  if (inputs.length === 0) return [];
  const res = await requireOpenAiClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });
  const sorted = [...res.data].sort((a, b) => a.index - b.index);
  return sorted.map((row) => {
    if (!row.embedding?.length) {
      throw new Error("Missing embedding in OpenAI response");
    }
    return row.embedding;
  });
}

export async function verifyOpenAiResponsesApi(): Promise<void> {
  if (!isOpenAiConfigured()) {
    console.warn(
      "[openai] OPENAI_API_KEY not set; skipping Responses API verification.",
    );
    return;
  }
  assertChatModelForCompletions(CHAT_MODEL);
  await requireOpenAiClient().responses.create({
    model: CHAT_MODEL,
    input: "ping",
  });

  console.log("[OPENAI RESPONSE RECEIVED]");
}

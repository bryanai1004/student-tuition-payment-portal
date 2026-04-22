import OpenAI from "openai";

const DEFAULT_OPENAI_MODEL = "gpt-5-thinking";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

function getTrimmedEnv(name: string): string | null {
  const value = process.env[name];
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Source-of-truth model for text generation calls.
 */
export function getOpenAiModel(): string {
  return getTrimmedEnv("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL;
}

/**
 * Embedding model defaults to OPENAI_MODEL, with an explicit embedding fallback.
 */
export function getOpenAiEmbeddingModel(): string {
  return (
    getTrimmedEnv("OPENAI_EMBEDDING_MODEL") ??
    getTrimmedEnv("OPENAI_MODEL") ??
    DEFAULT_OPENAI_EMBEDDING_MODEL
  );
}

export function logOpenAiModelConfiguration(): void {
  console.log(`[openai] model: ${getOpenAiModel()}`);
}

export async function verifyOpenAiResponsesApi(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[openai] verification skipped: missing OPENAI_API_KEY");
    return;
  }

  const MODEL = process.env.OPENAI_MODEL || "gpt-5-thinking";
  console.log("[OPENAI MODEL USED]:", MODEL);

  const client = new OpenAI({ apiKey });
  await client.responses.create({
    model: MODEL,
    input: "ping",
  });

  console.log("[OPENAI RESPONSE RECEIVED]");
}

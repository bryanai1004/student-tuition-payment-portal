import OpenAI from "openai";

export const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

if (CHAT_MODEL.includes("embedding")) {
  throw new Error("Chat model misconfigured");
}

if (!EMBEDDING_MODEL.includes("embedding")) {
  throw new Error("Embedding model misconfigured");
}

console.log("[OPENAI CONFIG]");
console.log("chat model:", CHAT_MODEL);
console.log("embedding model:", EMBEDDING_MODEL);

export function logOpenAiModelConfiguration(): void {
  console.log("[OPENAI CONFIG]");
  console.log("chat model:", CHAT_MODEL);
  console.log("embedding model:", EMBEDDING_MODEL);
}

export async function verifyOpenAiResponsesApi(): Promise<void> {
  await client.responses.create({
    model: CHAT_MODEL,
    input: "ping",
  });

  console.log("[OPENAI RESPONSE RECEIVED]");
}

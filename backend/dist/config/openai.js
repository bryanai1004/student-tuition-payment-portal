import OpenAI from "openai";
export const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
export const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
function assertDisjointModels() {
    if (CHAT_MODEL === EMBEDDING_MODEL) {
        throw new Error("OPENAI_MODEL and OPENAI_EMBEDDING_MODEL must differ; both cannot use the same model id.");
    }
}
/** Ensures chat completions / responses never use an embedding-series model id. */
export function assertChatModelForCompletions(model) {
    if (model !== CHAT_MODEL) {
        throw new Error(`Chat completion requested with unexpected model "${model}" (expected ${CHAT_MODEL}).`);
    }
    const m = model.toLowerCase();
    if (m.includes("embedding")) {
        throw new Error("Refusing to run chat completion with an embedding model.");
    }
}
/** Ensures embedding API calls never use the chat model id. */
export function assertEmbeddingModelForVectors(model) {
    if (model !== EMBEDDING_MODEL) {
        throw new Error(`Embedding requested with unexpected model "${model}" (expected ${EMBEDDING_MODEL}).`);
    }
    if (!model.toLowerCase().includes("embedding")) {
        throw new Error(`Refusing to run embeddings API with non-embedding model "${model}".`);
    }
}
assertDisjointModels();
if (CHAT_MODEL.toLowerCase().includes("embedding")) {
    throw new Error("Chat model misconfigured");
}
if (!EMBEDDING_MODEL.toLowerCase().includes("embedding")) {
    throw new Error("Embedding model misconfigured");
}
console.log("[OPENAI CONFIG] (startup)");
console.log("active chat model:", CHAT_MODEL);
console.log("active embedding model:", EMBEDDING_MODEL);
export function logOpenAiModelConfiguration() {
    console.log("[OPENAI CONFIG]");
    console.log("active chat model:", CHAT_MODEL);
    console.log("active embedding model:", EMBEDDING_MODEL);
}
/**
 * Embeddings only — always uses {@link EMBEDDING_MODEL}; callers must not pass a model id.
 */
export async function createOpenAiEmbeddingVectors(inputs) {
    assertEmbeddingModelForVectors(EMBEDDING_MODEL);
    if (inputs.length === 0)
        return [];
    const res = await client.embeddings.create({
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
export async function verifyOpenAiResponsesApi() {
    assertChatModelForCompletions(CHAT_MODEL);
    await client.responses.create({
        model: CHAT_MODEL,
        input: "ping",
    });
    console.log("[OPENAI RESPONSE RECEIVED]");
}
//# sourceMappingURL=openai.js.map
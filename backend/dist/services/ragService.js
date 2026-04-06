import OpenAI from "openai";
import { cosineSimilarity, loadKnowledgeChunks, } from "../lib/ragKnowledge.js";
const TOP_K = 5;
const MAX_QUESTION_CHARS = 2000;
const SYSTEM_PROMPT = `You are an assistant for Alhambra Medical University (AMU).
Answer ONLY using the retrieved AMU catalog excerpts provided.
Do NOT use outside knowledge.
If the answer is not clearly supported by the provided excerpts, say:
"I could not find a clear answer in the AMU catalog excerpts provided."
When possible, mention which catalog/source the answer came from (using the source labels shown in the excerpts).`;
export class RagQuestionValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "RagQuestionValidationError";
    }
}
let cachedChunks = null;
async function getKnowledgeChunks() {
    if (cachedChunks !== null)
        return cachedChunks;
    cachedChunks = await loadKnowledgeChunks();
    return cachedChunks;
}
function validateQuestion(raw) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        throw new RagQuestionValidationError("question must not be empty");
    }
    if (trimmed.length > MAX_QUESTION_CHARS) {
        throw new RagQuestionValidationError(`question must be at most ${MAX_QUESTION_CHARS} characters`);
    }
    return trimmed;
}
function buildContextBlock(items) {
    return items
        .map(({ chunk }) => {
        return `[Source: ${chunk.source} | Chunk: ${chunk.chunkIndex}]\n${chunk.content}`;
    })
        .join("\n\n");
}
function toRetrieved(chunk, score) {
    return {
        id: chunk.id,
        source: chunk.source,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        score,
    };
}
/**
 * End-to-end AMU catalog RAG: embed question, retrieve top chunks, grounded chat completion.
 */
export async function answerAmuQuestion(question) {
    const q = validateQuestion(question);
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY");
    }
    const chunks = await getKnowledgeChunks();
    const client = new OpenAI({ apiKey });
    const embedRes = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: q,
    });
    const questionEmbedding = embedRes.data[0]?.embedding;
    if (!questionEmbedding) {
        throw new Error("No embedding in OpenAI response");
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
${q}`;
    const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
        ],
        temperature: 0.2,
    });
    const answer = completion.choices[0]?.message?.content?.trim() ?? "(no response)";
    return {
        question: q,
        answer,
        sources: top.map(({ chunk, score }) => toRetrieved(chunk, score)),
    };
}
//# sourceMappingURL=ragService.js.map
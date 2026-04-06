import OpenAI from "openai";
import { cosineSimilarity, loadKnowledgeChunks, } from "../lib/ragKnowledge.js";
const TOP_K = 5;
const MAX_QUESTION_CHARS = 2000;
const STRICT_SYSTEM_PROMPT_BASE = `You are an assistant for Alhambra Medical University (AMU).
Answer ONLY using the retrieved AMU catalog excerpts provided.
Do NOT use outside knowledge.
If the answer is not clearly supported by the provided excerpts, say:
"I could not find a clear answer in the AMU catalog excerpts provided."
When possible, mention which catalog/source the answer came from (using the source labels shown in the excerpts).`;
const GUIDANCE_SYSTEM_PROMPT_BASE = `You are assisting with AMU catalog-based academic guidance.
Use ONLY the retrieved catalog excerpts as evidence.
You may provide cautious, general planning guidance when the excerpts support it (e.g. prerequisites, program structure, sequencing themes).
Do NOT invent official semester-by-semester schedules, deadlines, or requirements unless they are explicitly stated in the excerpts.
Clearly separate what the excerpts state as facts from general suggestions when the excerpts are incomplete for the student's situation.
When stating facts, tie them to the source labels in the excerpts.
If the question asks for planning or sequencing advice, give a conservative summary and include a brief reminder that the student should confirm final course selection with the AMU registrar or their academic advisor.`;
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
/** Heuristic: treat as Chinese when CJK clearly dominates the visible text. */
function isMostlyChinese(text) {
    const han = text.match(/[\u4E00-\u9FFF]/g);
    const hanCount = han?.length ?? 0;
    if (hanCount === 0)
        return false;
    const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;
    return hanCount > latinCount || (latinCount === 0 && hanCount >= 2);
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
/** True when the question looks like a definitional/policy lookup (should stay strict, not guidance). */
function isDefinitionalPolicyQuestion(lower) {
    const definitional = /\b(what\s+is|what\s+are|what\s+was|what\s+were|when\s+is|when\s+are|when\s+do|where\s+is|where\s+are|how\s+much|how\s+many|how\s+long|is\s+there|are\s+there|define|list\s+the|describe\s+the|explain\s+the)\b/i.test(lower);
    const policyNouns = /\b(policy|policies|requirement|requirements|deadline|deadlines|fee|fees|tuition|refund|attendance|add\/drop|add\s+and\s+drop|withdrawal|transcript|enrollment|registration|catalog|probation|satisfactory\s+academic)\b/i.test(lower);
    return definitional && policyNouns;
}
/** Substantive catalog/policy content — blocks treating the message as a pure direct turn. */
function hasSubstantiveCatalogCue(trimmed, lower) {
    if (/refund|tuition|late\s+payment|payment\s+plan|graduation\s+requirement|degree\s+requirement|attendance|add\/drop|add\s+and\s+drop|withdrawal|transcript|enrollment|registration|academic\s+integrity|probation|credit\s+hour|semester\s+hour|gpa|syllabus|prerequisite|corequisite/i.test(lower)) {
        return true;
    }
    return /退费|学费|退款|滞纳|出勤|旷课|毕业要求|学位|加退选|退选|成绩单|学分|注册|截止日期|校历|政策|纪律|必修|选修|先修/.test(trimmed);
}
function isGuidanceQuestion(trimmed, lower) {
    if (isDefinitionalPolicyQuestion(lower))
        return false;
    const guidanceEn = /\b(how\s+should\s+i\s+plan|how\s+do\s+i\s+arrange|what\s+should\s+i\s+take\s+first|first\s+semester|course\s+planning|curriculum\s+planning|how\s+should\s+i\s+schedule\s+my\s+classes)\b/i.test(lower) ||
        /\b(plan|planning|arrange|schedul(e|ing)|pick\s+(my\s+)?courses|choose\s+(my\s+)?courses|what\s+should\s+i\s+take|which\s+(class|classes|course|courses)\b|second\s+semester|order\s+of\s+courses|course\s+sequence|recommended\s+sequence|curriculum|pathway|roadmap|how\s+to\s+plan|help\s+me\s+plan)\b/i.test(lower);
    const guidanceZh = /我应该怎么安排|怎么安排选课|第一学期怎么选课|我是.{0,30}第[一二三四五六七八九十\d]+学期|先修什么|怎么规划课程|如何安排课程/.test(trimmed) ||
        /选课|安排.{0,6}课|怎么.{0,6}选|如何.{0,8}规划|第[一二三四五六七八九十\d]+学期|该选|先修|课程.{0,6}顺序|建议.{0,6}课|课程.{0,6}规划|学期.{0,8}怎么|规划.{0,6}选课/.test(trimmed);
    return guidanceEn || guidanceZh;
}
function classifyDirectKind(trimmed, lower) {
    const haystack = trimmed + lower;
    if (/(speak|说|会).{0,12}(中文|汉语|chinese|mandarin)|可以说中文|中文可以吗|用中文回答|用中文|多语言|什么语言|\bdo\s+you\s+speak\b|\bcan\s+you\s+speak\b|\bin\s+which\s+languages?\b/i.test(haystack)) {
        return "language";
    }
    if (/^(hi|hello|hey|yo|hiya|sup|good\s+(morning|afternoon|evening)|greetings|howdy)[\s!,?.]*$/i.test(trimmed) ||
        /^(你好|您好|嗨|在吗|早上好|下午好|晚上好)[\s!！?？，,。.]*$/u.test(trimmed)) {
        return "greeting";
    }
    if (/^(thanks|thank\s+you|thx|ty|3q)[\s!.]*$/i.test(lower)) {
        return "thanks";
    }
    if (/what\s+can\s+you\s+do|who\s+are\s+you|what\s+are\s+you|你是(什么|谁)|你能(做|干)什么|你(能|会)帮我|你会做什么|你能帮我做什么/i.test(haystack)) {
        return "capability";
    }
    return "capability";
}
function isDirectIntent(trimmed, lower) {
    if (hasSubstantiveCatalogCue(trimmed, lower))
        return false;
    const greetingOnly = /^(hi|hello|hey|yo|hiya|sup|good\s+(morning|afternoon|evening)|greetings|howdy)[\s!,?.]*$/i.test(trimmed) ||
        /^(你好|您好|嗨|在吗|早上好|下午好|晚上好)[\s!！?？，,。.]*$/u.test(trimmed);
    const thanksOnly = /^(thanks|thank\s+you|thx|ty|3q)[\s!.]*$/i.test(lower);
    const languageMeta = /(speak|说|会).{0,12}(中文|汉语|chinese|mandarin)|可以说中文|中文可以吗|用中文|多语言|什么语言/i.test(trimmed + lower) ||
        /\bdo\s+you\s+speak\b|\bcan\s+you\s+speak\b|\bin\s+which\s+languages?\b/i.test(lower);
    const capabilityMeta = /what\s+can\s+you\s+do|who\s+are\s+you|what\s+are\s+you|你是(什么|谁)|你能(做|干)什么|你(能|会)帮我|你会做什么|你能帮我做什么/i.test(trimmed + lower);
    if (greetingOnly || thanksOnly)
        return trimmed.length <= 48;
    if (languageMeta)
        return trimmed.length < 140;
    if (capabilityMeta)
        return trimmed.length < 220;
    return false;
}
function buildDirectReply(question) {
    const trimmed = question.trim();
    const lower = trimmed.toLowerCase();
    const zh = isMostlyChinese(trimmed);
    const kind = classifyDirectKind(trimmed, lower);
    if (zh) {
        switch (kind) {
            case "language":
                return "可以，我可以用中文回答 AMU catalog 相关问题，例如学费、退费政策、毕业要求、出勤规定、add/drop 时间、课程结构等。";
            case "greeting":
                return "你好！我可以帮助你回答 AMU catalog 相关问题，例如学费、退费政策、毕业要求、出勤规定、课程安排和学术政策。";
            case "thanks":
                return "不客气！有需要时可以继续问我 AMU 课程目录相关问题。";
            default:
                return "我可以根据 AMU catalog 回答与学费、退费政策、毕业要求、出勤规定、课程结构和学术流程相关的问题。";
        }
    }
    switch (kind) {
        case "language":
            return "Yes — I can answer AMU catalog questions in Chinese or English.";
        case "greeting":
            return "Hi! I can help answer AMU catalog questions such as tuition, refund policy, graduation requirements, attendance rules, course structure, and academic procedures.";
        case "thanks":
            return "You're welcome! Ask any time if you have AMU catalog questions.";
        default:
            return "I can help answer AMU catalog questions related to tuition, refund policy, graduation requirements, attendance rules, curriculum structure, and academic procedures.";
    }
}
function detectIntent(question) {
    const trimmed = question.trim();
    const lower = trimmed.toLowerCase();
    if (isDirectIntent(trimmed, lower))
        return "direct";
    if (isGuidanceQuestion(trimmed, lower))
        return "guidance";
    return "strict";
}
function languageInstructionForLlm(question) {
    return isMostlyChinese(question)
        ? "Respond in Simplified Chinese (简体中文)."
        : "Respond in English.";
}
/**
 * End-to-end AMU catalog RAG: intent routing, optional retrieval, grounded chat completion.
 */
export async function answerAmuQuestion(question) {
    const q = validateQuestion(question);
    const intent = detectIntent(q);
    if (intent === "direct") {
        return {
            question: q,
            answer: buildDirectReply(q),
            sources: [],
        };
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY");
    }
    const client = new OpenAI({ apiKey });
    const chunks = await getKnowledgeChunks();
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
    const langLine = languageInstructionForLlm(q);
    const systemPrompt = intent === "guidance"
        ? `${GUIDANCE_SYSTEM_PROMPT_BASE}\n\n${langLine}`
        : `${STRICT_SYSTEM_PROMPT_BASE}\n\n${langLine}`;
    const userPreamble = intent === "guidance"
        ? `Use the following AMU catalog excerpts as the basis for cautious, helpful guidance. Synthesize what they support; note gaps where the user's situation is not fully covered.

${contextBlock}

Question:
${q}`
        : `Use ONLY the following AMU catalog excerpts to answer the question.

${contextBlock}

Question:
${q}`;
    const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPreamble },
        ],
        temperature: intent === "guidance" ? 0.35 : 0.2,
    });
    const answer = completion.choices[0]?.message?.content?.trim() ?? "(no response)";
    return {
        question: q,
        answer,
        sources: top.map(({ chunk, score }) => toRetrieved(chunk, score)),
    };
}
//# sourceMappingURL=ragService.js.map
import OpenAI from "openai";
import { cosineSimilarity, loadKnowledgeChunks, } from "../lib/ragKnowledge.js";
const TOP_K = 5;
const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_CONTENT_CHARS = 500;
const MAX_REWRITE_OUTPUT_CHARS = 320;
const STRICT_SYSTEM_PROMPT_BASE = `You are an assistant for Alhambra Medical University (AMU).
Answer ONLY using the retrieved AMU catalog excerpts provided.
Do NOT use outside knowledge or guess beyond the excerpts.
If the answer is not clearly supported by the provided excerpts, say:
"I could not find a clear answer in the AMU catalog excerpts provided."
When possible, mention which catalog/source the answer came from (using the source labels shown in the excerpts).`;
const GUIDANCE_ACADEMIC_SYSTEM_PROMPT_BASE = `You are assisting with AMU catalog-based academic guidance.
Use ONLY the retrieved catalog excerpts as evidence.
You may provide cautious, general planning guidance when the excerpts support it (e.g. prerequisites, program structure, sequencing themes).
Do NOT invent official semester-by-semester schedules, deadlines, or requirements unless they are explicitly stated in the excerpts.
Clearly separate what the excerpts state as facts from general suggestions when the excerpts are incomplete for the student's situation.
When stating facts, tie them to the source labels in the excerpts.
If the question asks for planning or sequencing advice, give a conservative summary and include a brief reminder that the student should confirm final course selection with the AMU registrar or their academic advisor.
If the excerpts do not clearly support a direct answer, do NOT end with only a short refusal like "I could not find a clear answer." Instead give an honest, helpful bounded reply: say the excerpts do not state enough explicitly, briefly list related catalog topics you can still discuss if they appear in the excerpts (e.g. tuition payment rules, installments, refunds, program structure), and remind the student to confirm with the AMU registrar or advisor. Stay grounded—do not invent financial aid or policies not in the excerpts.`;
const GUIDANCE_SUPPORT_SYSTEM_PROMPT_BASE = `You are helping with AMU catalog-based support and admissions-style guidance.
Use only the retrieved AMU catalog excerpts as evidence.
You may give cautious, general guidance when the excerpts support it (e.g. tuition and fees, payment-related catalog language, references to financial aid or FAFSA if present, admissions or applicant requirements stated in the catalog).
Do not invent admissions guarantees, financial aid guarantees, specific payment plans, or eligibility decisions unless clearly supported by the excerpts.
If the catalog excerpts are insufficient, explain what is known from them, what is not clearly stated, and what the student should confirm with AMU admissions, registrar, or financial aid office.
If the user writes in Chinese, answer in Chinese. If the user writes in English, answer in English.`;
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
/**
 * Normalize optional client-supplied history: drop invalid entries, trim, cap length and count.
 */
export function sanitizeChatHistory(raw) {
    if (raw === undefined || raw === null)
        return undefined;
    if (!Array.isArray(raw))
        return undefined;
    const out = [];
    for (const item of raw) {
        if (item == null || typeof item !== "object")
            continue;
        const rec = item;
        const role = rec.role;
        const content = rec.content;
        if (role !== "user" && role !== "assistant")
            continue;
        if (typeof content !== "string")
            continue;
        const trimmed = content.trim();
        if (trimmed.length === 0)
            continue;
        const capped = trimmed.length > MAX_HISTORY_CONTENT_CHARS
            ? trimmed.slice(0, MAX_HISTORY_CONTENT_CHARS)
            : trimmed;
        out.push({ role, content: capped });
    }
    if (out.length === 0)
        return undefined;
    return out.length > MAX_HISTORY_MESSAGES
        ? out.slice(-MAX_HISTORY_MESSAGES)
        : out;
}
function formatRecentConversationBlock(history) {
    const lines = history.map((h) => {
        const who = h.role === "user" ? "User" : "Assistant";
        return `- ${who}: ${h.content}`;
    });
    return `Recent conversation context (for resolving follow-ups only; not a factual source):\n${lines.join("\n")}`;
}
/** True when the latest question looks like a follow-up or vague reference (with history present). */
function followUpOrVagueCue(trimmed, lower) {
    if (/\b(that|this|those|these|it|them)\b/i.test(lower))
        return true;
    if (/what\s+about|how\s+about|how\s+should\s+i\s+do|how\s+do\s+i\s+do\s+that/i.test(lower)) {
        return true;
    }
    if (/那|这|它|怎么办|那我|学费呢|第一学期呢|如果我家|怎么支付|如何支付|该怎么做|那如果/.test(trimmed)) {
        return true;
    }
    return false;
}
function shouldRewriteForRetrieval(question, history, intent, guidanceSubtype) {
    if (intent === "guidance" && guidanceSubtype === "support") {
        return true;
    }
    if (history.length === 0)
        return false;
    const trimmed = question.trim();
    const lower = trimmed.toLowerCase();
    if (isDefinitionalPolicyQuestion(lower))
        return false;
    if (trimmed.length >= 140 && !followUpOrVagueCue(trimmed, lower))
        return false;
    if (trimmed.length <= 48)
        return true;
    if (followUpOrVagueCue(trimmed, lower))
        return true;
    if (trimmed.length < 75 && /[?？]/.test(trimmed))
        return true;
    if (/穷|困难|付.{0,6}费|支付|学费|tuition|payment|afford|installment|分期|退款|退费|滞纳/i.test(trimmed + lower)) {
        return true;
    }
    return false;
}
const REWRITE_SYSTEM_ACADEMIC_STRICT = `You rewrite the user's latest message into ONE concise standalone search query for a university catalog (AMU).
Use the recent conversation only to resolve pronouns and implicit topics.
Output ONLY the query text, no quotes or labels, no explanation.
Do not invent facts, policies, dates, or program details not implied by the conversation.
Maximum ${MAX_REWRITE_OUTPUT_CHARS} characters.`;
const REWRITE_SYSTEM_SUPPORT = `You rewrite the user's latest message into ONE short standalone English search query for an AMU university catalog knowledge base.
Aim at catalog topics that are likely retrievable: tuition and fees, payment methods and deadlines, refunds, FAFSA or financial aid if referenced in catalog text, admissions requirements, applicant prerequisites, prior degree or educational background expectations, eligibility-related catalog language.
Do NOT answer the user's question. Do NOT invent facts, dollar amounts, guarantees, or policies not implied by the message.
Output ONLY the query text, no quotes or labels, no explanation. Use English keywords even if the user wrote in another language.
Maximum ${MAX_REWRITE_OUTPUT_CHARS} characters.`;
async function rewriteQuestionForRetrieval(client, question, history, intent, guidanceSubtype) {
    const h = history ?? [];
    if (!shouldRewriteForRetrieval(question, h, intent, guidanceSubtype)) {
        return question;
    }
    const histText = h.length > 0
        ? h
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n")
        : "(none)";
    const rewriteSystem = intent === "guidance" && guidanceSubtype === "support"
        ? REWRITE_SYSTEM_SUPPORT
        : REWRITE_SYSTEM_ACADEMIC_STRICT;
    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: rewriteSystem,
                },
                {
                    role: "user",
                    content: `Recent conversation:\n${histText}\n\nCurrent user message:\n${question}\n\nRetrieval query:`,
                },
            ],
            temperature: 0.2,
            max_tokens: 200,
        });
        const raw = completion.choices[0]?.message?.content?.trim() ?? "";
        const oneLine = raw.replace(/\s+/g, " ").trim();
        if (oneLine.length === 0)
            return question;
        return oneLine.length > MAX_REWRITE_OUTPUT_CHARS
            ? oneLine.slice(0, MAX_REWRITE_OUTPUT_CHARS)
            : oneLine;
    }
    catch {
        return question;
    }
}
const GUIDANCE_FALLBACK_EN = "I couldn't find a clear, direct answer in the AMU catalog excerpts I have right now. Based on the available catalog material, I can still help explain related topics such as tuition payment rules, refund policy, graduation requirements, course planning, or registration procedures. For final academic or payment decisions, you should confirm with AMU registrar/advisor.";
const GUIDANCE_FALLBACK_ZH = "我目前无法在现有 AMU 目录摘录中找到明确、直接的答案。根据现有目录内容，我仍可以继续帮助你解释相关主题，例如学费支付规则、退费政策、毕业要求、课程规划或注册流程；但涉及最终的选课、缴费或学术决定时，仍建议你向 AMU registrar/advisor 确认。";
const GUIDANCE_SUPPORT_FALLBACK_EN = "I could not directly confirm this from the AMU catalog excerpts I have right now. Based on the available catalog material, I can still help with related topics such as tuition and fees, FAFSA / financial aid references, admissions requirements, and general academic planning. For a final decision about eligibility, payment arrangements, or financial support, you should confirm with AMU admissions / registrar / financial aid office.";
const GUIDANCE_SUPPORT_FALLBACK_ZH = "我目前无法仅根据现有 AMU 目录摘录直接确认这一点。不过根据现有目录内容，我仍可以帮助你查看相关主题，例如学费与费用、FAFSA / 财务援助、入学要求以及一般性的课程规划。若涉及最终的申请资格、缴费安排或财务援助，仍建议你向 AMU admissions / registrar / financial aid office 确认。";
function looksLikeStrictCatalogRefusal(answer) {
    if (/could not find a clear answer in the amu catalog excerpts/i.test(answer)) {
        return true;
    }
    if (/无法在[^。]*目录摘录[^。]*找到[^。]*答案/.test(answer))
        return true;
    if (/未在[^。]*提供的[^。]*摘录[^。]*找到/.test(answer))
        return true;
    return false;
}
function applyGuidanceFallbackIfNeeded(answer, question, subtype) {
    if (!looksLikeStrictCatalogRefusal(answer))
        return answer;
    if (subtype === "support") {
        return isMostlyChinese(question)
            ? GUIDANCE_SUPPORT_FALLBACK_ZH
            : GUIDANCE_SUPPORT_FALLBACK_EN;
    }
    return isMostlyChinese(question) ? GUIDANCE_FALLBACK_ZH : GUIDANCE_FALLBACK_EN;
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
/** Affordability, payment stress, admissions fit, eligibility — school-related support guidance. */
function isSupportGuidanceCue(trimmed, lower) {
    const guidanceSupportZh = /怎么支付|如何支付|怎么付学费|如何付学费|付学费|交学费|家里穷|家里.{0,6}困难|经济困难|付不起学费|分期.{0,4}付|读得起|负担.{0,8}学费|学费.{0,12}怎么办|能读.{0,8}AMU|可以读.{0,16}AMU|AMU.{0,14}(能读|能上)|本科.{0,28}专业.{0,16}(可以|能|能否)|可不可以读|能否申请|申请.{0,12}资格|有没有资格|是否符合|录取.{0,12}要求|背景.{0,12}(可以|能|符合)|背景.{0,16}(不同|不一样)|非传统|跨专业.{0,12}(申请|读)/.test(trimmed);
    const guidanceSupportEn = /\bhow\s+(do|can)\s+i\s+pay\b|\bcan'?t\s+afford\b|\bafford\s+to\s+(pay|study)\b|\bfinancial\s+difficult/i.test(lower) ||
        /\bhelp\s+(paying|with\s+tuition|with\s+paying)\b|\bneed\s+(some\s+)?help\s+(paying|with)\b/i.test(lower) ||
        (/\bwhat\s+if\s+i\s+(have|need)\b/i.test(lower) &&
            /\b(financial|money|pay|tuition|afford)/i.test(lower)) ||
        (/\b(am\s+i\s+eligible|eligible\s+to\s+apply|eligible\s+for)\b/i.test(lower) &&
            /\b(amu|alhambra|program|admission)/i.test(lower)) ||
        (/\bcan\s+i\s+(still\s+)?(study|apply|enroll)\b/i.test(lower) &&
            /\b(amu|alhambra)\b/i.test(lower)) ||
        (/\b(my\s+)?undergraduate\s+major\b|\bmy\s+major\s+is\b|\bnon[- ]traditional\s+background\b/i.test(lower) &&
            /\b(amu|alhambra|apply|eligible|admission)/i.test(lower)) ||
        (/\bcan\s+i\s+apply\b/i.test(lower) &&
            /\b(background|major|degree|undergraduate)\b/i.test(lower));
    return guidanceSupportZh || guidanceSupportEn;
}
function detectGuidanceSubtype(question, history) {
    const trimmed = question.trim();
    const lower = trimmed.toLowerCase();
    if (isSupportGuidanceCue(trimmed, lower))
        return "support";
    const recentUser = [...(history ?? [])]
        .filter((m) => m.role === "user")
        .slice(-2);
    for (const m of recentUser) {
        const t = m.content.trim();
        const l = t.toLowerCase();
        if (isSupportGuidanceCue(t, l))
            return "support";
    }
    return "academic";
}
function isGuidanceQuestion(trimmed, lower) {
    if (isDefinitionalPolicyQuestion(lower))
        return false;
    if (isSupportGuidanceCue(trimmed, lower))
        return true;
    const guidanceEn = /\b(how\s+should\s+i\s+plan|how\s+do\s+i\s+arrange|what\s+should\s+i\s+take\s+first|first\s+semester|course\s+planning|curriculum\s+planning|how\s+should\s+i\s+schedule\s+my\s+classes)\b/i.test(lower) ||
        /\b(plan|planning|arrange|schedul(e|ing)|pick\s+(my\s+)?courses|choose\s+(my\s+)?courses|what\s+should\s+i\s+take|which\s+(class|classes|course|courses)\b|second\s+semester|order\s+of\s+courses|course\s+sequence|recommended\s+sequence|curriculum|pathway|roadmap|how\s+to\s+plan|help\s+me\s+plan)\b/i.test(lower);
    const guidanceZh = /我应该怎么安排|怎么安排选课|第一学期怎么选课|我是.{0,30}第[一二三四五六七八九十\d]+学期|先修什么|怎么规划课程|如何安排课程/.test(trimmed) ||
        /选课|安排.{0,6}课|怎么.{0,6}选|如何.{0,8}规划|第[一二三四五六七八九十\d]+学期|该选|先修|课程.{0,6}顺序|建议.{0,6}课|课程.{0,6}规划|学期.{0,8}怎么|规划.{0,6}选课/.test(trimmed);
    return guidanceEn || guidanceZh;
}
/**
 * If the question plausibly relates to catalog, policy, or school academic/financial support,
 * do not mark it out-of-scope.
 */
function isPlausiblyAmuCatalogOrSupport(trimmed, lower) {
    if (hasSubstantiveCatalogCue(trimmed, lower))
        return true;
    if (isDefinitionalPolicyQuestion(lower))
        return true;
    if (isGuidanceQuestion(trimmed, lower))
        return true;
    return false;
}
/**
 * Conservative: clearly unrelated to AMU catalog / academic support.
 * Call only when isPlausiblyAmuCatalogOrSupport is false.
 */
function isOutOfScopeQuestion(question) {
    const trimmed = question.trim();
    const lower = trimmed.toLowerCase();
    if (/\b(find a girlfriend|find a boyfriend|get a girlfriend|get a boyfriend|will i find a girlfriend|will i find a boyfriend|dating at|dating in|romantic relationship)\b/i.test(lower) ||
        /\b(will anyone like me|people like me|become popular (at|in))\b/i.test(lower) ||
        /\b(invest in amu|invest in the university|invest in alhambra|buy (a |an )?(part|stake|share|piece) of (amu|the university|alhambra medical)|business opportunity|good (business )?investment)\b/i.test(lower) ||
        /\b(who is the (richest|wealthiest)|most attractive student|hottest student|best[- ]looking student|nicest.{0,30}romantically)\b/i.test(lower) ||
        /\b(how (do i|to) (get |become )rich|get rich quick|should i break up|break up with my (boyfriend|girlfriend))\b/i.test(lower) ||
        /\bwhat should i do with my life\b/i.test(lower)) {
        return true;
    }
    if (/找到(了)?(女朋友|男朋友)|谈恋爱|找对象|脱单|谁会喜欢我|有人喜欢我|喜欢我吗/.test(trimmed) ||
        /变(得)?(受欢迎|有名)|谁最有钱|哪个.{0,8}最(漂亮|帅|美)|最有(魅力|吸引力)/.test(trimmed) ||
        /给.{0,6}AMU.{0,6}投资|投资.{0,6}AMU|买下.{0,10}(学校|大学)|入股.{0,10}(学校|大学)/.test(trimmed) ||
        /怎么变有钱|如何变有钱|发财|暴富/.test(trimmed) ||
        /我的人生.{0,8}怎么办|人生.{0,8}该怎么办|人生.{0,8}该如何/.test(trimmed) ||
        /(该|要不要|该不该).{0,6}分手|和(男|女)朋友分手/.test(trimmed)) {
        return true;
    }
    return false;
}
function buildOutOfScopeReply(question) {
    if (isMostlyChinese(question)) {
        return "我目前主要帮助回答 AMU 的课程、学费、退费政策、毕业要求、出勤规定、选课规划和注册流程等问题。这个问题不属于我能根据 AMU 目录可靠回答的范围。如果你想了解，也可以问我有关 AMU 学费、课程规划、毕业要求或注册规则等方面的问题。";
    }
    return "I'm mainly designed to help with AMU catalog and academic support questions, such as tuition, refund policy, graduation requirements, course planning, attendance rules, and registration procedures. I can't reliably answer that question based on the AMU catalog. If you want, you can ask me about AMU tuition, course planning, graduation requirements, or registration rules.";
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
    if (!isPlausiblyAmuCatalogOrSupport(trimmed, lower) &&
        isOutOfScopeQuestion(trimmed)) {
        return "out_of_scope";
    }
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
 * @param rawHistory - Optional recent turns; sanitized (capped, invalid entries dropped).
 */
export async function answerAmuQuestion(question, rawHistory) {
    const q = validateQuestion(question);
    const history = sanitizeChatHistory(rawHistory);
    const intent = detectIntent(q);
    if (intent === "direct") {
        return {
            question: q,
            answer: buildDirectReply(q),
            sources: [],
        };
    }
    if (intent === "out_of_scope") {
        return {
            question: q,
            answer: buildOutOfScopeReply(q),
            sources: [],
        };
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY");
    }
    const client = new OpenAI({ apiKey });
    const chunks = await getKnowledgeChunks();
    const guidanceSubtype = intent === "guidance" ? detectGuidanceSubtype(q, history) : undefined;
    const retrievalQuery = await rewriteQuestionForRetrieval(client, q, history, intent, guidanceSubtype);
    const embedRes = await client.embeddings.create({
        model: "text-embedding-3-small",
        input: retrievalQuery,
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
        ? guidanceSubtype === "support"
            ? `${GUIDANCE_SUPPORT_SYSTEM_PROMPT_BASE}\n\n${langLine}`
            : `${GUIDANCE_ACADEMIC_SYSTEM_PROMPT_BASE}\n\n${langLine}`
        : `${STRICT_SYSTEM_PROMPT_BASE}\n\n${langLine}`;
    const historyPrefix = intent === "guidance" && history && history.length > 0
        ? `${formatRecentConversationBlock(history)}\n\n`
        : "";
    const userPreamble = intent === "guidance"
        ? `${historyPrefix}Use the following AMU catalog excerpts as the basis for cautious, helpful guidance. Synthesize what they support; note gaps where the user's situation is not fully covered.

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
    let answer = completion.choices[0]?.message?.content?.trim() ?? "(no response)";
    if (intent === "guidance" && guidanceSubtype !== undefined) {
        answer = applyGuidanceFallbackIfNeeded(answer, q, guidanceSubtype);
    }
    return {
        question: q,
        answer,
        sources: top.map(({ chunk, score }) => toRetrieved(chunk, score)),
    };
}
//# sourceMappingURL=ragService.js.map
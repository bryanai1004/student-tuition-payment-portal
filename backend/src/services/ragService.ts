import OpenAI from "openai";
import { AMU_SCHOOL_FACTS } from "../config/schoolFacts.js";
import {
  type KnowledgeChunkRow,
  cosineSimilarity,
  loadKnowledgeChunks,
} from "../lib/ragKnowledge.js";
import {
  classifyStudentAiIntent,
  type StudentAiIntent,
} from "./studentAiQuestionRouter.js";
import {
  formatIdentityContextBlock,
  type IdentityContext,
} from "./conversationFactsService.js";

const TOP_K = 5;
const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_USER_TURNS = 2;
const MAX_HISTORY_CONTENT_CHARS = 500;
const MAX_REWRITE_OUTPUT_CHARS = 320;
const OPENAI_MAX_ATTEMPTS = 2;

type RagIntent = "direct" | "strict" | "guidance" | "out_of_scope";

type DirectKind = "greeting" | "language" | "capability" | "thanks";

const STUDENT_GROUNDED_RULES = `Use only:
1. the verified student context provided below,
2. the retrieved AMU handbook / policy / catalog / course-material excerpts provided below.
Do not invent school policy, enrollment status, grades, prerequisites, deadlines, exceptions, completed courses, or missing student records.
Treat the student context as verified student-specific facts.
Treat the retrieved AMU document excerpts as the only allowed source for school rules, policy claims, requirements, prerequisites, deadlines, or official interpretations.
Never treat a missing course, term, grade, or enrollment in the student context as proof that it never happened unless the student context explicitly shows academic history coverage is full for the relevant period.
If the student context says academic history coverage is partial, you must not say the student definitely did not take, complete, or register for something in the past. Instead say you cannot confirm it from the available records.
When discussing policy, clearly distinguish:
- what the school documents say,
- what the student's available records show,
- what remains uncertain.
If the answer is not supported by the verified student context or the retrieved AMU document excerpts, say you do not have enough information.
Use cautious language such as "Based on the available records..." or "I only see..." when student data is incomplete.
If policy applicability is uncertain, say you cannot confirm it from the retrieved policy and available records.
Keep the answer concise, helpful, and student-facing.
When useful, organize the answer as:
- What I found in your record
- What the handbook/policy says
- What that likely means for you`;

const STRICT_SYSTEM_PROMPT_BASE = `You are AMU's academic advisor assistant.
${STUDENT_GROUNDED_RULES}
When possible, mention which AMU source label supports a policy or handbook statement.`;

const GUIDANCE_ACADEMIC_SYSTEM_PROMPT_BASE = `You are assisting with AMU student-specific academic guidance.
${STUDENT_GROUNDED_RULES}
You may provide cautious planning guidance when the verified records and retrieved AMU excerpts support it.
Do not invent semester-by-semester schedules, prerequisites, or requirements that are not supported by the provided sources.
If the question asks for planning or sequencing advice, give a conservative summary and remind the student to confirm final course selection with the AMU registrar or academic advisor when needed.`;

const GUIDANCE_SUPPORT_SYSTEM_PROMPT_BASE = `You are helping with AMU student-specific support and admissions-style guidance.
${STUDENT_GROUNDED_RULES}
You may give cautious, general guidance when the retrieved AMU excerpts support it, including tuition and fees, payment-related catalog language, admissions requirements, or financial-aid references that explicitly appear in the documents.
Do not invent admissions guarantees, payment plans, eligibility decisions, or financial aid outcomes that are not clearly supported by the provided sources.`;

/** Internal only: guidance path splits academic planning vs support/admissions-style questions. */
type GuidanceSubtype = "academic" | "support";

export type RetrievedChunk = {
  id: string;
  source: string;
  chunkIndex: number;
  content: string;
  score: number;
};

export type RagAnswerResult = {
  question: string;
  answer: string;
  sources: RetrievedChunk[];
};

export type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type ConversationDomain = "academic" | "general";

export type ShortMemoryPlan = {
  history: ChatHistoryItem[] | undefined;
  isFollowUp: boolean;
  isTopicSwitch: boolean;
  previousDomain: ConversationDomain | null;
  effectiveIntent: StudentAiIntent;
};

export type GroundedAmuPipeline = "policy" | "mixed";

export type AnswerAmuQuestionOptions = {
  studentContext?: string | null;
  pipeline?: GroundedAmuPipeline;
  identityContext?: IdentityContext | null;
};

export type AnswerGeneralQuestionOptions = {
  identityContext?: IdentityContext | null;
};

export type AnswerGraduationQuestionOptions = {
  graduationEvaluation: string;
  identityContext?: IdentityContext | null;
};

type SchoolFactKind =
  | "identity"
  | "address"
  | "location"
  | "phone"
  | "email"
  | "contact"
  | "campus"
  | "housing";

export class RagQuestionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RagQuestionValidationError";
  }
}

function isRetryableOpenAiError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const maybeError = error as {
    status?: number;
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const status = maybeError.status;
  if (status === 408 || status === 409 || status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;

  const code = `${maybeError.code ?? maybeError.cause?.code ?? ""}`.toLowerCase();
  if (
    code === "etimedout" ||
    code === "econnreset" ||
    code === "eai_again" ||
    code === "rate_limit_exceeded"
  ) {
    return true;
  }

  const message = `${maybeError.message ?? maybeError.cause?.message ?? ""}`.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("rate limit") ||
    message.includes("connection reset")
  );
}

async function withOpenAiRetry<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const canRetry =
        attempt < OPENAI_MAX_ATTEMPTS && isRetryableOpenAiError(error);
      console.warn("[rag] openai request failed", {
        label,
        attempt,
        canRetry,
        error:
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "unknown error",
      });
      if (!canRetry) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI request failed");
}

let cachedChunks: KnowledgeChunkRow[] | null = null;

const DUAL_MODE_SYSTEM_PROMPT = `You are AMU's AI assistant.

You operate under STRICT safety rules:

### CONVERSATION CONTINUITY

Treat the latest user message as part of the ongoing conversation, not as an isolated FAQ.
- Resolve pronouns and omitted references using the recent conversation whenever possible.
- Keep the current topic unless the user clearly changes topics.
- If the user asks a follow-up about previously discussed people, things, or options, continue talking about that same subject.
- Do NOT pivot to defining "AMU" or another keyword just because it appears in the latest turn unless the user explicitly asks for that definition.
- Do NOT change the user's intent during fallback, uncertainty, or clarification.

### REAL-WORLD SANITY CHECK

Before answering, check whether the scenario is logically possible in the real world.
- If the scenario is impossible or unrealistic, say that clearly.
- Example: deceased or ancient historical figures cannot teach modern AMU classes.
- When something is impossible, explain the limitation and, if helpful, redirect to a realistic modern equivalent.

### FAILURE / FALLBACK BEHAVIOR

If information is missing, ambiguous, or something seems to have gone wrong:
- stay on the same topic,
- do not switch to an unrelated explanation,
- do not redefine AMU unless that is the user's actual question,
- briefly acknowledge the issue and continue with the same intent or ask a focused clarification.

### ACADEMIC / FINANCIAL / ADMINISTRATIVE TOPICS (HIGH PRECISION MODE)

For ANY question related to:
- courses
- enrollment
- credits
- grades
- tuition / fees
- academic policies
- graduation requirements

You MUST:
- use ONLY verified student data and/or retrieved AMU documents
- NEVER guess or infer missing information
- NEVER fabricate policies, deadlines, or records
- if information is missing, say clearly:
  "I cannot confirm this from your records" or
  "I cannot find this in AMU documents"

### GENERAL / CASUAL TOPICS (FLEXIBLE MODE)

For questions NOT related to AMU academics or student records:
- you may answer normally using general knowledge
- be natural, friendly, and helpful
- DO NOT unnecessarily refuse
- DO NOT say "I cannot answer" unless unsafe

### REAL-WORLD LOCAL SEARCH

For real-world, location-based queries such as nearby places, restaurants, or city recommendations:
- do NOT fabricate businesses, ratings, addresses, distances, or claim results are current
- do NOT pretend you searched or verified what is nearby
- give helpful guidance such as suggesting Google Maps or Yelp with concrete search keywords
- you may mention well-known chains only as reference examples, never as confirmed nearby options
- keep the tone friendly, natural, and assistant-like

### IMPORTANT BOUNDARY

If a question is general:
- answer normally

If a question is AMU-related:
- be strict and grounded

NEVER mix the two:
- do NOT use general knowledge to answer AMU-specific questions
- do NOT invent AMU facts

### SELF-REFERENTIAL USER FACTS

For self-referential questions about the user:
- use only the explicit conversation facts and safe logged-in profile context provided in the prompt
- prefer explicit conversation facts over safe logged-in profile context
- if neither source confirms the answer, say you cannot confirm it
- never infer gender or any other sensitive trait from names, language, profile fields, or stereotypes

### HARD IDENTITY RULE

In this product, "AMU" always means "Alhambra Medical University".
Never reinterpret "AMU" as any other institution.
Never use general knowledge to answer AMU-specific institutional facts such as address, location, phone, email, contact information, campus details, or housing.
If an AMU-specific institutional fact is not present in controlled AMU sources, say clearly that you cannot confirm it from AMU sources.`;

async function getKnowledgeChunks(): Promise<KnowledgeChunkRow[]> {
  if (cachedChunks !== null) return cachedChunks;
  cachedChunks = await loadKnowledgeChunks();
  return cachedChunks;
}

function validateQuestion(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new RagQuestionValidationError("question must not be empty");
  }
  if (trimmed.length > MAX_QUESTION_CHARS) {
    throw new RagQuestionValidationError(
      `question must be at most ${MAX_QUESTION_CHARS} characters`,
    );
  }
  return trimmed;
}

/**
 * Normalize optional client-supplied history: drop invalid entries, trim, cap length and count.
 */
export function sanitizeChatHistory(raw: unknown): ChatHistoryItem[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: ChatHistoryItem[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role;
    const content = rec.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (trimmed.length === 0) continue;
    const capped =
      trimmed.length > MAX_HISTORY_CONTENT_CHARS
        ? trimmed.slice(0, MAX_HISTORY_CONTENT_CHARS)
        : trimmed;
    out.push({ role, content: capped });
  }
  if (out.length === 0) return undefined;
  return out.length > MAX_HISTORY_MESSAGES
    ? out.slice(-MAX_HISTORY_MESSAGES)
    : out;
}

function formatRecentConversationBlock(history: ChatHistoryItem[]): string {
  const lines = history.map((h) => {
    const who = h.role === "user" ? "User" : "Assistant";
    return `- ${who}: ${h.content}`;
  });
  return `Recent conversation context (for resolving follow-ups only; not a factual source):\n${lines.join("\n")}`;
}

function formatStudentContextBlock(studentContext: string | null | undefined): string {
  const trimmed = studentContext?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;
  return `Student Context
- Student data: Unavailable
- Notes:
  - No verified student context was available for this request.`;
}

function formatIdentityContextForPrompt(
  identityContext: IdentityContext | null | undefined,
): string {
  return formatIdentityContextBlock(identityContext);
}

function intentToConversationDomain(intent: StudentAiIntent): ConversationDomain {
  return intent === "general" || intent === "local_search"
    ? "general"
    : "academic";
}

function latestUserHistoryItem(history: ChatHistoryItem[]): ChatHistoryItem | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === "user") return history[i];
  }
  return undefined;
}

function sharedItemExists(left: Iterable<string>, right: Iterable<string>): boolean {
  const rightSet = new Set(right);
  for (const item of left) {
    if (rightSet.has(item)) return true;
  }
  return false;
}

function extractAcademicTopicTags(
  trimmed: string,
  lower: string,
): Set<string> {
  const tags = new Set<string>();
  if (
    /\b(course|courses|class|classes|prerequisite|catalog|curriculum|program)\b/i.test(
      lower,
    ) || /课程|选课|先修|目录|培养方案|课表|科目/.test(trimmed)
  ) {
    tags.add("courses");
  }
  if (
    /\b(enroll|enrolled|enrollment)\b/i.test(lower) || /入学|enrollment|录取/.test(trimmed)
  ) {
    tags.add("enrollment");
  }
  if (/\b(credit|credits)\b/i.test(lower) || /学分/.test(trimmed)) {
    tags.add("credits");
  }
  if (/\b(grade|grades|gpa|transcript)\b/i.test(lower) || /成绩|绩点|成绩单/.test(trimmed)) {
    tags.add("grades");
  }
  if (/\b(tuition|fee|fees|payment)\b/i.test(lower) || /学费|费用|缴费|付款/.test(trimmed)) {
    tags.add("tuition");
  }
  if (/\b(refund|refunds)\b/i.test(lower) || /退款|退费/.test(trimmed)) {
    tags.add("refund");
  }
  if (/\b(withdraw|withdrawal|drop|add\/drop)\b/i.test(lower) || /退课|退选|加退选/.test(trimmed)) {
    tags.add("withdrawal");
  }
  if (
    /\b(policy|policies|rule|rules|requirement|requirements|deadline|deadlines)\b/i.test(
      lower,
    ) || /政策|规定|要求|规则|截止/.test(trimmed)
  ) {
    tags.add("policy");
  }
  if (
    /\b(registration|register|registered)\b/i.test(lower) || /注册|报名|选课开放/.test(trimmed)
  ) {
    tags.add("registration");
  }
  return tags;
}

const GENERAL_TOPIC_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "those",
  "these",
  "what",
  "about",
  "how",
  "why",
  "when",
  "where",
  "which",
  "would",
  "could",
  "should",
  "then",
  "but",
  "also",
  "into",
  "from",
  "have",
  "does",
  "did",
  "can",
  "you",
  "your",
  "我",
  "那",
  "这",
  "怎么办",
  "为什么",
  "可以",
  "一下",
]);

function extractTopicKeywords(text: string): Set<string> {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  const latinTokens = lower.match(/[a-z0-9][a-z0-9+-]{1,}/g) ?? [];
  for (const token of latinTokens) {
    if (!GENERAL_TOPIC_STOPWORDS.has(token)) out.add(token);
  }

  const hanRuns = text.match(/[\u4E00-\u9FFF]{2,}/g) ?? [];
  for (const run of hanRuns) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const bigram = run.slice(i, i + 2);
      if (!GENERAL_TOPIC_STOPWORDS.has(bigram)) out.add(bigram);
    }
  }

  return out;
}

function hasEntityCarryoverCue(trimmed: string, lower: string): boolean {
  if (
    /\b(it|its|them|their|they|those|these|this|that|he|him|his|she|her|hers|the\s+same\s+one|the\s+same\s+people|those\s+people|these\s+people|the\s+three|three\s+people)\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  return (
    /他|她|它|他们|她们|它们|他们的|她们的|它们的|这三个人|那三个人|这几个人|那几个人|这些人|那些人|同一个|同一批|上他们的课|上她们的课|上它们的课/.test(
      trimmed,
    )
  );
}

function looksLikeFollowUpMessage(trimmed: string, lower: string): boolean {
  if (hasEntityCarryoverCue(trimmed, lower)) return true;
  if (
    /\b(what\s+about|how\s+about|and\s+what\s+about|but\s+if|why\s+is\s+that|why\s+did\s+that\s+happen|can\s+you\s+recommend)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /^(那|那我|但|但是|不过|如果这样|为什么会这样|可以推荐|所以|然后|可如果|那如果)/.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /那|这|它|怎么办|那我|为什么会这样|可以推荐一下吗|学费呢|第一学期呢|如果我家|怎么支付|如何支付|该怎么做|那如果/.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (trimmed.length <= 40 && /呢[?？]?$/.test(trimmed)) return true;
  if (
    trimmed.length <= 60 &&
    (/\b(vs|versus|or)\b/i.test(lower) || /和|还是|或者/.test(trimmed))
  ) {
    return true;
  }
  return false;
}

function detectTopicSwitch(
  question: string,
  currentDomain: ConversationDomain,
  previousUserQuestion: string | undefined,
  previousDomain: ConversationDomain | null,
  isFollowUp: boolean,
): boolean {
  if (!previousUserQuestion || previousDomain == null) return false;

  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();
  const prevTrimmed = previousUserQuestion.trim();
  const prevLower = prevTrimmed.toLowerCase();
  const hasCarryoverCue = hasEntityCarryoverCue(trimmed, lower);

  if (currentDomain === "academic" && previousDomain === "general") {
    if (isFollowUp && hasCarryoverCue) return false;
    return true;
  }

  const currentAcademicTags = extractAcademicTopicTags(trimmed, lower);
  const previousAcademicTags = extractAcademicTopicTags(prevTrimmed, prevLower);
  if (
    currentAcademicTags.size > 0 &&
    previousAcademicTags.size > 0 &&
    !sharedItemExists(currentAcademicTags, previousAcademicTags)
  ) {
    return true;
  }

  const currentKeywords = extractTopicKeywords(trimmed);
  const previousKeywords = extractTopicKeywords(previousUserQuestion);
  const hasSharedKeywords =
    currentKeywords.size > 0 &&
    previousKeywords.size > 0 &&
    sharedItemExists(currentKeywords, previousKeywords);

  if (currentDomain === "general" && previousDomain === "academic") {
    if (!hasSharedKeywords && currentKeywords.size > 0) return true;
    return !isFollowUp;
  }

  if (currentDomain !== previousDomain) {
    if (previousDomain === "general" && isFollowUp && hasCarryoverCue) {
      return false;
    }
    return true;
  }

  if (!isFollowUp && currentKeywords.size > 0 && previousKeywords.size > 0) {
    return !hasSharedKeywords;
  }

  return false;
}

function selectSameDomainShortHistory(
  history: ChatHistoryItem[],
  targetDomain: ConversationDomain,
): ChatHistoryItem[] {
  const userIndexes: number[] = [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role !== "user") continue;
    const userDomain = intentToConversationDomain(
      classifyStudentAiIntent(history[i].content),
    );
    if (userDomain !== targetDomain) {
      if (userIndexes.length > 0) break;
      continue;
    }
    userIndexes.unshift(i);
    if (userIndexes.length >= MAX_HISTORY_USER_TURNS) break;
  }
  if (userIndexes.length === 0) return [];
  return history.slice(userIndexes[0]);
}

export function planShortConversationMemory(
  question: string,
  rawHistory: unknown,
  initialIntent: StudentAiIntent,
): ShortMemoryPlan {
  const history = sanitizeChatHistory(rawHistory) ?? [];
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();
  const currentDomain = intentToConversationDomain(initialIntent);
  const previousUser = latestUserHistoryItem(history);
  const previousIntent = previousUser
    ? classifyStudentAiIntent(previousUser.content)
    : null;
  const previousDomain =
    previousIntent == null ? null : intentToConversationDomain(previousIntent);
  const isFollowUp = looksLikeFollowUpMessage(trimmed, lower);
  const hasCarryoverCue = hasEntityCarryoverCue(trimmed, lower);
  const isTopicSwitch = detectTopicSwitch(
    question,
    currentDomain,
    previousUser?.content,
    previousDomain,
    isFollowUp,
  );

  let effectiveIntent = initialIntent;
  if (
    initialIntent === "general" &&
    isFollowUp &&
    !isTopicSwitch &&
    previousDomain === "academic"
  ) {
    effectiveIntent = previousIntent === "school_fact" ? "school_fact" : "policy";
  } else if (
    previousDomain === "general" &&
    isFollowUp &&
    hasCarryoverCue &&
    !isTopicSwitch
  ) {
    effectiveIntent = "general";
  }

  const effectiveDomain = intentToConversationDomain(effectiveIntent);
  let selectedHistory: ChatHistoryItem[] = [];
  if (!isTopicSwitch && previousDomain === effectiveDomain) {
    if (effectiveDomain === "academic") {
      selectedHistory = selectSameDomainShortHistory(history, "academic");
    } else if (isFollowUp) {
      selectedHistory = selectSameDomainShortHistory(history, "general");
    }
  }

  return {
    history: selectedHistory.length > 0 ? selectedHistory : undefined,
    isFollowUp,
    isTopicSwitch,
    previousDomain,
    effectiveIntent,
  };
}

function formatRetrievedDocumentContextBlock(
  items: { chunk: KnowledgeChunkRow; score: number }[],
): string {
  if (items.length === 0) {
    return "No retrieved AMU handbook or policy excerpts were available.";
  }
  return buildContextBlock(items);
}

/** True when the latest question looks like a follow-up or vague reference (with history present). */
function followUpOrVagueCue(trimmed: string, lower: string): boolean {
  if (looksLikeFollowUpMessage(trimmed, lower)) return true;
  if (/how\s+should\s+i\s+do|how\s+do\s+i\s+do\s+that/i.test(lower)) return true;
  return false;
}

function shouldRewriteForRetrieval(
  question: string,
  history: ChatHistoryItem[],
  intent: RagIntent,
  guidanceSubtype: GuidanceSubtype | undefined,
): boolean {
  if (intent === "guidance" && guidanceSubtype === "support") {
    return true;
  }

  if (history.length === 0) return false;
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();
  if (isDefinitionalPolicyQuestion(lower)) return false;

  if (trimmed.length >= 140 && !followUpOrVagueCue(trimmed, lower)) return false;

  if (trimmed.length <= 48) return true;
  if (followUpOrVagueCue(trimmed, lower)) return true;
  if (trimmed.length < 75 && /[?？]/.test(trimmed)) return true;
  if (
    /穷|困难|付.{0,6}费|支付|学费|tuition|payment|afford|installment|分期|退款|退费|滞纳/i.test(
      trimmed + lower,
    )
  ) {
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

async function rewriteQuestionForRetrieval(
  client: OpenAI,
  question: string,
  history: ChatHistoryItem[] | undefined,
  intent: RagIntent,
  guidanceSubtype: GuidanceSubtype | undefined,
): Promise<string> {
  const h = history ?? [];
  if (!shouldRewriteForRetrieval(question, h, intent, guidanceSubtype)) {
    return question;
  }

  const histText =
    h.length > 0
      ? h
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n")
      : "(none)";

  const rewriteSystem =
    intent === "guidance" && guidanceSubtype === "support"
      ? REWRITE_SYSTEM_SUPPORT
      : REWRITE_SYSTEM_ACADEMIC_STRICT;

  try {
    const completion = await withOpenAiRetry("rewriteQuestionForRetrieval", () =>
      client.chat.completions.create({
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
      }),
    );

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const oneLine = raw.replace(/\s+/g, " ").trim();
    if (oneLine.length === 0) return question;
    return oneLine.length > MAX_REWRITE_OUTPUT_CHARS
      ? oneLine.slice(0, MAX_REWRITE_OUTPUT_CHARS)
      : oneLine;
  } catch {
    return question;
  }
}

const GUIDANCE_FALLBACK_EN =
  "I couldn't find a clear, direct answer in the AMU catalog excerpts I have right now. Based on the available catalog material, I can still help explain related topics such as tuition payment rules, refund policy, graduation requirements, course planning, or registration procedures. For final academic or payment decisions, you should confirm with AMU registrar/advisor.";

const GUIDANCE_FALLBACK_ZH =
  "我目前无法在现有 AMU 目录摘录中找到明确、直接的答案。根据现有目录内容，我仍可以继续帮助你解释相关主题，例如学费支付规则、退费政策、毕业要求、课程规划或注册流程；但涉及最终的选课、缴费或学术决定时，仍建议你向 AMU registrar/advisor 确认。";

const GUIDANCE_SUPPORT_FALLBACK_EN =
  "I could not directly confirm this from the AMU catalog excerpts I have right now. Based on the available catalog material, I can still help with related topics such as tuition and fees, FAFSA / financial aid references, admissions requirements, and general academic planning. For a final decision about eligibility, payment arrangements, or financial support, you should confirm with AMU admissions / registrar / financial aid office.";

const GUIDANCE_SUPPORT_FALLBACK_ZH =
  "我目前无法仅根据现有 AMU 目录摘录直接确认这一点。不过根据现有目录内容，我仍可以帮助你查看相关主题，例如学费与费用、FAFSA / 财务援助、入学要求以及一般性的课程规划。若涉及最终的申请资格、缴费安排或财务援助，仍建议你向 AMU admissions / registrar / financial aid office 确认。";

function looksLikeStrictCatalogRefusal(answer: string): boolean {
  if (/could not find a clear answer in the amu catalog excerpts/i.test(answer)) {
    return true;
  }
  if (/无法在[^。]*目录摘录[^。]*找到[^。]*答案/.test(answer)) return true;
  if (/未在[^。]*提供的[^。]*摘录[^。]*找到/.test(answer)) return true;
  return false;
}

function applyGuidanceFallbackIfNeeded(
  answer: string,
  question: string,
  subtype: GuidanceSubtype,
): string {
  if (!looksLikeStrictCatalogRefusal(answer)) return answer;
  if (subtype === "support") {
    return isMostlyChinese(question)
      ? GUIDANCE_SUPPORT_FALLBACK_ZH
      : GUIDANCE_SUPPORT_FALLBACK_EN;
  }
  return isMostlyChinese(question) ? GUIDANCE_FALLBACK_ZH : GUIDANCE_FALLBACK_EN;
}

/** Heuristic: treat as Chinese when CJK clearly dominates the visible text. */
function isMostlyChinese(text: string): boolean {
  const han = text.match(/[\u4E00-\u9FFF]/g);
  const hanCount = han?.length ?? 0;
  if (hanCount === 0) return false;
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;
  return hanCount > latinCount || (latinCount === 0 && hanCount >= 2);
}

function buildContextBlock(items: { chunk: KnowledgeChunkRow; score: number }[]): string {
  return items
    .map(({ chunk }) => {
      return `[Source: ${chunk.source} | Chunk: ${chunk.chunkIndex}]\n${chunk.content}`;
    })
    .join("\n\n");
}

function toRetrieved(chunk: KnowledgeChunkRow, score: number): RetrievedChunk {
  return {
    id: chunk.id,
    source: chunk.source,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    score,
  };
}

/** True when the question looks like a definitional/policy lookup (should stay strict, not guidance). */
function isDefinitionalPolicyQuestion(lower: string): boolean {
  const definitional =
    /\b(what\s+is|what\s+are|what\s+was|what\s+were|when\s+is|when\s+are|when\s+do|where\s+is|where\s+are|how\s+much|how\s+many|how\s+long|is\s+there|are\s+there|define|list\s+the|describe\s+the|explain\s+the)\b/i.test(
      lower,
    );
  const policyNouns =
    /\b(policy|policies|requirement|requirements|deadline|deadlines|fee|fees|tuition|refund|attendance|add\/drop|add\s+and\s+drop|withdrawal|transcript|enrollment|registration|catalog|probation|satisfactory\s+academic)\b/i.test(
      lower,
    );
  return definitional && policyNouns;
}

/** Substantive catalog/policy content — blocks treating the message as a pure direct turn. */
function hasSubstantiveCatalogCue(trimmed: string, lower: string): boolean {
  if (
    /refund|tuition|late\s+payment|payment\s+plan|graduation\s+requirement|degree\s+requirement|attendance|add\/drop|add\s+and\s+drop|withdrawal|transcript|enrollment|registration|academic\s+integrity|probation|credit\s+hour|semester\s+hour|gpa|syllabus|prerequisite|corequisite/i.test(
      lower,
    )
  ) {
    return true;
  }
  return /退费|学费|退款|滞纳|出勤|旷课|毕业要求|学位|加退选|退选|成绩单|学分|注册|截止日期|校历|政策|纪律|必修|选修|先修/.test(
    trimmed,
  );
}

/** Affordability, payment stress, admissions fit, eligibility — school-related support guidance. */
function isSupportGuidanceCue(trimmed: string, lower: string): boolean {
  const guidanceSupportZh =
    /怎么支付|如何支付|怎么付学费|如何付学费|付学费|交学费|家里穷|家里.{0,6}困难|经济困难|付不起学费|分期.{0,4}付|读得起|负担.{0,8}学费|学费.{0,12}怎么办|能读.{0,8}AMU|可以读.{0,16}AMU|AMU.{0,14}(能读|能上)|本科.{0,28}专业.{0,16}(可以|能|能否)|可不可以读|能否申请|申请.{0,12}资格|有没有资格|是否符合|录取.{0,12}要求|背景.{0,12}(可以|能|符合)|背景.{0,16}(不同|不一样)|非传统|跨专业.{0,12}(申请|读)/.test(
      trimmed,
    );
  const guidanceSupportEn =
    /\bhow\s+(do|can)\s+i\s+pay\b|\bcan'?t\s+afford\b|\bafford\s+to\s+(pay|study)\b|\bfinancial\s+difficult/i.test(
      lower,
    ) ||
    /\bhelp\s+(paying|with\s+tuition|with\s+paying)\b|\bneed\s+(some\s+)?help\s+(paying|with)\b/i.test(
      lower,
    ) ||
    (/\bwhat\s+if\s+i\s+(have|need)\b/i.test(lower) &&
      /\b(financial|money|pay|tuition|afford)/i.test(lower)) ||
    (/\b(am\s+i\s+eligible|eligible\s+to\s+apply|eligible\s+for)\b/i.test(
      lower,
    ) &&
      /\b(amu|alhambra|program|admission)/i.test(lower)) ||
    (/\bcan\s+i\s+(still\s+)?(study|apply|enroll)\b/i.test(lower) &&
      /\b(amu|alhambra)\b/i.test(lower)) ||
    (/\b(my\s+)?undergraduate\s+major\b|\bmy\s+major\s+is\b|\bnon[- ]traditional\s+background\b/i.test(
      lower,
    ) &&
      /\b(amu|alhambra|apply|eligible|admission)/i.test(lower)) ||
    (/\bcan\s+i\s+apply\b/i.test(lower) &&
      /\b(background|major|degree|undergraduate)\b/i.test(lower));

  return guidanceSupportZh || guidanceSupportEn;
}

function detectGuidanceSubtype(
  question: string,
  history?: ChatHistoryItem[],
): GuidanceSubtype {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();
  if (isSupportGuidanceCue(trimmed, lower)) return "support";

  const recentUser = [...(history ?? [])]
    .filter((m) => m.role === "user")
    .slice(-2);
  for (const m of recentUser) {
    const t = m.content.trim();
    const l = t.toLowerCase();
    if (isSupportGuidanceCue(t, l)) return "support";
  }

  return "academic";
}

function isGuidanceQuestion(trimmed: string, lower: string): boolean {
  if (isDefinitionalPolicyQuestion(lower)) return false;

  if (isSupportGuidanceCue(trimmed, lower)) return true;

  const guidanceEn =
    /\b(how\s+should\s+i\s+plan|how\s+do\s+i\s+arrange|what\s+should\s+i\s+take\s+first|first\s+semester|course\s+planning|curriculum\s+planning|how\s+should\s+i\s+schedule\s+my\s+classes)\b/i.test(
      lower,
    ) ||
    /\b(plan|planning|arrange|schedul(e|ing)|pick\s+(my\s+)?courses|choose\s+(my\s+)?courses|what\s+should\s+i\s+take|which\s+(class|classes|course|courses)\b|second\s+semester|order\s+of\s+courses|course\s+sequence|recommended\s+sequence|curriculum|pathway|roadmap|how\s+to\s+plan|help\s+me\s+plan)\b/i.test(
      lower,
    );

  const guidanceZh =
    /我应该怎么安排|怎么安排选课|第一学期怎么选课|我是.{0,30}第[一二三四五六七八九十\d]+学期|先修什么|怎么规划课程|如何安排课程/.test(
      trimmed,
    ) ||
    /选课|安排.{0,6}课|怎么.{0,6}选|如何.{0,8}规划|第[一二三四五六七八九十\d]+学期|该选|先修|课程.{0,6}顺序|建议.{0,6}课|课程.{0,6}规划|学期.{0,8}怎么|规划.{0,6}选课/.test(
      trimmed,
    );

  return guidanceEn || guidanceZh;
}

/**
 * If the question plausibly relates to catalog, policy, or school academic/financial support,
 * do not mark it out-of-scope.
 */
function isPlausiblyAmuCatalogOrSupport(trimmed: string, lower: string): boolean {
  if (hasSubstantiveCatalogCue(trimmed, lower)) return true;
  if (isDefinitionalPolicyQuestion(lower)) return true;
  if (isGuidanceQuestion(trimmed, lower)) return true;
  return false;
}

/**
 * Conservative: clearly unrelated to AMU catalog / academic support.
 * Call only when isPlausiblyAmuCatalogOrSupport is false.
 */
function isOutOfScopeQuestion(question: string): boolean {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();

  if (
    /\b(find a girlfriend|find a boyfriend|get a girlfriend|get a boyfriend|will i find a girlfriend|will i find a boyfriend|dating at|dating in|romantic relationship)\b/i.test(
      lower,
    ) ||
    /\b(will anyone like me|people like me|become popular (at|in))\b/i.test(
      lower,
    ) ||
    /\b(invest in amu|invest in the university|invest in alhambra|buy (a |an )?(part|stake|share|piece) of (amu|the university|alhambra medical)|business opportunity|good (business )?investment)\b/i.test(
      lower,
    ) ||
    /\b(who is the (richest|wealthiest)|most attractive student|hottest student|best[- ]looking student|nicest.{0,30}romantically)\b/i.test(
      lower,
    ) ||
    /\b(how (do i|to) (get |become )rich|get rich quick|should i break up|break up with my (boyfriend|girlfriend))\b/i.test(
      lower,
    ) ||
    /\bwhat should i do with my life\b/i.test(lower)
  ) {
    return true;
  }

  if (
    /找到(了)?(女朋友|男朋友)|谈恋爱|找对象|脱单|谁会喜欢我|有人喜欢我|喜欢我吗/.test(
      trimmed,
    ) ||
    /变(得)?(受欢迎|有名)|谁最有钱|哪个.{0,8}最(漂亮|帅|美)|最有(魅力|吸引力)/.test(
      trimmed,
    ) ||
    /给.{0,6}AMU.{0,6}投资|投资.{0,6}AMU|买下.{0,10}(学校|大学)|入股.{0,10}(学校|大学)/.test(
      trimmed,
    ) ||
    /怎么变有钱|如何变有钱|发财|暴富/.test(trimmed) ||
    /我的人生.{0,8}怎么办|人生.{0,8}该怎么办|人生.{0,8}该如何/.test(
      trimmed,
    ) ||
    /(该|要不要|该不该).{0,6}分手|和(男|女)朋友分手/.test(trimmed)
  ) {
    return true;
  }

  return false;
}

function buildOutOfScopeReply(question: string): string {
  if (isMostlyChinese(question)) {
    return "我目前主要帮助回答 AMU 的课程、学费、退费政策、毕业要求、出勤规定、选课规划和注册流程等问题。这个问题不属于我能根据 AMU 目录可靠回答的范围。如果你想了解，也可以问我有关 AMU 学费、课程规划、毕业要求或注册规则等方面的问题。";
  }
  return "I'm mainly designed to help with AMU catalog and academic support questions, such as tuition, refund policy, graduation requirements, course planning, attendance rules, and registration procedures. I can't reliably answer that question based on the AMU catalog. If you want, you can ask me about AMU tuition, course planning, graduation requirements, or registration rules.";
}

function classifyDirectKind(trimmed: string, lower: string): DirectKind {
  const haystack = trimmed + lower;

  if (
    /(speak|说|会).{0,12}(中文|汉语|chinese|mandarin)|可以说中文|中文可以吗|用中文回答|用中文|多语言|什么语言|\bdo\s+you\s+speak\b|\bcan\s+you\s+speak\b|\bin\s+which\s+languages?\b/i.test(
      haystack,
    )
  ) {
    return "language";
  }
  if (
    /^(hi|hello|hey|yo|hiya|sup|good\s+(morning|afternoon|evening)|greetings|howdy)[\s!,?.]*$/i.test(
      trimmed,
    ) ||
    /^(你好|您好|嗨|在吗|早上好|下午好|晚上好)[\s!！?？，,。.]*$/u.test(trimmed)
  ) {
    return "greeting";
  }
  if (/^(thanks|thank\s+you|thx|ty|3q)[\s!.]*$/i.test(lower)) {
    return "thanks";
  }
  if (
    /what\s+can\s+you\s+do|who\s+are\s+you|what\s+are\s+you|你是(什么|谁)|你能(做|干)什么|你(能|会)帮我|你会做什么|你能帮我做什么/i.test(
      haystack,
    )
  ) {
    return "capability";
  }
  return "capability";
}

function isDirectIntent(trimmed: string, lower: string): boolean {
  if (hasSubstantiveCatalogCue(trimmed, lower)) return false;

  const greetingOnly =
    /^(hi|hello|hey|yo|hiya|sup|good\s+(morning|afternoon|evening)|greetings|howdy)[\s!,?.]*$/i.test(
      trimmed,
    ) ||
    /^(你好|您好|嗨|在吗|早上好|下午好|晚上好)[\s!！?？，,。.]*$/u.test(trimmed);

  const thanksOnly = /^(thanks|thank\s+you|thx|ty|3q)[\s!.]*$/i.test(lower);

  const languageMeta =
    /(speak|说|会).{0,12}(中文|汉语|chinese|mandarin)|可以说中文|中文可以吗|用中文|多语言|什么语言/i.test(
      trimmed + lower,
    ) ||
    /\bdo\s+you\s+speak\b|\bcan\s+you\s+speak\b|\bin\s+which\s+languages?\b/i.test(
      lower,
    );

  const capabilityMeta =
    /what\s+can\s+you\s+do|who\s+are\s+you|what\s+are\s+you|你是(什么|谁)|你能(做|干)什么|你(能|会)帮我|你会做什么|你能帮我做什么/i.test(
      trimmed + lower,
    );

  if (greetingOnly || thanksOnly) return trimmed.length <= 48;
  if (languageMeta) return trimmed.length < 140;
  if (capabilityMeta) return trimmed.length < 220;
  return false;
}

function buildDirectReply(question: string): string {
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

function detectIntent(question: string): RagIntent {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();

  if (isDirectIntent(trimmed, lower)) return "direct";
  if (
    !isPlausiblyAmuCatalogOrSupport(trimmed, lower) &&
    isOutOfScopeQuestion(trimmed)
  ) {
    return "out_of_scope";
  }
  if (isGuidanceQuestion(trimmed, lower)) return "guidance";
  return "strict";
}

function languageInstructionForLlm(
  question: string,
  identityContext?: IdentityContext | null,
): string {
  const preferredLanguage = identityContext?.conversationFacts?.preferredLanguage;
  if (preferredLanguage === "zh") {
    return "Respond in Simplified Chinese (简体中文).";
  }
  if (preferredLanguage === "en") {
    return "Respond in English.";
  }
  return isMostlyChinese(question)
    ? "Respond in Simplified Chinese (简体中文)."
    : "Respond in English.";
}

function buildGeneralSystemPrompt(
  question: string,
  identityContext?: IdentityContext | null,
): string {
  return `${DUAL_MODE_SYSTEM_PROMPT}

The current request has already been classified as general or casual, so use FLEXIBLE MODE.
Do not reinterpret it as an AMU school-fact lookup just because the message contains "AMU".
If the message is a follow-up, keep answering the same subject from the recent conversation unless the user clearly changes topic.
${languageInstructionForLlm(question, identityContext)}`;
}

function asksAboutTakingSomeonesClass(question: string): boolean {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();
  return (
    /\b(can\s+i|could\s+i|would\s+i\s+be\s+able\s+to)\s+(take|get\s+into|attend)\s+(his|her|their)\s+class(es)?\b/i.test(
      lower,
    ) ||
    /\b(can|could)\s+(he|she|they)\s+teach\s+(at\s+)?amu\b/i.test(lower) ||
    /\b(study\s+under|be\s+taught\s+by)\s+(him|her|them)\b/i.test(lower) ||
    /在AMU.{0,10}(上|修).{0,6}(他们|她们|他|她).{0,4}的课|在AMU能上他们的课|能上他们的课吗|能上他的课吗|能上她的课吗|跟他们上课|跟他上课|跟她上课/.test(
      trimmed,
    )
  );
}

function recentConversationSuggestsHistoricalPeople(
  history: ChatHistoryItem[] | undefined,
): boolean {
  if (history == null || history.length === 0) return false;
  const haystack = history.map((item) => item.content).join("\n");
  return (
    /\b(ancient|historical\s+figure|history|historian|deceased|dead|century|bce|bc|ce|dynasty|emperor|king|queen|general|philosopher|strategist|warlord)\b/i.test(
      haystack,
    ) ||
    /古代|历史人物|歷史人物|历史上|歷史上|已故|去世|朝代|皇帝|国王|國王|将军|將軍|哲学家|哲學家|军事家|軍事家|谋略家|謀略家/.test(
      haystack,
    )
  );
}

function buildGeneralRealityCheckReply(
  question: string,
  history: ChatHistoryItem[] | undefined,
): string | null {
  if (
    asksAboutTakingSomeonesClass(question) &&
    recentConversationSuggestsHistoricalPeople(history)
  ) {
    if (isMostlyChinese(question)) {
      return "如果你说的还是刚才那几位历史人物，那当然不能。因为他们是历史人物，不可能在现在的 AMU 亲自开课或给学生上课。要是你想学和他们相关的内容，我可以继续帮你看看 AMU 目录里有没有相关的历史、思想或人文类课程。";
    }
    return "If you mean the same historical figures from the previous turn, then no. Historical figures cannot literally teach classes at modern-day AMU. If you want, I can help check whether AMU offers courses related to their history, ideas, or influence instead.";
  }
  return null;
}

function buildGroundedAcademicSystemPrompt(
  question: string,
  pipeline: GroundedAmuPipeline,
  identityContext?: IdentityContext | null,
): string {
  const pipelineLine =
    pipeline === "mixed"
      ? `The current request is AMU-related and combines student-specific facts with AMU policy. Stay in HIGH PRECISION MODE.
Use only the verified student record facts and retrieved AMU documents provided in the user message.
Structure the answer with these sections when possible:
- What your record shows
- What AMU policy says
- What that means`
      : `The current request is AMU-related. Stay in HIGH PRECISION MODE.
Use only the retrieved AMU documents provided in the user message.
Do not answer AMU-specific questions from general knowledge.`;

  return `${DUAL_MODE_SYSTEM_PROMPT}

${pipelineLine}
If the provided evidence does not support a claim, say "I cannot find this in AMU documents."
If student-specific confirmation is missing, say "I don't have enough information from your records to confirm this."
Keep the answer natural, concise, and grounded.
${languageInstructionForLlm(question, identityContext)}`;
}

function buildStudentRecordSystemPrompt(
  question: string,
  identityContext?: IdentityContext | null,
): string {
  return `${DUAL_MODE_SYSTEM_PROMPT}

The current request is about the student's verified record. Stay in HIGH PRECISION MODE.
Use only the verified student record facts provided in the user message.
Do not infer missing enrollments, credits, grades, courses, terms, or other AMU-specific facts.
If the student record facts say academic history coverage is partial, do not turn a missing record into a definitive "no".
Use "I cannot confirm from the available records" for historical negatives when coverage is partial.
If the facts do not support the answer, say "I don't have enough information from your records to confirm this."
Keep the answer natural, concise, and grounded.
${languageInstructionForLlm(question, identityContext)}`;
}

function buildGraduationEvaluationSystemPrompt(
  question: string,
  identityContext?: IdentityContext | null,
): string {
  return `${DUAL_MODE_SYSTEM_PROMPT}

The current request is a graduation eligibility question.
The structured graduation evaluation in the user message was computed deterministically by backend logic and is the source of truth for:
- whether the student is currently eligible to graduate,
- total earned credits,
- required credits,
- missing credits,
- missing required courses,
- GPA requirement status when provided.
Do not recompute, override, soften, or contradict the structured graduation evaluation.
Do not say you cannot confirm graduation eligibility when the evaluation block is present.
Use retrieved AMU documents only to explain or contextualize the result, not to decide it.
Start with a direct yes/no answer, then clearly summarize credits, missing courses, and any remaining requirements.
Keep the answer concise and student-facing.
${languageInstructionForLlm(question, identityContext)}`;
}

const ACADEMIC_CONTACT_BLOCK_EN = `For final academic advising or official confirmation, please contact:

Lillian Li
Associate Academic Dean
909-703-9785
lli@amu.edu`;

const ACADEMIC_CONTACT_BLOCK_ZH = `如需进一步确认正式选课安排、入学资格或学术规划，建议联系学术顾问：

Lillian Li
Associate Academic Dean
909-703-9785
lli@amu.edu`;

const TECH_CONTACT_BLOCK_EN = `If you are experiencing a portal or AI system issue, please contact technical support:

AHMC AI Department
bingchen.li@wanpanel.ai`;

const TECH_CONTACT_BLOCK_ZH = `如果您遇到 portal 或 AI 系统技术问题，请联系技术支持：

AHMC AI Department
bingchen.li@wanpanel.ai`;

function answerAlreadyContainsSupportContacts(answer: string): boolean {
  return (
    /lli@amu\.edu/i.test(answer) ||
    /bingchen\.li@wanpanel\.ai/i.test(answer) ||
    /909-703-9785/.test(answer)
  );
}

/**
 * Portal / login / upload / AI-assistant failures — not generic "registration policy" questions.
 */
function shouldSuggestTechnicalContact(
  question: string,
  intent: RagIntent,
): boolean {
  if (intent === "direct" || intent === "out_of_scope") return false;
  const t = question.trim();
  const l = t.toLowerCase();

  const distress =
    /\b(not\s+work|doesn'?t\s+work|don'?t\s+work|won'?t\s+work|unable\s+to|can'?t|cannot|error|broken|bug|glitch|fail|failed|issue|problem|stuck|no\s+response|not\s+respond|not\s+responding|slow|timeout|down)\b/i.test(
      l,
    );

  const loginPortal =
    /\b(log\s*in|sign\s*in|sign-in|password|locked\s+out|forgot\s+password|reset\s+password|student\s+portal|school\s+portal|payment\s+portal|pay\s+portal|online\s+portal|the\s+portal)\b/i.test(
      l,
    ) && distress;

  const sitePage =
    /\b(website|web\s*site|webpage|web\s+page|browser)\b/i.test(l) &&
    distress;
  const httpError =
    /\b(404|500|502|503)\b/.test(l) &&
    /\b(error|page|site|server|status|http)\b/i.test(l);

  const uploadAttach =
    /\b(upload|uploading|attachment|attached\s+file|file\s+upload)\b/i.test(
      l,
    ) && distress;

  const aiAssistant =
    /\b(ai\s+assistant|this\s+assistant|this\s+chat|chatbot|chat\s+bot)\b/i.test(
      l,
    ) && distress;

  const zhTech =
    /无法登录|登不(了|进去)|密码忘了|密码错误|上传失败|附件.{0,6}(失败|错误|传不)|系统.{0,8}(故障|崩溃|打不开)|页面.{0,6}(报错|打不开|空白)|助手.{0,8}(没反应|不回答)/.test(
      t,
    );

  return (
    loginPortal ||
    sitePage ||
    httpError ||
    uploadAttach ||
    aiAssistant ||
    zhTech
  );
}

function usesAcademicGuidanceFallback(answer: string): boolean {
  return answer === GUIDANCE_FALLBACK_EN || answer === GUIDANCE_FALLBACK_ZH;
}

function usesSupportGuidanceFallback(answer: string): boolean {
  return (
    answer === GUIDANCE_SUPPORT_FALLBACK_EN ||
    answer === GUIDANCE_SUPPORT_FALLBACK_ZH
  );
}

/** Strong academic-advising / official-confirmation cues (question text). */
function hasStrongAcademicAdvisingCue(trimmed: string, lower: string): boolean {
  if (
    /\b(exception|waiver|petition|appeal|overload|readmit|readmission|leave\s+of\s+absence|loa|dean'?s|probation\s+appeal)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(official\s+confirmation|confirm\s+with|verify\s+with|must\s+i\s+get\s+approval|need\s+approval|written\s+approval|prerequisite\s+waiver|waive\s+a\s+prerequisite|prereq\s+waiver)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(unclear\s+prerequisite|prerequisite\s+ambigu|prerequisite\s+unclear|which\s+prerequisite|prereq\s+conflict)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(prerequisite|prereq)\b/i.test(lower) &&
    /\b(unclear|ambigu|unsure|uncertain|confus|not\s+sure)\b/i.test(lower)
  ) {
    return true;
  }
  if (
    /\b(transfer\s+credit|transcript\s+evaluat|transferring\s+in|will\s+my\s+credits)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(am\s+i\s+on\s+track|on\s+track\s+to\s+graduate|when\s+will\s+i\s+graduate|graduation\s+timeline|time\s+to\s+graduate|graduation\s+date\s+confirmation)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(eligib(le|ility)\s+for\s+the\s+program|program\s+eligib|admiss(?:ion|ions)\s+decision|background\s+fit|fit\s+for\s+the\s+program|will\s+i\s+be\s+accepted)\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  if (
    /正式确认|官方确认|学术例外|豁免|申诉|休学|复学|转学学分|成绩评估|先修.{0,10}(不清|不明|模糊|冲突)|能否按时毕业|毕业时间.{0,6}确认|入学资格|录取.{0,6}(决定|结果)|背景.{0,8}是否符合/.test(
      trimmed,
    )
  ) {
    return true;
  }

  const wantsConfirmation =
    /\b(officially|official\s+ok|is\s+it\s+allowed|is\s+this\s+allowed|permitted\s+to|get\s+permission)\b/i.test(
      lower,
    ) || /正式允许|学校批准|书面批准|能不能选|可不可以选/.test(trimmed);
  const planning =
    /\b(course\s+plan|plan\s+my\s+courses|which\s+courses\s+should|class\s+schedule|course\s+sequence|semester\s+plan)\b/i.test(
      lower,
    ) || /选课规划|课程安排|怎么选课|先修顺序/.test(trimmed);

  return wantsConfirmation && planning;
}

/** Admissions / eligibility / prerequisite angle on the support-guidance path. */
function hasAcademicEscalationInSupportQuestion(
  trimmed: string,
  lower: string,
): boolean {
  return (
    /\b(eligib|eligible|eligibility|admiss|applicant|apply\s+to|application|background|prior\s+degree|undergraduate\s+major|non[- ]traditional|prereq|prerequisite|transfer|graduate\s+on\s+time|graduation\s+path)\b/i.test(
      lower,
    ) ||
    /入学资格|申请资格|录取|背景|先修|转学|毕业路径|能否申请|是否符合/.test(trimmed)
  );
}

/** Support-path questions that need an academic dean / advisor, not payment-only help. */
function supportQuestionNeedsAcademicContact(
  trimmed: string,
  lower: string,
): boolean {
  if (isPurePaymentOperationalCue(trimmed, lower)) return false;
  return hasAcademicEscalationInSupportQuestion(trimmed, lower);
}

/**
 * Payment / installment / refund phrasing without academic-advising angle — exclude from academic contact.
 */
function isPurePaymentOperationalCue(trimmed: string, lower: string): boolean {
  const paymentish =
    /\b(pay|payment|tuition|installment|refund|due\s+date|invoice|balance|late\s+fee)\b/i.test(
      lower,
    ) || /学费|支付|分期|退款|缴费|滞纳/.test(trimmed);
  if (!paymentish) return false;
  return !hasAcademicEscalationInSupportQuestion(trimmed, lower);
}

function shouldSuggestAcademicContact(
  question: string,
  intent: RagIntent,
  guidanceSubtype: GuidanceSubtype | undefined,
  answer: string,
): boolean {
  if (intent !== "guidance" || guidanceSubtype === undefined) return false;
  if (shouldSuggestTechnicalContact(question, intent)) return false;

  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();

  if (guidanceSubtype === "academic") {
    if (usesAcademicGuidanceFallback(answer)) return true;
    return hasStrongAcademicAdvisingCue(trimmed, lower);
  }

  return supportQuestionNeedsAcademicContact(trimmed, lower);
}

function appendSupportContactBlocks(
  answer: string,
  question: string,
  intent: RagIntent,
  guidanceSubtype: GuidanceSubtype | undefined,
): string {
  if (answerAlreadyContainsSupportContacts(answer)) return answer;

  const zh = isMostlyChinese(question);
  const parts: string[] = [answer];

  if (shouldSuggestTechnicalContact(question, intent)) {
    parts.push(zh ? TECH_CONTACT_BLOCK_ZH : TECH_CONTACT_BLOCK_EN);
  } else if (
    shouldSuggestAcademicContact(question, intent, guidanceSubtype, answer)
  ) {
    parts.push(zh ? ACADEMIC_CONTACT_BLOCK_ZH : ACADEMIC_CONTACT_BLOCK_EN);
  }

  if (parts.length === 1) return answer;
  return parts.join("\n\n");
}

function detectSchoolFactKinds(question: string): Set<SchoolFactKind> {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();
  const kinds = new Set<SchoolFactKind>();

  if (
    /\b(amu|alhambra medical university|what is amu|which school)\b/i.test(lower) ||
    /AMU|是什么学校|哪所学校|哪个学校|学校名称|学校全名/.test(trimmed)
  ) {
    kinds.add("identity");
  }
  if (
    /\b(address|where\s+is|where'?s|located|location)\b/i.test(lower) ||
    /地址|在哪里|在哪裡|在哪|位置|地点|地點/.test(trimmed)
  ) {
    kinds.add("address");
    kinds.add("location");
  }
  if (/\b(phone|telephone|tel)\b/i.test(lower) || /电话|電話/.test(trimmed)) {
    kinds.add("phone");
    kinds.add("contact");
  }
  if (/\b(email|e-mail|mail)\b/i.test(lower) || /邮箱|郵箱|邮件|郵件/.test(trimmed)) {
    kinds.add("email");
    kinds.add("contact");
  }
  if (/\b(contact)\b/i.test(lower) || /联系|聯繫|联系方式|聯繫方式/.test(trimmed)) {
    kinds.add("contact");
  }
  if (/\b(campus)\b/i.test(lower) || /校区|校區|校园|校園/.test(trimmed)) {
    kinds.add("campus");
  }
  if (/\b(housing|dorm|dormitory)\b/i.test(lower) || /宿舍|住宿|住校/.test(trimmed)) {
    kinds.add("housing");
  }

  if (kinds.size === 0) {
    kinds.add("identity");
  }

  return kinds;
}

function buildSchoolFactSourceContent(): string {
  const lines = [`Institution: ${AMU_SCHOOL_FACTS.institutionName}`];
  if (AMU_SCHOOL_FACTS.address) lines.push(`Address: ${AMU_SCHOOL_FACTS.address}`);
  if (AMU_SCHOOL_FACTS.location) lines.push(`Location: ${AMU_SCHOOL_FACTS.location}`);
  if (AMU_SCHOOL_FACTS.phone) lines.push(`Phone: ${AMU_SCHOOL_FACTS.phone}`);
  if (AMU_SCHOOL_FACTS.email) lines.push(`Email: ${AMU_SCHOOL_FACTS.email}`);
  if (AMU_SCHOOL_FACTS.campusInfo) lines.push(`Campus: ${AMU_SCHOOL_FACTS.campusInfo}`);
  if (AMU_SCHOOL_FACTS.housingAvailable != null) {
    lines.push(
      `Housing: ${AMU_SCHOOL_FACTS.housingAvailable ? "Available" : "Not confirmed as available"}`,
    );
  }
  if (AMU_SCHOOL_FACTS.housingNote) lines.push(`Housing note: ${AMU_SCHOOL_FACTS.housingNote}`);
  return lines.join("\n");
}

export function answerSchoolFactQuestion(question: string): RagAnswerResult {
  const q = validateQuestion(question);
  const zh = isMostlyChinese(q);
  const requested = detectSchoolFactKinds(q);
  const lines: string[] = [
    zh
      ? `在这个产品里，AMU 指的是 ${AMU_SCHOOL_FACTS.institutionName}。`
      : `In this product, AMU means ${AMU_SCHOOL_FACTS.institutionName}.`,
  ];

  if (requested.has("address") || requested.has("location")) {
    if (AMU_SCHOOL_FACTS.address || AMU_SCHOOL_FACTS.location) {
      const addressOrLocation =
        AMU_SCHOOL_FACTS.address ?? AMU_SCHOOL_FACTS.location ?? "";
      lines.push(
        zh
          ? `我能从受控的 AMU 信息源确认的地址/位置是：${addressOrLocation}`
          : `The controlled AMU source confirms this address/location: ${addressOrLocation}`,
      );
    } else {
      lines.push(
        zh
          ? "我目前无法从受控的 AMU 信息源确认学校地址或位置，因此不能提供未验证的信息。"
          : "I cannot confirm AMU's address or location from controlled AMU sources, so I won't provide an unverified answer.",
      );
    }
  }

  if (requested.has("phone")) {
    lines.push(
      AMU_SCHOOL_FACTS.phone
        ? zh
          ? `我能确认的电话是：${AMU_SCHOOL_FACTS.phone}`
          : `The confirmed phone number is: ${AMU_SCHOOL_FACTS.phone}`
        : zh
          ? "我目前无法从受控的 AMU 信息源确认学校电话。"
          : "I cannot confirm an AMU phone number from controlled AMU sources.",
    );
  }

  if (requested.has("email")) {
    lines.push(
      AMU_SCHOOL_FACTS.email
        ? zh
          ? `我能确认的邮箱是：${AMU_SCHOOL_FACTS.email}`
          : `The confirmed email address is: ${AMU_SCHOOL_FACTS.email}`
        : zh
          ? "我目前无法从受控的 AMU 信息源确认学校邮箱。"
          : "I cannot confirm an AMU email address from controlled AMU sources.",
    );
  }

  if (
    requested.has("contact") &&
    !requested.has("phone") &&
    !requested.has("email")
  ) {
    if (AMU_SCHOOL_FACTS.phone || AMU_SCHOOL_FACTS.email) {
      const contactParts = [
        AMU_SCHOOL_FACTS.phone ? `phone: ${AMU_SCHOOL_FACTS.phone}` : null,
        AMU_SCHOOL_FACTS.email ? `email: ${AMU_SCHOOL_FACTS.email}` : null,
      ].filter((part): part is string => part != null);
      lines.push(
        zh
          ? `我能确认的联系方式是：${contactParts.join("；")}`
          : `The confirmed contact information is: ${contactParts.join("; ")}`,
      );
    } else {
      lines.push(
        zh
          ? "我目前无法从受控的 AMU 信息源确认学校联系方式。"
          : "I cannot confirm AMU contact information from controlled AMU sources.",
      );
    }
  }

  if (requested.has("campus")) {
    lines.push(
      AMU_SCHOOL_FACTS.campusInfo
        ? zh
          ? `我能确认的校区信息是：${AMU_SCHOOL_FACTS.campusInfo}`
          : `The confirmed campus information is: ${AMU_SCHOOL_FACTS.campusInfo}`
        : zh
          ? "我目前无法从受控的 AMU 信息源确认校区信息。"
          : "I cannot confirm campus information from controlled AMU sources.",
    );
  }

  if (requested.has("housing")) {
    if (AMU_SCHOOL_FACTS.housingAvailable == null && !AMU_SCHOOL_FACTS.housingNote) {
      lines.push(
        zh
          ? "我目前无法从受控的 AMU 信息源确认学校是否提供宿舍或住房。"
          : "I cannot confirm from controlled AMU sources whether the school provides housing or dorms.",
      );
    } else if (AMU_SCHOOL_FACTS.housingAvailable === true) {
      lines.push(
        zh
          ? `受控的 AMU 信息源显示学校提供住房。${AMU_SCHOOL_FACTS.housingNote ?? ""}`.trim()
          : `The controlled AMU source indicates the school provides housing. ${AMU_SCHOOL_FACTS.housingNote ?? ""}`.trim(),
      );
    } else if (AMU_SCHOOL_FACTS.housingAvailable === false) {
      lines.push(
        zh
          ? `受控的 AMU 信息源显示学校不提供住房。${AMU_SCHOOL_FACTS.housingNote ?? ""}`.trim()
          : `The controlled AMU source indicates the school does not provide housing. ${AMU_SCHOOL_FACTS.housingNote ?? ""}`.trim(),
      );
    } else if (AMU_SCHOOL_FACTS.housingNote) {
      lines.push(
        zh
          ? `我能确认的住房说明是：${AMU_SCHOOL_FACTS.housingNote}`
          : `The confirmed housing note is: ${AMU_SCHOOL_FACTS.housingNote}`,
      );
    }
  }

  const answer = lines.join("\n");
  return {
    question: q,
    answer,
    sources: [
      {
        id: "amu-school-facts",
        source: AMU_SCHOOL_FACTS.sourceLabel,
        chunkIndex: 0,
        content: buildSchoolFactSourceContent(),
        score: 1,
      },
    ],
  };
}

type LocalSearchCuisineProfile = {
  searchTermEn: string;
  searchTermZh: string;
  brandRefsEn?: string[];
  brandRefsZh?: string[];
};

function detectLocalSearchCuisine(question: string): LocalSearchCuisineProfile {
  const patterns: Array<{ pattern: RegExp; profile: LocalSearchCuisineProfile }> = [
    {
      pattern: /\b(hot\s*pot)\b|火锅|火鍋/i,
      profile: {
        searchTermEn: "hot pot",
        searchTermZh: "火锅",
        brandRefsEn: ["Haidilao", "Little Sheep"],
        brandRefsZh: ["海底捞", "小肥羊"],
      },
    },
    {
      pattern: /\b(bbq|barbecue|kbbq)\b|烧烤|燒烤/i,
      profile: {
        searchTermEn: "BBQ",
        searchTermZh: "烧烤",
      },
    },
    {
      pattern: /\b(ramen)\b|拉面|拉麵/i,
      profile: {
        searchTermEn: "ramen",
        searchTermZh: "拉面",
      },
    },
    {
      pattern: /\b(sushi)\b|寿司|壽司/i,
      profile: {
        searchTermEn: "sushi",
        searchTermZh: "寿司",
      },
    },
    {
      pattern: /\b(boba|milk\s*tea)\b|奶茶/i,
      profile: {
        searchTermEn: "boba",
        searchTermZh: "奶茶",
        brandRefsEn: ["Gong Cha", "Sharetea"],
        brandRefsZh: ["贡茶", "Sharetea"],
      },
    },
    {
      pattern: /\b(coffee|cafe)\b|咖啡/i,
      profile: {
        searchTermEn: "coffee",
        searchTermZh: "咖啡",
        brandRefsEn: ["Starbucks", "Peet's Coffee"],
        brandRefsZh: ["星巴克", "Peet's Coffee"],
      },
    },
    {
      pattern: /\b(dessert)\b|甜品|甜点|甜點/i,
      profile: {
        searchTermEn: "dessert",
        searchTermZh: "甜品",
      },
    },
    {
      pattern: /\b(burger)\b|汉堡|漢堡/i,
      profile: {
        searchTermEn: "burgers",
        searchTermZh: "汉堡",
        brandRefsEn: ["In-N-Out", "Shake Shack"],
        brandRefsZh: ["In-N-Out", "Shake Shack"],
      },
    },
    {
      pattern: /\b(brunch)\b|早午餐/i,
      profile: {
        searchTermEn: "brunch",
        searchTermZh: "早午餐",
      },
    },
  ];

  for (const { pattern, profile } of patterns) {
    if (pattern.test(question)) return profile;
  }

  return {
    searchTermEn: "restaurants",
    searchTermZh: "餐厅",
  };
}

function detectLocalSearchLocation(question: string): string | null {
  const knownLocationMatches = Array.from(
    question.matchAll(
      /Los Angeles|Alhambra|Irvine|Pasadena|San Gabriel|Monterey Park|Arcadia|Rowland Heights|Anaheim|Orange County|洛杉矶|洛杉磯|阿罕布拉|尔湾|爾灣|帕萨迪纳|帕薩迪納|圣盖博|聖蓋博|蒙特利公园|蒙特利公園|亚凯迪亚|亞凱迪亞|橙县|橙縣/gi,
    ),
  );
  const lastKnownLocation = knownLocationMatches.at(-1)?.[0];
  if (lastKnownLocation) return lastKnownLocation.trim();

  const englishAreaMatch = question.match(
    /\b(?:near|around|in)\s+([A-Za-z][A-Za-z\s-]{1,30})/i,
  );
  if (englishAreaMatch?.[1]) {
    return englishAreaMatch[1].trim().replace(/\s+(for|with|that|which)$/i, "");
  }

  return null;
}

function buildLocalSearchKeywordSuggestions(
  question: string,
  zh: boolean,
): string[] {
  const cuisine = detectLocalSearchCuisine(question);
  const location = detectLocalSearchLocation(question);
  const suggestions = zh
    ? location
      ? [`${location} ${cuisine.searchTermZh}`, `${location} ${cuisine.searchTermZh} 推荐`]
      : [`附近 ${cuisine.searchTermZh}`, `${cuisine.searchTermZh} 推荐`]
    : location
      ? [
          `${cuisine.searchTermEn} near ${location}`,
          `best ${cuisine.searchTermEn} in ${location}`,
        ]
      : [`${cuisine.searchTermEn} near me`, `best ${cuisine.searchTermEn} nearby`];

  return Array.from(new Set(suggestions.map((item) => item.trim()))).slice(0, 2);
}

function buildLocalSearchReferenceLine(question: string, zh: boolean): string | null {
  const cuisine = detectLocalSearchCuisine(question);
  const refs = zh ? cuisine.brandRefsZh : cuisine.brandRefsEn;
  if (refs == null || refs.length === 0) return null;
  return zh
    ? `如果你只是想先有个方向，像 ${refs.join("、")} 这类比较知名的品牌可以作为参考，但这不代表它们就在你附近。`
    : `If you want a rough starting point, well-known chains like ${refs.join(", ")} can be useful reference points, but that does not mean they are nearby.`;
}

export function answerLocalSearchQuestion(question: string): RagAnswerResult {
  const q = validateQuestion(question);
  const zh = isMostlyChinese(q);
  const keywords = buildLocalSearchKeywordSuggestions(q, zh);
  const referenceLine = buildLocalSearchReferenceLine(q, zh);

  const lines = zh
    ? [
        "我这边没有实时的本地商户数据，没办法保证推荐是最新或离你最近的。",
        `建议你直接在 Google Maps 或 Yelp 搜索 "${keywords[0]}"${keywords[1] ? `，也可以试试 "${keywords[1]}"` : ""}，这样会比我硬猜更靠谱。`,
        referenceLine,
        "如果你告诉我你更想吃什么口味、预算大概多少，或者希望控制在多远的距离内，我可以继续帮你把搜索词缩小一点。",
      ]
    : [
        "I don't have live local business listings, so I can't promise anything is the newest or actually closest to you.",
        `Your best bet is to search Google Maps or Yelp for "${keywords[0]}"${keywords[1] ? ` or "${keywords[1]}"` : ""}, which will be much more reliable than me guessing.`,
        referenceLine,
        "If you tell me the vibe, cuisine, budget, or how far you're willing to go, I can help narrow the search terms down.",
      ];

  return {
    question: q,
    answer: lines.filter((line): line is string => Boolean(line)).join("\n"),
    sources: [],
  };
}

export function buildTransientAssistantFailureReply(question: string): string {
  return isMostlyChinese(question)
    ? "刚刚好像出了点问题，我再帮你看一下"
    : "Something seems to have gone wrong just now. Let me check that again for you.";
}

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  return new OpenAI({ apiKey });
}

export async function answerGeneralQuestion(
  question: string,
  rawHistory?: unknown,
  options?: AnswerGeneralQuestionOptions,
): Promise<RagAnswerResult> {
  const q = validateQuestion(question);
  const history = sanitizeChatHistory(rawHistory);
  const realityCheckReply = buildGeneralRealityCheckReply(q, history);
  if (realityCheckReply != null) {
    return {
      question: q,
      answer: realityCheckReply,
      sources: [],
    };
  }
  const client = getOpenAiClient();
  const identityBlock = formatIdentityContextForPrompt(options?.identityContext);
  const historyPrefix =
    history != null && history.length > 0
      ? `Continue the same conversation topic using the recent context below. Resolve omitted references before answering.\n\n${formatRecentConversationBlock(history)}\n\n`
      : "";

  const completion = await withOpenAiRetry("answerGeneralQuestion", () =>
    client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildGeneralSystemPrompt(q, options?.identityContext) },
      {
        role: "user",
        content: `${historyPrefix}${identityBlock}\n\nCurrent user message:\n${q}`,
      },
    ],
    temperature: 0.7,
    }),
  );

  return {
    question: q,
    answer: completion.choices[0]?.message?.content?.trim() ?? "(no response)",
    sources: [],
  };
}

export async function answerStudentRecordQuestionFromFacts(
  question: string,
  studentFacts: string,
  identityContext?: IdentityContext | null,
): Promise<RagAnswerResult> {
  const q = validateQuestion(question);
  const client = getOpenAiClient();
  const facts = studentFacts.trim();
  const identityBlock = formatIdentityContextForPrompt(identityContext);

  const completion = await withOpenAiRetry("answerStudentRecordQuestionFromFacts", () =>
    client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildStudentRecordSystemPrompt(q, identityContext) },
      {
        role: "user",
        content: `${identityBlock}

VERIFIED STUDENT RECORD FACTS:
${facts}

USER QUESTION:
${q}`,
      },
    ],
    temperature: 0.2,
    }),
  );

  return {
    question: q,
    answer: completion.choices[0]?.message?.content?.trim() ?? "(no response)",
    sources: [],
  };
}

export async function answerGraduationQuestion(
  question: string,
  rawHistory?: unknown,
  options?: AnswerGraduationQuestionOptions,
): Promise<RagAnswerResult> {
  const q = validateQuestion(question);
  const history = sanitizeChatHistory(rawHistory);
  const client = getOpenAiClient();
  const chunks = await getKnowledgeChunks();

  const retrievalQuery = await rewriteQuestionForRetrieval(
    client,
    q,
    history,
    "strict",
    undefined,
  );

  const embedRes = await withOpenAiRetry("answerGraduationQuestion.embedding", () =>
    client.embeddings.create({
    model: "text-embedding-3-small",
    input: retrievalQuery,
    }),
  );
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

  const historyPrefix =
    history != null && history.length > 0
      ? `${formatRecentConversationBlock(history)}\n\n`
      : "";
  const evaluationBlock = options?.graduationEvaluation?.trim() ?? "No evaluation available.";
  const identityBlock = formatIdentityContextForPrompt(options?.identityContext);
  const contextBlock = formatRetrievedDocumentContextBlock(top);
  const completion = await withOpenAiRetry("answerGraduationQuestion.chat", () =>
    client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: buildGraduationEvaluationSystemPrompt(q, options?.identityContext),
      },
      {
        role: "user",
        content: `${historyPrefix}${identityBlock}

STRUCTURED GRADUATION EVALUATION:
${evaluationBlock}

RETRIEVED AMU DOCUMENT CONTEXT:
${contextBlock}

USER QUESTION:
${q}`,
      },
    ],
    temperature: 0.2,
    }),
  );

  return {
    question: q,
    answer: completion.choices[0]?.message?.content?.trim() ?? "(no response)",
    sources: top.map(({ chunk, score }) => toRetrieved(chunk, score)),
  };
}

/**
 * Grounded AMU answer path for policy-only and mixed student+policy questions.
 * @param rawHistory - Optional recent turns; sanitized (capped, invalid entries dropped).
 */
export async function answerAmuQuestion(
  question: string,
  rawHistory?: unknown,
  options?: AnswerAmuQuestionOptions,
): Promise<RagAnswerResult> {
  const q = validateQuestion(question);
  const history = sanitizeChatHistory(rawHistory);
  const pipeline = options?.pipeline ?? "policy";
  const client = getOpenAiClient();
  const chunks = await getKnowledgeChunks();

  const retrievalQuery = await rewriteQuestionForRetrieval(
    client,
    q,
    history,
    "strict",
    undefined,
  );

  const embedRes = await withOpenAiRetry("answerAmuQuestion.embedding", () =>
    client.embeddings.create({
    model: "text-embedding-3-small",
    input: retrievalQuery,
    }),
  );
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

  if (top.length === 0) {
    return {
      question: q,
      answer: "I cannot find this in AMU documents.",
      sources: [],
    };
  }

  const studentContextBlock = formatStudentContextBlock(options?.studentContext);
  const contextBlock = formatRetrievedDocumentContextBlock(top);
  const identityBlock = formatIdentityContextForPrompt(options?.identityContext);
  const historyPrefix =
    history != null && history.length > 0
      ? `${formatRecentConversationBlock(history)}\n\n`
      : "";
  const userPreamble =
    pipeline === "mixed"
      ? `${historyPrefix}${identityBlock}

VERIFIED STUDENT RECORD FACTS:
${studentContextBlock}

RETRIEVED AMU DOCUMENT CONTEXT:
${contextBlock}

USER QUESTION:
${q}`
      : `${historyPrefix}${identityBlock}

RETRIEVED AMU DOCUMENT CONTEXT:
${contextBlock}

USER QUESTION:
${q}`;

  console.debug("[ai/ask] retrieval context prepared", {
    pipeline,
    hasStudentContext: pipeline === "mixed",
    retrievedSourceCount: top.length,
    topRetrievedSource: top[0]?.chunk.source ?? null,
  });

  const completion = await withOpenAiRetry("answerAmuQuestion.chat", () =>
    client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: buildGroundedAcademicSystemPrompt(
          q,
          pipeline,
          options?.identityContext,
        ),
      },
      { role: "user", content: userPreamble },
    ],
    temperature: 0.2,
    }),
  );

  return {
    question: q,
    answer: completion.choices[0]?.message?.content?.trim() ?? "(no response)",
    sources: top.map(({ chunk, score }) => toRetrieved(chunk, score)),
  };
}

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
import {
  CHAT_MODEL,
  assertChatModelForCompletions,
  createOpenAiEmbeddingVectors,
  EMBEDDING_MODEL,
  requireOpenAiClient,
} from "../config/openai.js";
import {
  buildRetrievalQueryVariants,
  detectCatalogProgramHint,
  isWeakCatalogRetrieval,
  rerankCatalogChunksWithKeywordBoosts,
  rankCatalogChunksByEmbeddingMaxWithHint,
  selectCatalogChunksForContext,
  type CatalogRetrievalDebug,
} from "../lib/catalogRetrieval.js";
import { env } from "../config/env.js";

const MAX_QUESTION_CHARS = 2000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_USER_TURNS = 2;
const MAX_HISTORY_CONTENT_CHARS = 500;
const MAX_REWRITE_OUTPUT_CHARS = 320;
const OPENAI_MAX_ATTEMPTS = 2;

type RagIntent = "direct" | "strict" | "guidance" | "out_of_scope";

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
  program?: "DAHM" | "MAHM" | null;
  sectionTitle?: string;
  subsectionTitle?: string;
  pageStart?: number;
  pageEnd?: number;
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
  catalogEvidence?: RetrievedChunk[];
  weakRetrieval?: boolean;
  identityContext?: IdentityContext | null;
};

export type UnifiedEvidenceInput = {
  question: string;
  studentEvidence?: string | null;
  catalogEvidence?: RetrievedChunk[];
  courseEvidence?: string | null;
  financeEvidence?: string | null;
  numericSources?: string[];
  identityContext?: IdentityContext | null;
  history?: unknown;
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
      const isEmbeddingCall = label.toLowerCase().includes("embedding");
      console.log("[AI CALL]", { label });
      if (isEmbeddingCall) {
        console.log("using embedding model:", EMBEDDING_MODEL);
      } else {
        assertChatModelForCompletions(CHAT_MODEL);
        console.log("using chat model:", CHAT_MODEL);
      }
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

function logGptResponseSource(): void {
  console.log("[AI RESPONSE SOURCE]: GPT");
}

let cachedChunks: KnowledgeChunkRow[] | null = null;

const DUAL_MODE_SYSTEM_PROMPT = `You are AMU AI Assist.
Use retrieved AMU catalog/context and student database evidence when available.
Do not invent official AMU facts.
If evidence is missing, state what is missing.
Answer in plain text, not Markdown.
Do not use headings, bullet lists, bold markers, or numbered lists.
Use natural paragraphs.
Use at most one neutral emoji if helpful.

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

### NUMERIC SOURCE DISCIPLINE

When giving any number (credits, missing credits, required credits, charges, payments, balance, due amounts):
- use only numbers that appear in the provided evidence blocks
- do not invent or approximate missing values
- if a value is missing in evidence, say it is unavailable in verified evidence
- when a number comes from graduation evaluation, present it as system evaluation output
- if missing credits are not provided by graduation evaluation, compute only when both required credits and completed credits are explicitly provided in evidence
- if required credits are unavailable and missing credits are unavailable, do not compute missing credits

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

export function plainTextFormatter(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getKnowledgeChunks(): Promise<KnowledgeChunkRow[]> {
  if (cachedChunks !== null) return cachedChunks;
  cachedChunks = await loadKnowledgeChunks();
  console.log("[RAG] chunk count", cachedChunks.length);
  if (cachedChunks.length === 0) {
    console.warn("[RAG] warning: knowledge chunk count is 0");
  }
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

function formatRetrievedChunkContextBlock(items: RetrievedChunk[]): string {
  if (items.length === 0) {
    return "No retrieved AMU handbook or policy excerpts were available.";
  }
  return items
    .map((chunk) => {
      const metaParts = [
        chunk.program && `Program: ${chunk.program}`,
        chunk.sectionTitle && `Section: ${chunk.sectionTitle}`,
        chunk.subsectionTitle && `Subsection: ${chunk.subsectionTitle}`,
        chunk.pageStart != null &&
          `Pages: ${chunk.pageStart}${
            chunk.pageEnd != null && chunk.pageEnd !== chunk.pageStart
              ? `–${chunk.pageEnd}`
              : ""
          }`,
        `Source file: ${chunk.source}`,
        `Chunk: ${chunk.chunkIndex}`,
        `Match score: ${chunk.score.toFixed(3)}`,
      ].filter(Boolean);
      return `Source: ${chunk.source}\nContent: [${metaParts.join(" | ")}]\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
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
      model: CHAT_MODEL,
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
    .map(({ chunk, score }) => {
      const metaParts = [
        chunk.program && `Program: ${chunk.program}`,
        chunk.sectionTitle && `Section: ${chunk.sectionTitle}`,
        chunk.subsectionTitle && `Subsection: ${chunk.subsectionTitle}`,
        chunk.pageStart != null &&
          `Pages: ${chunk.pageStart}${
            chunk.pageEnd != null && chunk.pageEnd !== chunk.pageStart
              ? `–${chunk.pageEnd}`
              : ""
          }`,
        `Source file: ${chunk.source}`,
        `Chunk: ${chunk.chunkIndex}`,
        `Match score: ${score.toFixed(3)}`,
      ].filter(Boolean);
      return `Source: ${chunk.source}\nContent: [${metaParts.join(" | ")}]\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
}

function toRetrieved(chunk: KnowledgeChunkRow, score: number): RetrievedChunk {
  return {
    id: chunk.id,
    source: chunk.source,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    score,
    ...(chunk.program != null ? { program: chunk.program } : {}),
    ...(chunk.sectionTitle ? { sectionTitle: chunk.sectionTitle } : {}),
    ...(chunk.subsectionTitle ? { subsectionTitle: chunk.subsectionTitle } : {}),
    ...(chunk.pageStart != null ? { pageStart: chunk.pageStart } : {}),
    ...(chunk.pageEnd != null ? { pageEnd: chunk.pageEnd } : {}),
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

function buildGroundedAcademicSystemPrompt(
  question: string,
  pipeline: GroundedAmuPipeline,
  identityContext?: IdentityContext | null,
  options?: { weakRetrieval?: boolean },
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

  const advisorVoice = `You sound like a knowledgeable AMU academic advisor: warm, clear, and direct.
When the catalog excerpts clearly support an answer, state it confidently and cite the catalog naturally (for example "Based on the MAHM 2025–26 catalog..." or "According to the DAHM catalog section on..."). Do not apologize or say you need "official documents" when those excerpts already contain the rule.
If the question could differ between DAHM and MAHM and the excerpts or question do not pin down a single program, ask one short clarifying question or briefly address both programs only when each is supported by the excerpts.
If the excerpts do not contain the rule, say plainly that this point is not found in the retrieved catalog text—do not guess or invent numbers, deadlines, or policies.
When retrieval quality is uncertain, be explicit about what is and is not shown in the excerpts.
For official AMU policy facts, rely only on the provided retrieved context.`;

  const weakHint =
    options?.weakRetrieval === true
      ? `The retrieved excerpts may be only loosely related. If they do not clearly answer the question, say the catalog passage was not found rather than inferring.`
      : "";

  return `${DUAL_MODE_SYSTEM_PROMPT}

${pipelineLine}
${advisorVoice}
${weakHint}
If the context fully answers the question, answer clearly and directly.
If the context only partially answers, explicitly separate what is confirmed and what is missing.
If the detail is not found in retrieved context, say exactly: "I do not see this detail in the available AMU catalog context".
Never hallucinate AMU policy, credits, tuition, or rules.
When reporting numbers, cite them from evidence wording, such as completed credits from student record and missing credits from system graduation evaluation.
If required credits are missing from catalog context and missing credits are not in graduation evaluation, do not compute missing credits.
For policy-only questions, never claim "from your record".
If student-specific confirmation is missing for mixed questions, say "I don't have enough information from your records to confirm this."
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
When reporting credits, balance, charges, payments, or due amounts, use only values explicitly present in evidence.
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
): boolean {
  if (intent !== "guidance" || guidanceSubtype === undefined) return false;
  if (shouldSuggestTechnicalContact(question, intent)) return false;

  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();

  if (guidanceSubtype === "academic") {
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
    shouldSuggestAcademicContact(question, intent, guidanceSubtype)
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

export async function answerSchoolFactQuestion(
  question: string,
): Promise<RagAnswerResult> {
  const q = validateQuestion(question);
  const client = getOpenAiClient();
  const requested = [...detectSchoolFactKinds(q)].join(", ");
  const response = await withOpenAiRetry("answerSchoolFactQuestion", () =>
    client.responses.create({
      model: CHAT_MODEL,
      input: `You are answering AMU school-fact questions.
Use only the controlled AMU facts below. If something is not present, explicitly say you cannot confirm it from controlled AMU facts.
Keep the response concise and helpful.

User question: ${q}
Requested fact kinds: ${requested}

Controlled AMU facts:
${buildSchoolFactSourceContent()}`,
    }),
  );
  const answer = response.output_text?.trim() ?? "(no response)";
  logGptResponseSource();
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

export async function answerLocalSearchQuestion(
  question: string,
): Promise<RagAnswerResult> {
  const q = validateQuestion(question);
  const zh = isMostlyChinese(q);
  const keywords = buildLocalSearchKeywordSuggestions(q, zh);
  const referenceLine = buildLocalSearchReferenceLine(q, zh);
  const client = getOpenAiClient();
  const response = await withOpenAiRetry("answerLocalSearchQuestion", () =>
    client.responses.create({
      model: CHAT_MODEL,
      input: `User question: ${q}

Answer as a helpful assistant for local place discovery.
- Do not claim real-time local search results.
- Do not invent specific nearby businesses as factual.
- Suggest practical search steps (e.g., Google Maps/Yelp) and useful keywords.
- Keep it concise and conversational.

Suggested search keywords:
- ${keywords.join("\n- ")}

Reference hint (optional):
${referenceLine ?? "None"}`,
    }),
  );
  const answer = response.output_text?.trim() ?? "(no response)";
  logGptResponseSource();

  return {
    question: q,
    answer,
    sources: [],
  };
}

function getOpenAiClient(): OpenAI {
  return requireOpenAiClient();
}

export async function answerGeneralQuestion(
  question: string,
  rawHistory?: unknown,
  options?: AnswerGeneralQuestionOptions,
): Promise<RagAnswerResult> {
  const q = validateQuestion(question);
  const history = sanitizeChatHistory(rawHistory);
  const client = getOpenAiClient();
  const identityBlock = formatIdentityContextForPrompt(options?.identityContext);
  const historyPrefix =
    history != null && history.length > 0
      ? `Continue the same conversation topic using the recent context below. Resolve omitted references before answering.\n\n${formatRecentConversationBlock(history)}\n\n`
      : "";

  const completion = await withOpenAiRetry("answerGeneralQuestion", () =>
    client.chat.completions.create({
    model: CHAT_MODEL,
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

  const answer = completion.choices[0]?.message?.content?.trim() ?? "(no response)";
  logGptResponseSource();
  return {
    question: q,
    answer,
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
    model: CHAT_MODEL,
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

  const answer = completion.choices[0]?.message?.content?.trim() ?? "(no response)";
  logGptResponseSource();
  return {
    question: q,
    answer,
    sources: [],
  };
}

async function retrieveChunksForCatalog(args: {
  client: OpenAI;
  question: string;
  history: ChatHistoryItem[] | undefined;
}): Promise<{
  top: Array<{ chunk: KnowledgeChunkRow; score: number }>;
  retrievalQuery: string;
  debug: CatalogRetrievalDebug;
  weakRetrieval: boolean;
}> {
  const chunks = await getKnowledgeChunks();
  const retrievalQuery = await rewriteQuestionForRetrieval(
    args.client,
    args.question,
    args.history,
    "strict",
    undefined,
  );
  const programHint = detectCatalogProgramHint(args.question);
  const { variants, expansion, normalizedRewrite } = buildRetrievalQueryVariants({
    originalQuestion: args.question,
    rewrittenRetrievalQuery: retrievalQuery,
  });

  const embeddingVectors = await withOpenAiRetry(
    "retrieveChunksForCatalog.embedding",
    () => createOpenAiEmbeddingVectors(variants),
  );

  const ranked = rankCatalogChunksByEmbeddingMaxWithHint(
    chunks,
    embeddingVectors,
    programHint,
    cosineSimilarity,
  );
  const reranked = rerankCatalogChunksWithKeywordBoosts(ranked, args.question);

  const { selected, maxScore } = selectCatalogChunksForContext(reranked, {
    topK: 12,
    maxChunks: 8,
    relativeFloor: 0.74,
  });

  const debug: CatalogRetrievalDebug = {
    originalUserQuery: args.question,
    normalizedRetrievalQuery: normalizedRewrite,
    embeddingQueryVariants: variants,
    programHint,
    topChunks: selected.map(({ chunk, score }) => ({
      id: chunk.id,
      source: chunk.source,
      program: chunk.program ?? null,
      sectionTitle: chunk.sectionTitle,
      subsectionTitle: chunk.subsectionTitle,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      score,
    })),
    maxScore,
  };

  const weakRetrieval = isWeakCatalogRetrieval(maxScore);

  console.log("[rag/catalog retrieval]", {
    originalUserQuery: debug.originalUserQuery,
    normalizedRetrievalQuery: debug.normalizedRetrievalQuery,
    expansionSnippet: expansion.slice(0, 240),
    programHint,
    embeddingVariantCount: variants.length,
    maxScore: Number(maxScore.toFixed(4)),
    weakRetrieval,
    topChunks: debug.topChunks,
  });
  if (env.nodeEnv === "development") {
    console.log("[RAG] query", args.question);
  }
  console.log("[RAG] query", args.question);
  console.log("[RAG] top matches", selected.slice(0, 5).map((row) => ({
    source: row.chunk.source,
    score: Number(row.score.toFixed(4)),
    preview: row.chunk.content.slice(0, 160),
  })));

  return { top: selected, retrievalQuery, debug, weakRetrieval };
}

export async function answerEvidenceDrivenQuestion(
  input: UnifiedEvidenceInput,
): Promise<RagAnswerResult> {
  const q = validateQuestion(input.question);
  const history = sanitizeChatHistory(input.history);
  const catalogRequested = input.catalogEvidence != null;
  const catalogEvidence = input.catalogEvidence ?? [];
  const studentEvidence = input.studentEvidence?.trim() ?? "";
  const courseEvidence = input.courseEvidence?.trim() ?? "";
  const financeEvidence = input.financeEvidence?.trim() ?? "";
  const numericSources = input.numericSources ?? [];
  const hasStudentEvidence = studentEvidence.length > 0;
  const hasCourseEvidence = courseEvidence.length > 0;
  const hasFinanceEvidence = financeEvidence.length > 0;
  const pipeline: GroundedAmuPipeline =
    hasStudentEvidence || hasCourseEvidence || hasFinanceEvidence ? "mixed" : "policy";
  const mergedStudentContext =
    [studentEvidence, courseEvidence, financeEvidence]
      .filter((v) => v.length > 0)
      .join("\n\n") || null;
  const numericSourceBlock =
    numericSources.length > 0
      ? `Numeric source labels:\n${numericSources.map((item) => `- ${item}`).join("\n")}`
      : "";
  const mergedContextWithNumericSources =
    numericSourceBlock.length > 0
      ? [mergedStudentContext, numericSourceBlock].filter((v) => v != null).join("\n\n")
      : mergedStudentContext;

  if (!catalogRequested) {
    if (!hasStudentEvidence && !hasCourseEvidence && !hasFinanceEvidence) {
      return answerGeneralQuestion(q, history, { identityContext: input.identityContext });
    }
    return answerStudentRecordQuestionFromFacts(
      q,
      mergedContextWithNumericSources ?? "No verified student evidence available.",
      input.identityContext,
    );
  }

  return answerAmuQuestion(q, history, {
    pipeline,
    studentContext: mergedContextWithNumericSources,
    catalogEvidence,
    identityContext: input.identityContext,
  });
}

export async function retrieveCatalogEvidenceForQuestion(
  question: string,
  rawHistory?: unknown,
): Promise<{ chunks: RetrievedChunk[]; weakRetrieval: boolean }> {
  const q = validateQuestion(question);
  const history = sanitizeChatHistory(rawHistory);
  const client = getOpenAiClient();
  const { top, weakRetrieval } = await retrieveChunksForCatalog({
    client,
    question: q,
    history,
  });
  return {
    chunks: top.map(({ chunk, score }) => toRetrieved(chunk, score)),
    weakRetrieval,
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

  const { top, debug, weakRetrieval } = await retrieveChunksForCatalog({
    client,
    question: q,
    history,
  });

  const historyPrefix =
    history != null && history.length > 0
      ? `${formatRecentConversationBlock(history)}\n\n`
      : "";
  const evaluationBlock = options?.graduationEvaluation?.trim() ?? "No evaluation available.";
  const identityBlock = formatIdentityContextForPrompt(options?.identityContext);
  const contextBlock = formatRetrievedDocumentContextBlock(top);
  console.log("[rag/answer mode]", {
    path: "graduation_question",
    answerMode: "catalog_rag_plus_evaluation",
    maxRetrievalScore: debug.maxScore,
    weakRetrieval,
  });
  const completion = await withOpenAiRetry("answerGraduationQuestion.chat", () =>
    client.chat.completions.create({
    model: CHAT_MODEL,
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

  const answer = completion.choices[0]?.message?.content?.trim() ?? "(no response)";
  logGptResponseSource();
  return {
    question: q,
    answer,
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
  const providedCatalogEvidence = options?.catalogEvidence ?? [];
  const hasProvidedCatalogEvidence = providedCatalogEvidence.length > 0;
  const retrieval =
    hasProvidedCatalogEvidence
      ? null
      : await retrieveChunksForCatalog({
          client,
          question: q,
          history,
        });
  const retrievedTop = retrieval?.top ?? [];
  const retrievedSources = hasProvidedCatalogEvidence
    ? providedCatalogEvidence
    : retrievedTop.map(({ chunk, score }) => toRetrieved(chunk, score));
  const debug: CatalogRetrievalDebug = retrieval?.debug ?? {
    originalUserQuery: q,
    normalizedRetrievalQuery: q,
    embeddingQueryVariants: [],
    programHint: null,
    topChunks: retrievedSources.slice(0, 5).map((chunk) => ({
      id: chunk.id,
      source: chunk.source,
      program: chunk.program,
      sectionTitle: chunk.sectionTitle,
      subsectionTitle: chunk.subsectionTitle,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      score: chunk.score,
    })),
    maxScore: retrievedSources[0]?.score ?? 0,
  };
  const weakRetrieval =
    options?.weakRetrieval ??
    retrieval?.weakRetrieval ??
    isWeakCatalogRetrieval(debug.maxScore);

  const studentContextBlock = formatStudentContextBlock(options?.studentContext);
  const contextBlock = hasProvidedCatalogEvidence
    ? formatRetrievedChunkContextBlock(retrievedSources)
    : formatRetrievedDocumentContextBlock(retrievedTop);
  if (retrievedSources.length === 0) {
    const fallback =
      `I do not see this detail in the available AMU catalog context. ` +
      `If you want, I can help refine the question with the exact program, catalog year, or course code so I can check again.`;
    return {
      question: q,
      answer: fallback,
      sources: retrievedSources,
    };
  }
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
    retrievedSourceCount: retrievedSources.length,
    topRetrievedSource: retrievedSources[0]?.source ?? null,
    maxRetrievalScore: debug.maxScore,
    weakRetrieval,
    programHint: debug.programHint,
  });

  console.log("[rag/answer mode]", {
    path: "amu_policy_or_mixed",
    answerMode: weakRetrieval ? "catalog_rag_weak_retrieval" : "catalog_rag",
    pipeline,
    maxRetrievalScore: debug.maxScore,
    weakRetrieval,
  });

  const completion = await withOpenAiRetry("answerAmuQuestion.chat", () =>
    client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: "system",
        content: buildGroundedAcademicSystemPrompt(
          q,
          pipeline,
          options?.identityContext,
          { weakRetrieval },
        ),
      },
      { role: "user", content: userPreamble },
    ],
    temperature: 0.2,
    }),
  );

  const answer = completion.choices[0]?.message?.content?.trim() ?? "(no response)";
  logGptResponseSource();
  return {
    question: q,
    answer,
    sources: retrievedSources,
  };
}

import type { StudentProfilePayload } from "../types/studentProfile.js";

export type ConversationFactLanguage = "en" | "zh";

export type ConversationFacts = {
  statedName?: string;
  preferredLanguage?: ConversationFactLanguage;
};

export type SafeLoggedInUserContext = {
  displayName?: string;
  studentId?: string;
  program?: string;
};

export type IdentityContext = {
  conversationFacts?: ConversationFacts;
  safeProfile?: SafeLoggedInUserContext | null;
};

const MAX_NAME_LENGTH = 80;

function isMostlyChinese(text: string): boolean {
  const hanCount = text.match(/[\u4E00-\u9FFF]/g)?.length ?? 0;
  if (hanCount === 0) return false;
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0;
  return hanCount > latinCount || (latinCount === 0 && hanCount >= 2);
}

function sanitizeShortText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed === "" || trimmed.length > maxLength) return undefined;
  return trimmed;
}

export function sanitizeConversationFacts(raw: unknown): ConversationFacts | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const statedName = sanitizeShortText(rec.statedName, MAX_NAME_LENGTH);
  const preferredLanguage =
    rec.preferredLanguage === "en" || rec.preferredLanguage === "zh"
      ? rec.preferredLanguage
      : undefined;

  if (statedName == null && preferredLanguage == null) return undefined;
  return {
    ...(statedName ? { statedName } : {}),
    ...(preferredLanguage ? { preferredLanguage } : {}),
  };
}

export function buildSafeLoggedInUserContext(
  studentId: string,
  profile: StudentProfilePayload | null,
): SafeLoggedInUserContext {
  const displayName = sanitizeShortText(profile?.fullName, MAX_NAME_LENGTH);
  const sanitizedStudentId = sanitizeShortText(studentId, 40);
  const program = sanitizeShortText(profile?.program, 40);
  return {
    ...(displayName ? { displayName } : {}),
    ...(sanitizedStudentId ? { studentId: sanitizedStudentId } : {}),
    ...(program ? { program } : {}),
  };
}

function formatLanguageLabel(language: ConversationFactLanguage | undefined): string {
  if (language === "zh") return "Simplified Chinese";
  if (language === "en") return "English";
  return "Unavailable";
}

export function formatIdentityContextBlock(
  identityContext: IdentityContext | null | undefined,
): string {
  const conversationFacts = identityContext?.conversationFacts;
  const safeProfile = identityContext?.safeProfile;

  return `Identity Context
- Use explicit user-provided conversation facts only for self-referential questions about the user.
- Priority order for self-referential questions: explicit conversation facts > safe logged-in profile context > cannot confirm.
- Never infer gender or any other sensitive trait from names, language, profile fields, or stereotypes.
- Explicit Conversation Facts:
  - Stated Name: ${conversationFacts?.statedName ?? "Unavailable"}
  - Preferred Language: ${formatLanguageLabel(conversationFacts?.preferredLanguage)}
- Safe Logged-in Profile Context:
  - Display Name: ${safeProfile?.displayName ?? "Unavailable"}
  - Student ID: ${safeProfile?.studentId ?? "Unavailable"}
  - Program: ${safeProfile?.program ?? "Unavailable"}`;
}

type SelfReferentialQuestionKind = "name" | "gender";

function detectSelfReferentialQuestionKind(
  question: string,
): SelfReferentialQuestionKind | null {
  const trimmed = question.trim();
  const lower = trimmed.toLowerCase();

  if (
    /\b(what('?s| is)\s+my\s+name|do\s+you\s+remember\s+my\s+name|who\s+am\s+i)\b/i.test(
      lower,
    ) ||
    /我叫什么|你还记得我的名字吗|你记得我叫什么|我的名字是什么/.test(trimmed)
  ) {
    return "name";
  }

  if (
    /\b(do\s+you\s+know\s+my\s+gender|am\s+i\s+(male|female)|what\s+gender\s+am\s+i)\b/i.test(
      lower,
    ) ||
    /我是男是女|你知道我的性别吗|我的性别是什么/.test(trimmed)
  ) {
    return "gender";
  }

  return null;
}

export function answerSelfReferentialQuestion(
  question: string,
  identityContext: IdentityContext | null | undefined,
): string | null {
  const kind = detectSelfReferentialQuestionKind(question);
  if (kind == null) return null;

  const zh = isMostlyChinese(question);
  const explicitName = identityContext?.conversationFacts?.statedName?.trim();
  const displayName = identityContext?.safeProfile?.displayName?.trim();

  if (kind === "name") {
    if (explicitName) {
      return zh
        ? `你之前在这次对话里说你叫 ${explicitName}。`
        : `Earlier in this chat, you said your name is ${explicitName}.`;
    }
    if (displayName) {
      return zh
        ? `我没有在当前对话里看到你明确说过名字，但你的账户显示名称是 ${displayName}。`
        : `I don't see an explicit name stated earlier in this chat, but your account display name is ${displayName}.`;
    }
    return zh
      ? "我目前无法确认你的名字，因为当前对话里没有明确的自我介绍，而且也没有可用的账户显示名称。"
      : "I can't confirm your name from this chat because I don't have an explicit introduction in the current conversation or an available account display name.";
  }

  return zh
    ? "我不知道你的性别。我不会根据名字推断这类敏感信息；如果你想让我知道，需要你自己明确说明。"
    : "I don't know your gender. I won't infer sensitive information like that from a name; I can only rely on what you explicitly state.";
}

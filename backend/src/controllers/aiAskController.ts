import type { Request, Response } from "express";
import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";
import {
  RagQuestionValidationError,
  answerGeneralQuestion,
  answerAmuQuestion,
  answerGraduationQuestion,
  answerSchoolFactQuestion,
  answerStudentRecordQuestionFromFacts,
  planShortConversationMemory,
} from "../services/ragService.js";
import {
  classifyStudentAiIntent,
  detectGraduationEligibilityQuestion,
} from "../services/studentAiQuestionRouter.js";
import {
  evaluateStudentGraduation,
  formatGraduationEvaluationFacts,
} from "../services/graduationEvaluationService.js";
import {
  answerDeterministicStudentRecordQuestion,
  buildStudentRecordFactsForQuestion,
} from "../services/studentRecordAiService.js";
import { getLegacyStudentProfile } from "../services/studentProfileService.js";
import {
  answerSelfReferentialQuestion,
  buildSafeLoggedInUserContext,
  sanitizeConversationFacts,
} from "../services/conversationFactsService.js";

function readQuestion(req: Request): unknown {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return undefined;
  return body.question;
}

/**
 * POST /api/ai/ask
 * Body: {
 *   question: string,
 *   history?: { role: 'user' | 'assistant', content: string }[],
 *   conversationFacts?: { statedName?: string, preferredLanguage?: 'en' | 'zh' }
 * }
 */
export async function postAiAsk(req: Request, res: Response): Promise<void> {
  const rawAuthorization = req.headers.authorization?.trim() ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(rawAuthorization);
  const hasAuthorizationHeader = rawAuthorization.length > 0;
  const hasBearerToken = (bearerMatch?.[1]?.trim() ?? "") !== "";

  console.debug("[ai/ask] request entered", {
    hasAuthorizationHeader,
    hasBearerToken,
  });

  const authStudent = verifyStudentAccessToken(req.headers.authorization);
  if (authStudent == null) {
    console.debug("[ai/ask] authentication required");
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const body = req.body as Record<string, unknown> | null | undefined;
  const q = readQuestion(req);
  if (typeof q !== "string") {
    res.status(400).json({
      error: "question is required and must be a string",
    });
    return;
  }

  if (
    body != null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body, "history") &&
    body.history != null &&
    !Array.isArray(body.history)
  ) {
    res.status(400).json({ error: "history must be an array when provided" });
    return;
  }

  const rawHistory =
    body != null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body, "history")
      ? body.history
      : undefined;
  const rawConversationFacts =
    body != null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body, "conversationFacts")
      ? body.conversationFacts
      : undefined;

  try {
    const [profile, conversationFacts] = await Promise.all([
      getLegacyStudentProfile(authStudent.studentId),
      Promise.resolve(sanitizeConversationFacts(rawConversationFacts)),
    ]);
    const identityContext = {
      conversationFacts,
      safeProfile: buildSafeLoggedInUserContext(authStudent.studentId, profile),
    };
    const selfReferentialAnswer = answerSelfReferentialQuestion(
      q,
      identityContext,
    );
    if (selfReferentialAnswer != null) {
      console.debug("[ai/ask] pipeline used", {
        pipeline: "self_referential_identity",
        hasConversationName: Boolean(conversationFacts?.statedName),
        hasSafeDisplayName: Boolean(identityContext.safeProfile?.displayName),
      });
      res.status(200).json({
        question: q,
        answer: selfReferentialAnswer,
        sources: [],
      });
      return;
    }

    const initialIntent = classifyStudentAiIntent(q);
    const memoryPlan = planShortConversationMemory(q, rawHistory, initialIntent);
    const routedIntent = memoryPlan.effectiveIntent;
    console.debug("[ai/ask] detected intent", {
      initialIntent,
      effectiveIntent: routedIntent,
      isFollowUp: memoryPlan.isFollowUp,
      isTopicSwitch: memoryPlan.isTopicSwitch,
      previousDomain: memoryPlan.previousDomain,
      retainedHistoryMessages: memoryPlan.history?.length ?? 0,
    });

    if (detectGraduationEligibilityQuestion(q)) {
      const evaluation = await evaluateStudentGraduation(authStudent.studentId);
      const result = await answerGraduationQuestion(q, memoryPlan.history, {
        graduationEvaluation: formatGraduationEvaluationFacts(evaluation),
        identityContext,
      });
      console.debug("[ai/ask] pipeline used", {
        pipeline: "graduation_evaluation",
        eligible: evaluation.eligible,
        ruleSetId: evaluation.ruleSetId,
        missingCourseCount: evaluation.missingCourses.length,
        missingCredits: evaluation.missingCredits,
      });
      res.status(200).json(result);
      return;
    }

    if (routedIntent === "general") {
      console.debug("[ai/ask] pipeline used", { pipeline: "general" });
      const result = await answerGeneralQuestion(q, memoryPlan.history, {
        identityContext,
      });
      res.status(200).json(result);
      return;
    }

    if (routedIntent === "school_fact") {
      console.debug("[ai/ask] pipeline used", { pipeline: "school_fact" });
      const result = answerSchoolFactQuestion(q);
      res.status(200).json(result);
      return;
    }

    if (routedIntent === "student_record") {
      const deterministic = await answerDeterministicStudentRecordQuestion(
        authStudent.studentId,
        q,
      );
      if (deterministic != null) {
        console.debug("[ai/ask] pipeline used", {
          pipeline: "student_record",
          deterministicStudentFactsUsed: true,
          ragUsed: false,
          helperCount: deterministic.usedHelpers.length,
        });
        res.status(200).json(deterministic.result);
        return;
      }
      const recordFacts = await buildStudentRecordFactsForQuestion(
        authStudent.studentId,
        q,
      );
      if (recordFacts != null) {
        console.debug("[ai/ask] pipeline used", {
          pipeline: "student_record",
          deterministicStudentFactsUsed: true,
          ragUsed: false,
          helperCount: recordFacts.usedHelpers.length,
        });
        const result = await answerStudentRecordQuestionFromFacts(
          q,
          recordFacts.contextText,
          identityContext,
        );
        res.status(200).json(result);
        return;
      }
      console.debug("[ai/ask] pipeline used", {
        pipeline: "student_record",
        deterministicStudentFactsUsed: false,
        ragUsed: false,
      });
      res.status(200).json({
        question: q,
        answer: "I don't have enough information from your records to confirm this.",
        sources: [],
      });
      return;
    }

    if (routedIntent === "policy") {
      console.debug("[ai/ask] pipeline used", { pipeline: "policy" });
      const result = await answerAmuQuestion(q, memoryPlan.history, {
        pipeline: "policy",
        identityContext,
      });
      res.status(200).json(result);
      return;
    }

    const recordFacts = await buildStudentRecordFactsForQuestion(
      authStudent.studentId,
      q,
    );
    const studentContextText =
      recordFacts?.contextText ??
      `Student Record Facts
- I don't have enough information from your records to confirm this.`;

    console.debug("[ai/ask] pipeline used", {
      pipeline: "mixed",
      deterministicStudentFactsUsed: recordFacts != null,
      ragUsed: true,
      helperCount: recordFacts?.usedHelpers.length ?? 0,
    });

    const result = await answerAmuQuestion(q, memoryPlan.history, {
      pipeline: "mixed",
      studentContext: studentContextText,
      identityContext,
    });
    res.status(200).json(result);
  } catch (e) {
    if (e instanceof RagQuestionValidationError) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error("[ai/ask]", e);
    res.status(500).json({ error: "Internal processing failed" });
  }
}

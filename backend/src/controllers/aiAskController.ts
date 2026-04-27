import type { Request, Response } from "express";
import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";
import {
  RagQuestionValidationError,
  answerGeneralQuestion,
  answerAmuQuestion,
  answerGraduationQuestion,
  answerLocalSearchQuestion,
  answerSchoolFactQuestion,
  answerStudentRecordQuestionFromFacts,
  plainTextFormatter,
  planShortConversationMemory,
} from "../services/ragService.js";
import {
  classifyStudentAiIntent,
  detectCourseEligibilityIntent,
  detectGraduationEligibilityQuestion,
  detectGraduationRequirementCreditsQuestion,
} from "../services/studentAiQuestionRouter.js";
import {
  detectEligibilityQuestion,
  detectPrerequisiteQuestion,
  evaluateCourseEligibility,
  isLikelyPassingGrade,
  isLikelyCourseRelatedQuery,
  isShortCourseLikeQuery,
  loadStudentAcademicCourseContext,
  parsePrerequisiteRules,
  resolveAmuCourse,
  type EligibilityResolvedCourse,
} from "../services/courseEligibilityService.js";
import {
  evaluateGraduation,
  formatGraduationEvaluationFacts,
} from "../services/graduationEvaluationService.js";
import {
  buildStudentRecordFactsForQuestion,
} from "../services/studentRecordAiService.js";
import { getStudentAcademicsPayload } from "../services/studentAcademicsService.js";
import { getLegacyStudentProfile } from "../services/studentProfileService.js";
import { getStudentTranscriptPreviewPayload } from "../services/studentTranscriptService.js";
import {
  buildSafeLoggedInUserContext,
  sanitizeConversationFacts,
} from "../services/conversationFactsService.js";
import type { StudentAcademicsResponse } from "../types/studentAcademics.js";

function formatResponseAnswer<T extends { answer: string }>(result: T): T {
  return {
    ...result,
    answer: plainTextFormatter(result.answer),
  };
}

function buildEvidenceUnavailableMessage(question: string): string {
  const zh = /[\u4E00-\u9FFF]/.test(question);
  return zh
    ? "我目前缺少完成此问题所需的 AMU 证据。请提供更具体的课程代码、项目（如 MAHM 或 DAHM）或目录年份，我可以基于可检索到的 AMU 目录和你的可用学业记录重新判断。"
    : "I do not currently have enough AMU evidence to answer this reliably. Please share a specific course code, program (such as MAHM or DAHM), or catalog year, and I can re-check using available AMU catalog context and your student record evidence.";
}

function readQuestion(req: Request): unknown {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return undefined;
  return body.question;
}

function hasVerifiedAcademicData(academics: StudentAcademicsResponse): boolean {
  return (
    academics.courseRecords.length > 0 ||
    academics.transcript.length > 0 ||
    academics.enrollmentHistory.length > 0 ||
    academics.currentSchedule.length > 0
  );
}

function formatMatchedCourseLabel(course: EligibilityResolvedCourse): string {
  const title = course.chiName ?? course.engName ?? "";
  return title ? `${course.code} ${title}` : course.code;
}

function buildResolvedCourseContextText(
  course: EligibilityResolvedCourse,
  studentContextText: string,
): string {
  const courseLines = [
    "Resolved AMU Course",
    `- Course code: ${course.code}`,
    `- Course title (EN): ${course.engName ?? "Unavailable"}`,
    `- Course title (ZH): ${course.chiName ?? "Unavailable"}`,
    `- Prerequisite field: ${course.prerequisiteText ?? "Not listed"}`,
    `- Corequisite field: ${course.corequisiteText ?? "Not listed"}`,
  ];
  return `${courseLines.join("\n")}\n\n${studentContextText}`;
}

function buildStudentCourseContextText(input: {
  studentId: string;
  program: string | null;
  track: string | null;
  catalogYear: string | null;
  completedCourses: Array<{ code: string; title: string; grade: string | null }>;
  transferCredits: number;
  currentRegistrations: Array<{ code: string; title: string }>;
}): string {
  const completed = input.completedCourses
    .slice(0, 40)
    .map((c) => `${c.code}${c.grade ? ` (${c.grade})` : ""} - ${c.title}`)
    .join("; ");
  const currentRegs = input.currentRegistrations
    .slice(0, 20)
    .map((c) => `${c.code} - ${c.title}`)
    .join("; ");
  return [
    "Student Context",
    `- Student ID: ${input.studentId}`,
    `- Program: ${input.program ?? "Unavailable"}`,
    `- Track: ${input.track ?? "Unavailable"}`,
    `- Catalog year: ${input.catalogYear ?? "Unavailable"}`,
    `- Transfer credits: ${input.transferCredits}`,
    `- Completed courses: ${completed || "None found"}`,
    `- Current registrations: ${currentRegs || "None found"}`,
  ].join("\n");
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
    const initialIntent = classifyStudentAiIntent(q);
    const memoryPlan = planShortConversationMemory(q, rawHistory, initialIntent);
    const routedIntent = memoryPlan.effectiveIntent;
    const isGraduationQuestion = detectGraduationEligibilityQuestion(q);
    const isGraduationRequirementCreditsQuestion =
      detectGraduationRequirementCreditsQuestion(q);
    const isGraduationBackendQuestion =
      isGraduationQuestion || isGraduationRequirementCreditsQuestion;
    const isCourseEligibilityQuestion = detectCourseEligibilityIntent(q);
    console.debug("[ai/ask] detected intent", {
      initialIntent,
      effectiveIntent: routedIntent,
      isFollowUp: memoryPlan.isFollowUp,
      isTopicSwitch: memoryPlan.isTopicSwitch,
      previousDomain: memoryPlan.previousDomain,
      retainedHistoryMessages: memoryPlan.history?.length ?? 0,
      isGraduationQuestion,
      isGraduationRequirementCreditsQuestion,
      isCourseEligibilityQuestion,
    });

    const isLikelyCourseQuery = isLikelyCourseRelatedQuery(q);
    if (isLikelyCourseQuery) {
      const studentCourseContext = await loadStudentAcademicCourseContext(
        authStudent.studentId,
      );
      const resolved = await resolveAmuCourse(q, studentCourseContext);
      if (resolved.status === "ambiguous") {
        const options = resolved.matches
          .slice(0, 4)
          .map((match) => formatMatchedCourseLabel(match))
          .join("；");
        res.status(200).json({
          question: q,
          answer: `我找到了多个可能匹配的 AMU 课程：${options}。请提供课程代码或完整课程名称，我可以继续为你精确查询。`,
          sources: [],
        });
        return;
      }

      if (resolved.status === "no_match") {
        if (isShortCourseLikeQuery(q)) {
          res.status(200).json({
            question: q,
            answer:
              "我目前没有在可用的 AMU 课程资料中找到这个课程。请提供课程代码或完整课程名称，我可以再帮你查。",
            sources: [],
          });
          return;
        }
      } else {
        const studentContextText = buildStudentCourseContextText(studentCourseContext);
        const resolvedCourse = resolved.course;
        const isPrerequisite = detectPrerequisiteQuestion(q);
        const isEligibility = detectEligibilityQuestion(q);
        const rules = parsePrerequisiteRules(resolvedCourse);

        if (isPrerequisite) {
          if ((resolvedCourse.prerequisiteText ?? "").trim() !== "") {
            const ragResult = await answerAmuQuestion(
              `${resolvedCourse.code} prerequisite requirement`,
              memoryPlan.history,
              {
                pipeline: "policy",
                identityContext,
              },
            );
            res.status(200).json(
              formatResponseAnswer({
                ...ragResult,
                answer: `${resolvedCourse.code} 的先修要求是：${resolvedCourse.prerequisiteText}\n\n基于可用的 AMU 目录上下文，补充说明：${ragResult.answer}`,
              }),
            );
            return;
          }
          res.status(200).json({
            question: q,
            answer: `我找到了 ${resolvedCourse.code}，但目前可用的 AMU 课程资料没有列出明确先修要求。建议向 Academic Advising 确认。`,
            sources: [],
          });
          return;
        }

        if (isEligibility) {
          const eligibility = evaluateCourseEligibility({
            targetCourse: resolvedCourse,
            prerequisites: rules,
            studentCompletedCourses: studentCourseContext.completedCourses.map((c) => ({
              code: c.code,
              passed: isLikelyPassingGrade(c.grade),
            })),
            studentEnrollments: studentCourseContext.currentRegistrations.map((r) => ({
              code: r.code,
              status: "active",
            })),
          });
          if (eligibility.eligible === true) {
            res.status(200).json({
              question: q,
              answer: `根据你当前可用的 AMU 学业记录，你目前满足 ${resolvedCourse.code} 的已解析先修要求，可以尝试选课。`,
              sources: [],
            });
            return;
          }
          if (eligibility.missingPrerequisites.length > 0) {
            res.status(200).json({
              question: q,
              answer: `根据你当前可用的 AMU 学业记录，你选 ${resolvedCourse.code} 还缺这些已解析先修课：${eligibility.missingPrerequisites.join("、")}。`,
              sources: [],
            });
            return;
          }
          res.status(200).json({
            question: q,
            answer: `我找到了 ${resolvedCourse.code}，但基于当前可用 AMU 课程资料无法明确解析完整先修规则，所以暂时无法确定你是否可以选这门课。`,
            sources: [],
          });
          return;
        }

        const result = await answerAmuQuestion(
          `${q}\n\nUse this resolved AMU course as the target course: ${resolvedCourse.code} ${resolvedCourse.engName ?? ""} ${resolvedCourse.chiName ?? ""}`.trim(),
          memoryPlan.history,
          {
            pipeline: "mixed",
            studentContext: buildResolvedCourseContextText(
              resolvedCourse,
              studentContextText,
            ),
            identityContext,
          },
        );
        res.status(200).json(formatResponseAnswer(result));
        return;
      }
    }

    if (
      isGraduationBackendQuestion ||
      routedIntent === "student_record" ||
      routedIntent === "mixed"
    ) {
      const academics = await getStudentAcademicsPayload(authStudent.studentId);
      let transcriptPreviewCount = 0;
      if (!hasVerifiedAcademicData(academics)) {
        const transcriptPreview = await getStudentTranscriptPreviewPayload(
          authStudent.studentId,
        );
        transcriptPreviewCount = transcriptPreview.transcript.length;
      }

      console.debug("[ai/ask] verified academic source summary", {
        hasAuthorizationHeader,
        resolvedStudentId: authStudent.studentId,
        currentTerm: academics.currentTerm,
        availableTerms: academics.availableTerms.length,
        currentScheduleCount: academics.currentSchedule.length,
        transcriptCount: academics.transcript.length,
        enrollmentHistoryCount: academics.enrollmentHistory.length,
        courseRecordCount: academics.courseRecords.length,
        transcriptPreviewCount,
      });

      if (
        !hasVerifiedAcademicData(academics) &&
        transcriptPreviewCount <= 0
      ) {
        console.error("[AI DEBUG] missing student academic data", {
          studentId: authStudent.studentId,
          question: q,
          routedIntent,
          isGraduationQuestion,
          isGraduationRequirementCreditsQuestion,
          currentTerm: academics.currentTerm,
          availableTerms: academics.availableTerms.length,
          currentScheduleCount: academics.currentSchedule.length,
          transcriptCount: academics.transcript.length,
          enrollmentHistoryCount: academics.enrollmentHistory.length,
          courseRecordCount: academics.courseRecords.length,
          transcriptPreviewCount,
        });
        res.status(200).json({
          question: q,
          answer: buildEvidenceUnavailableMessage(q),
          sources: [],
        });
        return;
      }
    }

    if (isGraduationBackendQuestion) {
      const evaluation = await evaluateGraduation(authStudent.studentId);
      const structuredEvaluation = formatGraduationEvaluationFacts(evaluation);
      console.debug("[ai/ask] graduation evaluation summary", {
        resolvedStudentId: authStudent.studentId,
        earnedCredits: evaluation.earnedCredits,
        requiredCredits: evaluation.requiredCredits,
        eligible: evaluation.eligible,
        missingCredits: evaluation.missingCredits,
        creditSource: "backend",
        missingCourseCount: evaluation.missingCourses.length,
        ruleSetId: evaluation.ruleSetId,
      });
      console.debug("[ai/ask] pipeline used", {
        pipeline: "graduation_evaluation",
        eligible: evaluation.eligible,
        ruleSetId: evaluation.ruleSetId,
        missingCourseCount: evaluation.missingCourses.length,
        missingCredits: evaluation.missingCredits,
        structuredEvaluation,
      });
      const result = await answerGraduationQuestion(q, memoryPlan.history, {
        graduationEvaluation: structuredEvaluation,
        identityContext,
      });
      res.status(200).json(formatResponseAnswer(result));
      return;
    }

    if (routedIntent === "general") {
      console.debug("[ai/ask] pipeline used", {
        pipeline: "general",
        answerMode: "normal_chat",
      });
      const result = await answerGeneralQuestion(q, memoryPlan.history, {
        identityContext,
      });
      res.status(200).json(formatResponseAnswer(result));
      return;
    }

    if (routedIntent === "school_fact") {
      console.debug("[ai/ask] pipeline used", { pipeline: "school_fact" });
      const result = await answerSchoolFactQuestion(q);
      res.status(200).json(formatResponseAnswer(result));
      return;
    }

    if (routedIntent === "local_search") {
      console.debug("[ai/ask] pipeline used", { pipeline: "local_search" });
      const result = await answerLocalSearchQuestion(q);
      res.status(200).json(formatResponseAnswer(result));
      return;
    }

    if (routedIntent === "student_record") {
      const recordFacts = await buildStudentRecordFactsForQuestion(
        authStudent.studentId,
        q,
      );
      if (recordFacts != null) {
        console.debug("[ai/ask] pipeline used", {
          pipeline: "student_record",
          deterministicStudentFactsUsed: true,
          ragUsed: true,
          helperCount: recordFacts.usedHelpers.length,
        });
        const result = await answerStudentRecordQuestionFromFacts(
          q,
          recordFacts.contextText,
          identityContext,
        );
        res.status(200).json(formatResponseAnswer(result));
        return;
      }
      console.debug("[ai/ask] pipeline used", {
        pipeline: "student_record",
        deterministicStudentFactsUsed: false,
        ragUsed: false,
      });
      console.error("[AI DEBUG] student_record fell through without deterministic facts", {
        studentId: authStudent.studentId,
        question: q,
      });
      res.status(200).json({
        question: q,
        answer: buildEvidenceUnavailableMessage(q),
        sources: [],
      });
      return;
    }

    if (routedIntent === "policy") {
      console.debug("[ai/ask] pipeline used", {
        pipeline: "policy",
        answerMode: "catalog_rag",
      });
      const result = await answerAmuQuestion(q, memoryPlan.history, {
        pipeline: "policy",
        identityContext,
      });
      res.status(200).json(formatResponseAnswer(result));
      return;
    }

    const recordFacts = await buildStudentRecordFactsForQuestion(
      authStudent.studentId,
      q,
    );
    if (recordFacts == null) {
      console.error("[AI DEBUG] mixed intent missing student record facts", {
        studentId: authStudent.studentId,
        question: q,
      });
      res.status(200).json({
        question: q,
        answer: buildEvidenceUnavailableMessage(q),
        sources: [],
      });
      return;
    }
    const studentContextText = recordFacts.contextText;

    console.debug("[ai/ask] pipeline used", {
      pipeline: "mixed",
      answerMode: "catalog_rag_with_student_context",
      deterministicStudentFactsUsed: true,
      ragUsed: true,
      helperCount: recordFacts.usedHelpers.length,
    });

    const result = await answerAmuQuestion(q, memoryPlan.history, {
      pipeline: "mixed",
      studentContext: studentContextText,
      identityContext,
    });
    res.status(200).json(formatResponseAnswer(result));
  } catch (e) {
    if (e instanceof RagQuestionValidationError) {
      res.status(400).json({ error: e.message });
      return;
    }
    console.error("[AI ERROR]", e);
    res.status(200).json({
      question: q,
      answer: buildEvidenceUnavailableMessage(q),
      sources: [],
    });
  }
}

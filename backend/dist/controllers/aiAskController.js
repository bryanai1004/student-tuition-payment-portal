import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";
import { RagQuestionValidationError, answerGeneralQuestion, answerAmuQuestion, answerGraduationQuestion, answerLocalSearchQuestion, answerSchoolFactQuestion, answerStudentRecordQuestionFromFacts, buildTransientAssistantFailureReply, planShortConversationMemory, } from "../services/ragService.js";
import { classifyStudentAiIntent, detectGraduationEligibilityQuestion, detectGraduationRequirementCreditsQuestion, } from "../services/studentAiQuestionRouter.js";
import { evaluateStudentGraduation, formatGraduationEvaluationFacts, } from "../services/graduationEvaluationService.js";
import { answerDeterministicStudentRecordQuestion, buildStudentRecordFactsForQuestion, } from "../services/studentRecordAiService.js";
import { getStudentAcademicsPayload } from "../services/studentAcademicsService.js";
import { getLegacyStudentProfile } from "../services/studentProfileService.js";
import { getStudentTranscriptPreviewPayload } from "../services/studentTranscriptService.js";
import { answerSelfReferentialQuestion, buildSafeLoggedInUserContext, sanitizeConversationFacts, } from "../services/conversationFactsService.js";
function readQuestion(req) {
    const body = req.body;
    if (body == null || typeof body !== "object")
        return undefined;
    return body.question;
}
function hasVerifiedAcademicData(academics) {
    return (academics.courseRecords.length > 0 ||
        academics.transcript.length > 0 ||
        academics.enrollmentHistory.length > 0 ||
        academics.currentSchedule.length > 0);
}
/**
 * POST /api/ai/ask
 * Body: {
 *   question: string,
 *   history?: { role: 'user' | 'assistant', content: string }[],
 *   conversationFacts?: { statedName?: string, preferredLanguage?: 'en' | 'zh' }
 * }
 */
export async function postAiAsk(req, res) {
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
    const body = req.body;
    const q = readQuestion(req);
    if (typeof q !== "string") {
        res.status(400).json({
            error: "question is required and must be a string",
        });
        return;
    }
    if (body != null &&
        typeof body === "object" &&
        Object.prototype.hasOwnProperty.call(body, "history") &&
        body.history != null &&
        !Array.isArray(body.history)) {
        res.status(400).json({ error: "history must be an array when provided" });
        return;
    }
    const rawHistory = body != null &&
        typeof body === "object" &&
        Object.prototype.hasOwnProperty.call(body, "history")
        ? body.history
        : undefined;
    const rawConversationFacts = body != null &&
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
        const selfReferentialAnswer = answerSelfReferentialQuestion(q, identityContext);
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
        const isGraduationQuestion = detectGraduationEligibilityQuestion(q);
        const isGraduationRequirementCreditsQuestion = detectGraduationRequirementCreditsQuestion(q);
        console.debug("[ai/ask] detected intent", {
            initialIntent,
            effectiveIntent: routedIntent,
            isFollowUp: memoryPlan.isFollowUp,
            isTopicSwitch: memoryPlan.isTopicSwitch,
            previousDomain: memoryPlan.previousDomain,
            retainedHistoryMessages: memoryPlan.history?.length ?? 0,
            isGraduationQuestion,
            isGraduationRequirementCreditsQuestion,
        });
        if (isGraduationQuestion ||
            routedIntent === "student_record" ||
            routedIntent === "mixed") {
            const academics = await getStudentAcademicsPayload(authStudent.studentId);
            let transcriptPreviewCount = 0;
            if (!hasVerifiedAcademicData(academics)) {
                const transcriptPreview = await getStudentTranscriptPreviewPayload(authStudent.studentId);
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
            if (!hasVerifiedAcademicData(academics) &&
                transcriptPreviewCount <= 0) {
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
                    answer: "I couldn't load any verified academic records from marks, portal enrollments, portal courses, or registration for your account, so I can't answer this from student data.",
                    sources: [],
                });
                return;
            }
        }
        if (isGraduationQuestion) {
            const evaluation = await evaluateStudentGraduation(authStudent.studentId);
            console.debug("[ai/ask] graduation evaluation summary", {
                resolvedStudentId: authStudent.studentId,
                eligible: evaluation.eligible,
                earnedCredits: evaluation.earnedCredits,
                requiredCredits: evaluation.requiredCredits,
                missingCredits: evaluation.missingCredits,
                missingCourseCount: evaluation.missingCourses.length,
                ruleSetId: evaluation.ruleSetId,
            });
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
        if (isGraduationRequirementCreditsQuestion) {
            const evaluation = await evaluateStudentGraduation(authStudent.studentId);
            console.debug("[ai/ask] graduation requirement summary", {
                resolvedStudentId: authStudent.studentId,
                requiredCredits: evaluation.requiredCredits,
                earnedCredits: evaluation.earnedCredits,
                ruleSetId: evaluation.ruleSetId,
            });
            res.status(200).json({
                question: q,
                answer: `Your current graduation rule set requires ${evaluation.requiredCredits} credits. Based on the same backend evaluator, you currently have ${evaluation.earnedCredits} counted credits and are missing ${evaluation.missingCredits}.`,
                sources: [],
            });
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
        if (routedIntent === "local_search") {
            console.debug("[ai/ask] pipeline used", { pipeline: "local_search" });
            const result = answerLocalSearchQuestion(q);
            res.status(200).json(result);
            return;
        }
        if (routedIntent === "student_record") {
            const deterministic = await answerDeterministicStudentRecordQuestion(authStudent.studentId, q);
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
            const recordFacts = await buildStudentRecordFactsForQuestion(authStudent.studentId, q);
            if (recordFacts != null) {
                console.debug("[ai/ask] pipeline used", {
                    pipeline: "student_record",
                    deterministicStudentFactsUsed: true,
                    ragUsed: false,
                    helperCount: recordFacts.usedHelpers.length,
                });
                const result = await answerStudentRecordQuestionFromFacts(q, recordFacts.contextText, identityContext);
                res.status(200).json(result);
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
                answer: "I could not build a verified student-record answer from backend data, so I did not fall back to a guessed answer.",
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
        const recordFacts = await buildStudentRecordFactsForQuestion(authStudent.studentId, q);
        if (recordFacts == null) {
            console.error("[AI DEBUG] mixed intent missing student record facts", {
                studentId: authStudent.studentId,
                question: q,
            });
            res.status(200).json({
                question: q,
                answer: "I could not build verified student-record facts for this mixed question, so I did not fall back to a guessed answer.",
                sources: [],
            });
            return;
        }
        const studentContextText = recordFacts.contextText;
        console.debug("[ai/ask] pipeline used", {
            pipeline: "mixed",
            deterministicStudentFactsUsed: true,
            ragUsed: true,
            helperCount: recordFacts.usedHelpers.length,
        });
        const result = await answerAmuQuestion(q, memoryPlan.history, {
            pipeline: "mixed",
            studentContext: studentContextText,
            identityContext,
        });
        res.status(200).json(result);
    }
    catch (e) {
        if (e instanceof RagQuestionValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[ai/ask]", e);
        res.status(200).json({
            question: typeof q === "string" ? q : "",
            answer: typeof q === "string" ? buildTransientAssistantFailureReply(q) : "Internal processing failed",
            sources: [],
        });
    }
}
//# sourceMappingURL=aiAskController.js.map
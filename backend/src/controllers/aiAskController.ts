import type { Request, Response } from "express";
import { verifyStudentAccessToken } from "../lib/studentAuthToken.js";
import { buildStudentAiContext } from "../services/studentAiContextService.js";
import {
  RagQuestionValidationError,
  answerAmuQuestion,
} from "../services/ragService.js";

function readQuestion(req: Request): unknown {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body == null || typeof body !== "object") return undefined;
  return body.question;
}

/**
 * POST /api/ai/ask
 * Body: { question: string, history?: { role: 'user' | 'assistant', content: string }[] }
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

  try {
    console.debug("[ai/ask] authenticated student resolved", {
      studentId: authStudent.studentId,
    });
    const studentContext = await buildStudentAiContext(authStudent.studentId);
    console.debug("[ai/ask] student context built", {
      studentId: authStudent.studentId,
      dataSources: studentContext.dataSources,
      ...studentContext.meta,
    });
    const result = await answerAmuQuestion(q, rawHistory, {
      studentContext: studentContext.contextText,
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

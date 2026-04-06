import { RagQuestionValidationError, answerAmuQuestion, } from "../services/ragService.js";
function readQuestion(req) {
    const body = req.body;
    if (body == null || typeof body !== "object")
        return undefined;
    return body.question;
}
/**
 * POST /api/ai/ask
 * Body: { question: string }
 */
export async function postAiAsk(req, res) {
    const q = readQuestion(req);
    if (typeof q !== "string") {
        res.status(400).json({
            error: "question is required and must be a string",
        });
        return;
    }
    try {
        const result = await answerAmuQuestion(q);
        res.status(200).json(result);
    }
    catch (e) {
        if (e instanceof RagQuestionValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[ai/ask]", e);
        res.status(500).json({ error: "Internal processing failed" });
    }
}
//# sourceMappingURL=aiAskController.js.map
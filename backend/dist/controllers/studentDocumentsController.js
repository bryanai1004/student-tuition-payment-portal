import { env } from "../config/env.js";
import { InvalidAcademicTermError } from "../services/courseSectionService.js";
import { getAdminStudentDocumentRequirements, listStudentDocumentRequirementsForTerm, resetAdminStudentDocumentRequirement, resetAdminStudentDocumentRequirementsForTerm, StudentDocumentsNotFoundError, StudentDocumentsValidationError, submitStudentAgreement, submitStudentQuizAttempt, } from "../services/studentDocumentsService.js";
import { isDocumentQuizRequirementType, isDocumentRequirementType, } from "../types/studentDocuments.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function pathStudentId(req) {
    const v = req.params.studentId;
    if (Array.isArray(v))
        return v[0] ?? "";
    return v ?? "";
}
function parseQueryAcademicTermId(req) {
    const raw = req.query.academicTermId;
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
function parseBodyAcademicTermId(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const v = o.academicTermId;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
function parseBodyReassignedBy(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    if (!Object.prototype.hasOwnProperty.call(o, "reassignedBy"))
        return null;
    const v = o.reassignedBy;
    if (v === null || v === undefined)
        return null;
    if (typeof v !== "string")
        return null;
    const t = v.trim();
    return t === "" ? null : t;
}
function parseAgreementBody(body) {
    const academicTermId = parseBodyAcademicTermId(body);
    if (!academicTermId)
        return null;
    return { academicTermId };
}
function parseQuizSubmitBody(body) {
    if (!body || typeof body !== "object")
        return null;
    const o = body;
    const academicTermId = parseBodyAcademicTermId(body);
    if (!academicTermId)
        return null;
    const answersRaw = o.answers;
    if (answersRaw === undefined || answersRaw === null)
        return null;
    if (typeof answersRaw !== "object" || Array.isArray(answersRaw))
        return null;
    const answers = {};
    for (const [k, v] of Object.entries(answersRaw)) {
        if (typeof v !== "string")
            return null;
        answers[k] = v;
    }
    return { academicTermId, answers };
}
function parseResetBody(body) {
    const academicTermId = parseBodyAcademicTermId(body);
    if (!academicTermId)
        return null;
    const reassignedBy = parseBodyReassignedBy(body);
    return { academicTermId, reassignedBy };
}
export async function getStudentDocumentRequirementsHandler(req, res) {
    try {
        const sid = pathStudentId(req).trim();
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const academicTermId = parseQueryAcademicTermId(req);
        if (!academicTermId) {
            res.status(400).json({ error: "Query parameter academicTermId is required." });
            return;
        }
        const payload = await listStudentDocumentRequirementsForTerm(sid, academicTermId);
        res.json(payload);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (e instanceof StudentDocumentsNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
        }
        if (e instanceof StudentDocumentsValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[students/documents] GET failed:", e);
        const body = {
            error: "Failed to load document requirements.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function postStudentAgreementSubmitHandler(req, res) {
    try {
        const sid = pathStudentId(req).trim();
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const parsed = parseAgreementBody(req.body);
        if (!parsed) {
            res.status(400).json({
                error: "Invalid body: require academicTermId (string).",
            });
            return;
        }
        const payload = await submitStudentAgreement(sid, parsed.academicTermId);
        res.status(200).json(payload);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (e instanceof StudentDocumentsNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
        }
        if (e instanceof StudentDocumentsValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[students/documents/agreement/submit] failed:", e);
        const body = {
            error: "Failed to submit agreement.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function postStudentQuizSubmitHandler(req, res) {
    try {
        const sid = pathStudentId(req).trim();
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const quizIdRaw = req.params.quizId;
        const quizId = typeof quizIdRaw === "string"
            ? quizIdRaw.trim()
            : Array.isArray(quizIdRaw)
                ? quizIdRaw[0]?.trim() ?? ""
                : "";
        if (!quizId || !isDocumentQuizRequirementType(quizId)) {
            res.status(400).json({ error: "Invalid quiz id" });
            return;
        }
        const parsed = parseQuizSubmitBody(req.body);
        if (!parsed) {
            res.status(400).json({
                error: "Invalid body: require academicTermId (string) and answers (object mapping question id to string).",
            });
            return;
        }
        const payload = await submitStudentQuizAttempt(sid, parsed.academicTermId, quizId, parsed.answers);
        res.status(200).json(payload);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (e instanceof StudentDocumentsNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
        }
        if (e instanceof StudentDocumentsValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[students/documents/quizzes/submit] failed:", e);
        const body = {
            error: "Failed to submit quiz.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function getAdminStudentDocumentRequirementsHandler(req, res) {
    try {
        const sid = pathStudentId(req).trim();
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const academicTermId = parseQueryAcademicTermId(req);
        if (!academicTermId) {
            res.status(400).json({ error: "Query parameter academicTermId is required." });
            return;
        }
        const payload = await getAdminStudentDocumentRequirements(sid, academicTermId);
        res.json(payload);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (e instanceof StudentDocumentsNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
        }
        if (e instanceof StudentDocumentsValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[admin/students/documents] GET failed:", e);
        const body = {
            error: "Failed to load document requirements.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function postAdminStudentDocumentRequirementResetHandler(req, res) {
    try {
        const sid = pathStudentId(req).trim();
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const rtRaw = req.params.requirementType;
        const rt = typeof rtRaw === "string"
            ? rtRaw.trim()
            : Array.isArray(rtRaw)
                ? rtRaw[0]?.trim() ?? ""
                : "";
        if (!rt || !isDocumentRequirementType(rt)) {
            res.status(400).json({ error: "Invalid requirement type" });
            return;
        }
        const parsed = parseResetBody(req.body);
        if (!parsed) {
            res.status(400).json({
                error: "Invalid body: require academicTermId (string).",
            });
            return;
        }
        const payload = await resetAdminStudentDocumentRequirement(sid, parsed.academicTermId, rt, parsed.reassignedBy);
        res.status(200).json(payload);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (e instanceof StudentDocumentsNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
        }
        if (e instanceof StudentDocumentsValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[admin/students/documents/reset] failed:", e);
        const body = {
            error: "Failed to reset document requirement.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
export async function postAdminStudentDocumentRequirementsResetAllHandler(req, res) {
    try {
        const sid = pathStudentId(req).trim();
        if (sid === "") {
            res.status(400).json({ error: "Missing student id" });
            return;
        }
        const parsed = parseResetBody(req.body);
        if (!parsed) {
            res.status(400).json({
                error: "Invalid body: require academicTermId (string).",
            });
            return;
        }
        const payload = await resetAdminStudentDocumentRequirementsForTerm(sid, parsed.academicTermId, parsed.reassignedBy);
        res.status(200).json(payload);
    }
    catch (e) {
        if (e instanceof InvalidAcademicTermError) {
            res.status(400).json({
                error: "The selected academic term is not valid or no longer exists. Choose another term.",
            });
            return;
        }
        if (e instanceof StudentDocumentsNotFoundError) {
            res.status(404).json({ error: e.message });
            return;
        }
        if (e instanceof StudentDocumentsValidationError) {
            res.status(400).json({ error: e.message });
            return;
        }
        console.error("[admin/students/documents/reset-all] failed:", e);
        const body = {
            error: "Failed to reset document requirements.",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=studentDocumentsController.js.map
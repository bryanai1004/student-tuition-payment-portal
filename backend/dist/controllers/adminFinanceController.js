import { env } from "../config/env.js";
import { deleteAdminFinanceCharge, deleteAdminFinancePayment, getAdminFinanceLedger, getAdminFinanceQuarters, getQuarterSettingsPayload, listAdminFinanceStudentsPaginated, parseBalanceFilterParam, listGlobalQuartersPayload, postAdminFinanceCharge, postAdminFinancePayment, previewLateFeeReconciliationForQuarter, putAdminFinanceCharge, putAdminFinancePayment, putQuarterSettings, reconcileLateFeesForQuarter, runLateFeeCheckForQuarter, validatePostChargeBody, validatePostPaymentBody, validatePutChargeBody, validatePutPaymentBody, verifyManualChargeForStudentTerm, verifyPaymentForStudentTerm, } from "../services/adminFinanceService.js";
function devMessage(e) {
    return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}
function pathStudentId(req) {
    const v = req.params.studentId;
    if (Array.isArray(v))
        return (v[0] ?? "").trim();
    return (v ?? "").trim();
}
function queryFirstString(raw) {
    if (typeof raw === "string")
        return raw;
    if (Array.isArray(raw) && typeof raw[0] === "string")
        return raw[0];
    return undefined;
}
function parsePositiveIntParam(raw) {
    const s = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
    const t = typeof s === "string" ? s.trim() : "";
    if (t === "")
        return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}
/**
 * GET /api/admin/finance/students?term=&year=&page=&pageSize=&search=&balance=
 */
export async function getAdminFinanceStudents(req, res) {
    try {
        const termRaw = req.query.term;
        const yearRaw = req.query.year;
        const term = typeof termRaw === "string" && termRaw.trim() !== ""
            ? termRaw.trim()
            : "";
        const yearNum = typeof yearRaw === "string" && yearRaw.trim() !== ""
            ? Number(yearRaw)
            : Number.NaN;
        const year = Number.isFinite(yearNum) ? yearNum : Number.NaN;
        if (term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "Query parameters `term` and `year` are required",
            });
            return;
        }
        const pageParam = parsePositiveIntParam(queryFirstString(req.query.page));
        const pageSizeParam = parsePositiveIntParam(queryFirstString(req.query.pageSize));
        const page = pageParam ?? 1;
        const pageSize = pageSizeParam ?? 25;
        const search = queryFirstString(req.query.search) ?? "";
        const balanceStr = queryFirstString(req.query.balance);
        const balanceFilter = parseBalanceFilterParam(balanceStr);
        const payload = await listAdminFinanceStudentsPaginated(term, year, {
            page,
            pageSize,
            search,
            balanceFilter,
        });
        res.json(payload);
    }
    catch (e) {
        console.error("[admin/finance/students]", e);
        const body = {
            error: "Failed to load finance student list",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/finance/quarters
 */
export async function getGlobalFinanceQuarters(_req, res) {
    try {
        const payload = await listGlobalQuartersPayload();
        res.json(payload);
    }
    catch (e) {
        console.error("[admin/finance/quarters-global]", e);
        const body = {
            error: "Failed to load finance quarters",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/finance/quarter-settings?term=&year=
 */
export async function getFinanceQuarterSettings(req, res) {
    const termRaw = req.query.term;
    const yearRaw = req.query.year;
    const term = typeof termRaw === "string" && termRaw.trim() !== ""
        ? termRaw.trim()
        : "";
    const yearNum = typeof yearRaw === "string" && yearRaw.trim() !== ""
        ? Number(yearRaw)
        : Number.NaN;
    const year = Number.isFinite(yearNum) ? yearNum : Number.NaN;
    if (term === "" || !Number.isFinite(year)) {
        res.status(400).json({
            error: "Query parameters `term` and `year` are required",
        });
        return;
    }
    const y = Math.trunc(year);
    try {
        const payload = await getQuarterSettingsPayload(term, y);
        res.json(payload);
    }
    catch (e) {
        console.error("[admin/finance/quarter-settings get]", e);
        const note = env.nodeEnv === "development"
            ? `Quarter settings could not be loaded (${devMessage(e)}). Configure payment due dates under Academic Terms.`
            : "Quarter settings could not be loaded. Configure payment due dates under Academic Terms.";
        res.status(200).json({
            term: term.trim(),
            year: y,
            paymentDueDate: null,
            lateFeeEnabled: true,
            lateFeeAmount: 30,
            ddlPersistenceAvailable: false,
            ddlSaveNote: note,
        });
    }
}
/**
 * PUT /api/admin/finance/quarter-settings
 */
export async function putFinanceQuarterSettings(req, res) {
    try {
        const raw = req.body;
        if (raw == null || typeof raw !== "object") {
            res.status(400).json({ error: "Request body must be a JSON object." });
            return;
        }
        const o = raw;
        const term = typeof o.term === "string" ? o.term.trim() : "";
        const yearRaw = o.year;
        const year = typeof yearRaw === "number"
            ? yearRaw
            : typeof yearRaw === "string"
                ? Number(yearRaw)
                : Number.NaN;
        if (term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "term and year are required; year must be a finite number.",
            });
            return;
        }
        let paymentDueDate = null;
        if (o.paymentDueDate === undefined || o.paymentDueDate === null) {
            paymentDueDate = null;
        }
        else if (typeof o.paymentDueDate === "string" &&
            o.paymentDueDate.trim() !== "") {
            paymentDueDate = o.paymentDueDate.trim().slice(0, 10);
        }
        else if (o.paymentDueDate !== null) {
            res.status(400).json({
                error: "paymentDueDate must be YYYY-MM-DD, null, or omitted.",
            });
            return;
        }
        const lateFeeEnabled = o.lateFeeEnabled === undefined
            ? undefined
            : Boolean(o.lateFeeEnabled);
        const lateFeeAmount = o.lateFeeAmount === undefined
            ? undefined
            : typeof o.lateFeeAmount === "number"
                ? o.lateFeeAmount
                : typeof o.lateFeeAmount === "string"
                    ? Number(o.lateFeeAmount)
                    : Number.NaN;
        if (o.lateFeeAmount !== undefined &&
            !Number.isFinite(lateFeeAmount)) {
            res.status(400).json({ error: "lateFeeAmount must be a number." });
            return;
        }
        const saveResult = await putQuarterSettings({
            term,
            year: Math.trunc(year),
            paymentDueDate,
            lateFeeEnabled,
            lateFeeAmount: Number.isFinite(lateFeeAmount)
                ? lateFeeAmount
                : undefined,
            updatedBy: null,
        });
        if (!saveResult.ok) {
            res.status(200).json(saveResult);
            return;
        }
        res.json(saveResult);
    }
    catch (e) {
        console.error("[admin/finance/quarter-settings put]", e);
        const body = {
            error: "Failed to save quarter settings",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/finance/late-fee-reconciliation-preview?term=&year=&paymentDueDate=
 */
export async function getLateFeeReconciliationPreview(req, res) {
    try {
        const termRaw = req.query.term;
        const yearRaw = req.query.year;
        const term = typeof termRaw === "string" && termRaw.trim() !== ""
            ? termRaw.trim()
            : "";
        const yearNum = typeof yearRaw === "string" && yearRaw.trim() !== ""
            ? Number(yearRaw)
            : Number.NaN;
        const year = Number.isFinite(yearNum) ? Math.trunc(yearNum) : Number.NaN;
        if (term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "Query parameters `term` and `year` are required",
            });
            return;
        }
        const dueRaw = req.query.paymentDueDate;
        const paymentDueDateOverride = dueRaw === undefined || dueRaw === null
            ? undefined
            : typeof dueRaw === "string"
                ? dueRaw.trim() === ""
                    ? null
                    : dueRaw.trim().slice(0, 10)
                : undefined;
        const preview = await previewLateFeeReconciliationForQuarter(term, year, paymentDueDateOverride);
        res.json(preview);
    }
    catch (e) {
        console.error("[admin/finance/late-fee-reconciliation-preview]", e);
        const body = {
            error: "Failed to compute late fee reconciliation preview",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * POST /api/admin/finance/reconcile-late-fees
 */
export async function postReconcileLateFees(req, res) {
    try {
        const raw = req.body;
        if (raw == null || typeof raw !== "object") {
            res.status(400).json({ error: "Request body must be a JSON object." });
            return;
        }
        const o = raw;
        const term = typeof o.term === "string" ? o.term.trim() : "";
        const yearRaw = o.year;
        const year = typeof yearRaw === "number"
            ? yearRaw
            : typeof yearRaw === "string"
                ? Number(yearRaw)
                : Number.NaN;
        if (term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "term and year are required; year must be a finite number.",
            });
            return;
        }
        const result = await reconcileLateFeesForQuarter(term, Math.trunc(year));
        res.json(result);
    }
    catch (e) {
        console.error("[admin/finance/reconcile-late-fees]", e);
        const body = {
            error: "Failed to reconcile late fees",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * POST /api/admin/finance/run-late-fee
 */
export async function postRunLateFeeCheck(req, res) {
    try {
        const raw = req.body;
        if (raw == null || typeof raw !== "object") {
            res.status(400).json({ error: "Request body must be a JSON object." });
            return;
        }
        const o = raw;
        const term = typeof o.term === "string" ? o.term.trim() : "";
        const yearRaw = o.year;
        const year = typeof yearRaw === "number"
            ? yearRaw
            : typeof yearRaw === "string"
                ? Number(yearRaw)
                : Number.NaN;
        if (term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "term and year are required; year must be a finite number.",
            });
            return;
        }
        const result = await runLateFeeCheckForQuarter(term, Math.trunc(year));
        res.json(result);
    }
    catch (e) {
        console.error("[admin/finance/run-late-fee]", e);
        const body = {
            error: "Failed to run late fee check",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/finance/:studentId/quarters
 */
export async function getAdminFinanceQuartersHandler(req, res) {
    try {
        const studentId = pathStudentId(req);
        if (studentId === "") {
            res.status(400).json({ error: "Missing studentId" });
            return;
        }
        const payload = await getAdminFinanceQuarters(studentId);
        res.json(payload);
    }
    catch (e) {
        console.error("[admin/finance/quarters]", e);
        const body = {
            error: "Failed to load quarters",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * GET /api/admin/finance/:studentId/ledger?term=&year=
 */
export async function getAdminFinanceLedgerHandler(req, res) {
    try {
        const studentId = pathStudentId(req);
        if (studentId === "") {
            res.status(400).json({ error: "Missing studentId" });
            return;
        }
        const termRaw = req.query.term;
        const yearRaw = req.query.year;
        const term = typeof termRaw === "string" && termRaw.trim() !== ""
            ? termRaw.trim()
            : "";
        const yearNum = typeof yearRaw === "string" && yearRaw.trim() !== ""
            ? Number(yearRaw)
            : Number.NaN;
        const year = Number.isFinite(yearNum) ? yearNum : Number.NaN;
        if (term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "Query parameters `term` and `year` are required",
            });
            return;
        }
        const payload = await getAdminFinanceLedger(studentId, term, year);
        if (payload == null) {
            res.status(400).json({ error: "Invalid term or year" });
            return;
        }
        res.json(payload);
    }
    catch (e) {
        console.error("[admin/finance/ledger]", e);
        const body = {
            error: "Failed to load ledger",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * POST /api/admin/finance/charge
 */
export async function postAdminFinanceChargeHandler(req, res) {
    try {
        const parsed = validatePostChargeBody(req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        await postAdminFinanceCharge(parsed.data);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin/finance/charge]", e);
        const body = {
            error: "Failed to post charge",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * POST /api/admin/finance/payment
 */
export async function postAdminFinancePaymentHandler(req, res) {
    try {
        const parsed = validatePostPaymentBody(req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        await postAdminFinancePayment(parsed.data);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[admin/finance/payment]", e);
        const body = {
            error: "Failed to record payment",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * PUT /api/admin/finance/charge/:id
 * Query: studentId, term, year (ledger context)
 */
export async function putAdminFinanceChargeByIdHandler(req, res) {
    try {
        const id = parsePositiveIntParam(req.params.id);
        if (id == null) {
            res.status(400).json({ error: "Invalid charge id." });
            return;
        }
        const studentId = typeof req.query.studentId === "string" ? req.query.studentId.trim() : "";
        const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
        const yearRaw = req.query.year;
        const year = typeof yearRaw === "string" && yearRaw.trim() !== ""
            ? Number(yearRaw)
            : Number.NaN;
        if (studentId === "" || term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "Query parameters studentId, term, and year are required for charge updates.",
            });
            return;
        }
        const parsed = validatePutChargeBody(req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const ok = await verifyManualChargeForStudentTerm(id, studentId, term, year);
        if (!ok) {
            res.status(400).json({
                error: "Charge not found, not manual, or does not belong to this student and quarter.",
            });
            return;
        }
        await putAdminFinanceCharge(id, parsed.data);
        res.json({ ok: true });
    }
    catch (e) {
        const status = e instanceof Error && e.statusCode;
        if (status === 400) {
            res.status(400).json({ error: e instanceof Error ? e.message : "Bad request" });
            return;
        }
        console.error("[admin/finance/charge put]", e);
        const body = {
            error: "Failed to update charge",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * DELETE /api/admin/finance/charge/:id
 */
export async function deleteAdminFinanceChargeByIdHandler(req, res) {
    try {
        const id = parsePositiveIntParam(req.params.id);
        if (id == null) {
            res.status(400).json({ error: "Invalid charge id." });
            return;
        }
        const studentId = typeof req.query.studentId === "string" ? req.query.studentId.trim() : "";
        const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
        const yearRaw = req.query.year;
        const year = typeof yearRaw === "string" && yearRaw.trim() !== ""
            ? Number(yearRaw)
            : Number.NaN;
        if (studentId === "" || term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "Query parameters studentId, term, and year are required for charge deletes.",
            });
            return;
        }
        const ok = await verifyManualChargeForStudentTerm(id, studentId, term, year);
        if (!ok) {
            res.status(400).json({
                error: "Charge not found, not manual, or does not belong to this student and quarter.",
            });
            return;
        }
        await deleteAdminFinanceCharge(id);
        res.json({ ok: true });
    }
    catch (e) {
        const status = e instanceof Error && e.statusCode;
        if (status === 400) {
            res.status(400).json({ error: e instanceof Error ? e.message : "Bad request" });
            return;
        }
        console.error("[admin/finance/charge delete]", e);
        const body = {
            error: "Failed to delete charge",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * PUT /api/admin/finance/payment/:id
 */
export async function putAdminFinancePaymentByIdHandler(req, res) {
    try {
        const id = parsePositiveIntParam(req.params.id);
        if (id == null) {
            res.status(400).json({ error: "Invalid payment id." });
            return;
        }
        const studentId = typeof req.query.studentId === "string" ? req.query.studentId.trim() : "";
        const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
        const yearRaw = req.query.year;
        const year = typeof yearRaw === "string" && yearRaw.trim() !== ""
            ? Number(yearRaw)
            : Number.NaN;
        if (studentId === "" || term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "Query parameters studentId, term, and year are required for payment updates.",
            });
            return;
        }
        const parsed = validatePutPaymentBody(req.body);
        if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const vok = await verifyPaymentForStudentTerm(id, studentId, term, year);
        if (!vok) {
            res.status(400).json({
                error: "Payment not found or does not belong to this student and quarter.",
            });
            return;
        }
        await putAdminFinancePayment(id, parsed.data);
        res.json({ ok: true });
    }
    catch (e) {
        const status = e instanceof Error && e.statusCode;
        if (status === 400) {
            res.status(400).json({ error: e instanceof Error ? e.message : "Bad request" });
            return;
        }
        console.error("[admin/finance/payment put]", e);
        const body = {
            error: "Failed to update payment",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
/**
 * DELETE /api/admin/finance/payment/:id
 */
export async function deleteAdminFinancePaymentByIdHandler(req, res) {
    try {
        const id = parsePositiveIntParam(req.params.id);
        if (id == null) {
            res.status(400).json({ error: "Invalid payment id." });
            return;
        }
        const studentId = typeof req.query.studentId === "string" ? req.query.studentId.trim() : "";
        const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
        const yearRaw = req.query.year;
        const year = typeof yearRaw === "string" && yearRaw.trim() !== ""
            ? Number(yearRaw)
            : Number.NaN;
        if (studentId === "" || term === "" || !Number.isFinite(year)) {
            res.status(400).json({
                error: "Query parameters studentId, term, and year are required for payment deletes.",
            });
            return;
        }
        const vok = await verifyPaymentForStudentTerm(id, studentId, term, year);
        if (!vok) {
            res.status(400).json({
                error: "Payment not found or does not belong to this student and quarter.",
            });
            return;
        }
        await deleteAdminFinancePayment(id);
        res.json({ ok: true });
    }
    catch (e) {
        const status = e instanceof Error && e.statusCode;
        if (status === 400) {
            res.status(400).json({ error: e instanceof Error ? e.message : "Bad request" });
            return;
        }
        console.error("[admin/finance/payment delete]", e);
        const body = {
            error: "Failed to delete payment",
        };
        if (env.nodeEnv === "development")
            body.message = devMessage(e);
        res.status(500).json(body);
    }
}
//# sourceMappingURL=adminFinanceController.js.map
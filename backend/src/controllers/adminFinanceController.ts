import type { Request, Response } from "express";
import { env } from "../config/env.js";
import {
  getAdminFinanceLedger,
  getAdminFinanceQuarters,
  listAdminFinanceStudents,
  postAdminFinanceCharge,
  postAdminFinancePayment,
  validatePostChargeBody,
  validatePostPaymentBody,
} from "../services/adminFinanceService.js";

function devMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

/**
 * GET /api/admin/finance/students
 */
export async function getAdminFinanceStudents(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const students = await listAdminFinanceStudents();
    res.json({ students });
  } catch (e) {
    console.error("[admin/finance/students]", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load finance student list",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

/**
 * GET /api/admin/finance/:studentId/quarters
 */
export async function getAdminFinanceQuartersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const studentId = pathStudentId(req);
    if (studentId === "") {
      res.status(400).json({ error: "Missing studentId" });
      return;
    }
    const payload = await getAdminFinanceQuarters(studentId);
    res.json(payload);
  } catch (e) {
    console.error("[admin/finance/quarters]", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load quarters",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

/**
 * GET /api/admin/finance/:studentId/ledger?term=&year=
 */
export async function getAdminFinanceLedgerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const studentId = pathStudentId(req);
    if (studentId === "") {
      res.status(400).json({ error: "Missing studentId" });
      return;
    }
    const termRaw = req.query.term;
    const yearRaw = req.query.year;
    const term =
      typeof termRaw === "string" && termRaw.trim() !== ""
        ? termRaw.trim()
        : "";
    const yearNum =
      typeof yearRaw === "string" && yearRaw.trim() !== ""
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
  } catch (e) {
    console.error("[admin/finance/ledger]", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load ledger",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

/**
 * POST /api/admin/finance/charge
 */
export async function postAdminFinanceChargeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const parsed = validatePostChargeBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    await postAdminFinanceCharge(parsed.data);
    res.json({ ok: true });
  } catch (e) {
    console.error("[admin/finance/charge]", e);
    const body: { error: string; message?: string } = {
      error: "Failed to post charge",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

/**
 * POST /api/admin/finance/payment
 */
export async function postAdminFinancePaymentHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const parsed = validatePostPaymentBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    await postAdminFinancePayment(parsed.data);
    res.json({ ok: true });
  } catch (e) {
    console.error("[admin/finance/payment]", e);
    const body: { error: string; message?: string } = {
      error: "Failed to record payment",
    };
    if (env.nodeEnv === "development") body.message = devMessage(e);
    res.status(500).json(body);
  }
}

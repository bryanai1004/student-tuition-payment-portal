import type { Request, Response } from "express";
import {
  getAccountingLedgerPayload,
  getAccountingQuartersPayload,
} from "../services/studentLedgerService.js";

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export async function getAccountingQuarters(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const studentId = pathStudentId(req);
    const payload = await getAccountingQuartersPayload(studentId);
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load accounting quarters" });
  }
}

export async function getAccountingLedger(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const studentId = pathStudentId(req);
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

    const payload = await getAccountingLedgerPayload(studentId, term, year, {
      studentPortalLedgerPresentation: true,
    });
    if (!payload) {
      res.status(400).json({ error: "Invalid term or year" });
      return;
    }

    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load accounting ledger" });
  }
}

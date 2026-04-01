import type { Request, Response } from "express";
import { buildActivityRows } from "../services/activityView.js";
import { getCatalogDemoAccountPayload } from "../services/demoAccountService.js";
import { getStudentAccountPayload } from "../services/studentAccountService.js";

function termFromQuery(req: Request): string {
  const t = req.query.term;
  return typeof t === "string" && t ? t : "Fall";
}

function yearFromQuery(req: Request): number {
  const y = req.query.year;
  const n = typeof y === "string" ? Number(y) : Number.NaN;
  return Number.isFinite(n) ? n : 2026;
}

function pathStudentId(req: Request): string {
  const v = req.params.studentId;
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export async function getStudentAccount(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const term = termFromQuery(req);
    const year = yearFromQuery(req);
    const sid = pathStudentId(req);
    console.debug(
      "[account-debug] getStudentAccount",
      JSON.stringify({ studentId: sid, term, year }),
    );
    const payload = await getStudentAccountPayload(sid, term, year);
    if (!payload) {
      res.status(404).json({ error: "Student term account not found" });
      return;
    }
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
}

export async function getStudentActivity(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const term = termFromQuery(req);
    const year = yearFromQuery(req);
    const payload = await getStudentAccountPayload(
      pathStudentId(req),
      term,
      year,
    );
    if (!payload) {
      res.status(404).json({ error: "Student term account not found" });
      return;
    }
    res.json({ rows: buildActivityRows(payload) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load activity" });
  }
}

export function getDemoAccount(req: Request, res: Response): void {
  try {
    const term = termFromQuery(req);
    const year = yearFromQuery(req);
    const payload = getCatalogDemoAccountPayload(term, year);
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load account" });
  }
}

export function getDemoActivity(req: Request, res: Response): void {
  try {
    const term = termFromQuery(req);
    const year = yearFromQuery(req);
    const payload = getCatalogDemoAccountPayload(term, year);
    res.json({ rows: buildActivityRows(payload) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load activity" });
  }
}

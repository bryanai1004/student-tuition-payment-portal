import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { listAdminInstructors } from "../services/adminInstructorService.js";

function devMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

/**
 * GET /api/admin/instructors
 */
export async function getAdminInstructorsHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const instructors = await listAdminInstructors();
    res.json(instructors);
  } catch (e) {
    console.error("[admin/instructors] list failed:", e);
    const body: { error: string; message?: string } = {
      error: "Failed to load instructors",
    };
    if (env.nodeEnv === "development") {
      body.message = devMessage(e);
    }
    res.status(500).json(body);
  }
}

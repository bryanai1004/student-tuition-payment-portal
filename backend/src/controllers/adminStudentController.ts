import type { Request, Response } from "express";
import { listAdminStudents } from "../services/adminStudentService.js";

export async function getAdminStudents(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const students = await listAdminStudents();
    res.json({ students });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load students" });
  }
}

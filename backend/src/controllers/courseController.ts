import type { Request, Response } from "express";
import { listCoursesFromMysql } from "../repositories/courseRepository.js";

export async function getCourses(_req: Request, res: Response): Promise<void> {
  try {
    const courses = await listCoursesFromMysql();
    res.json(courses);
  } catch (e) {
    console.error("[courses]", e);
    res.status(500).json({ error: "Failed to load courses" });
  }
}

import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import { loadAccountContext } from "../repositories/studentAccountRepository.js";
import type { StudentAccountPayload } from "../types/studentAccount.js";
import { getCatalogDemoAccountPayload } from "./demoAccountService.js";
import { assembleStudentAccountPayload } from "./studentAccountAssembler.js";

export async function getStudentAccountPayload(
  studentId: string,
  term: string,
  year: number,
): Promise<StudentAccountPayload | null> {
  try {
    const ctx = await loadAccountContext(pool, studentId, term, year);
    if (ctx) {
      return assembleStudentAccountPayload(ctx);
    }
  } catch (err) {
    if (studentId !== DEMO_STUDENT_ID) {
      throw err;
    }
    console.warn(
      "[billing] MySQL error for demo-student — using catalog fallback:",
      (err as Error).message,
    );
  }
  if (studentId === DEMO_STUDENT_ID) {
    return getCatalogDemoAccountPayload(term, year);
  }
  return null;
}

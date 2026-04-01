import { DEMO_STUDENT_ID } from "../config/constants.js";
import { pool } from "../lib/db.js";
import {
  findLatestLegacyTermYear,
  loadLegacyAccountSnapshot,
} from "../repositories/studentLegacyAccountRepository.js";
import {
  findLatestTermYearForStudent,
  loadAccountContext,
} from "../repositories/studentAccountRepository.js";
import type { StudentAccountPayload } from "../types/studentAccount.js";
import { getCatalogDemoAccountPayload } from "./demoAccountService.js";
import { assembleLegacyMinimalStudentAccountPayload } from "./studentLegacyAccountAssembler.js";
import { assembleStudentAccountPayload } from "./studentAccountAssembler.js";

export type AccountTermYearInput =
  | { mode: "explicit"; term: string; year: number }
  | { mode: "auto" };

async function getDemoStudentAccountPayload(
  studentId: string,
  termYear: AccountTermYearInput,
): Promise<StudentAccountPayload | null> {
  let term: string;
  let year: number;

  if (termYear.mode === "explicit") {
    term = termYear.term;
    year = termYear.year;
  } else {
    const latest = await findLatestTermYearForStudent(pool, studentId);
    if (!latest) {
      return getCatalogDemoAccountPayload("Fall", 2026);
    }
    term = latest.term;
    year = latest.year;
  }

  console.debug(
    "[account-debug] getStudentAccountPayload (demo) input",
    JSON.stringify({ studentId, term, year, mode: termYear.mode }),
  );

  try {
    const ctx = await loadAccountContext(pool, studentId, term, year);
    if (ctx) {
      return assembleStudentAccountPayload(ctx);
    }
  } catch (err) {
    console.warn(
      "[billing] MySQL error for demo-student — using catalog fallback:",
      (err as Error).message,
    );
  }
  return getCatalogDemoAccountPayload(term, year);
}

async function getRealStudentAccountPayload(
  studentId: string,
  termYear: AccountTermYearInput,
): Promise<StudentAccountPayload | null> {
  let term: string;
  let year: number;

  if (termYear.mode === "explicit") {
    term = termYear.term;
    year = termYear.year;
  } else {
    const latest = await findLatestLegacyTermYear(pool, studentId);
    if (!latest) {
      console.debug(
        "[account-debug] getStudentAccountPayload: no legacy registration for auto term",
        JSON.stringify({ studentId }),
      );
      return null;
    }
    term = latest.term;
    year = latest.year;
  }

  console.debug(
    "[account-debug] getStudentAccountPayload (legacy) input",
    JSON.stringify({ studentId, term, year, mode: termYear.mode }),
  );

  const snap = await loadLegacyAccountSnapshot(pool, studentId, term, year);
  if (!snap) {
    return null;
  }
  return assembleLegacyMinimalStudentAccountPayload(snap);
}

export async function getStudentAccountPayload(
  studentId: string,
  termYear: AccountTermYearInput,
): Promise<StudentAccountPayload | null> {
  if (studentId === DEMO_STUDENT_ID) {
    return getDemoStudentAccountPayload(studentId, termYear);
  }
  return getRealStudentAccountPayload(studentId, termYear);
}
